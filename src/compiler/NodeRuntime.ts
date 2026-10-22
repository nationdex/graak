import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { getTargetMetadata, RuntimeError } from "../structures";
import { compareVersions } from "./ProjectCollector";

/** Node.js >= 20.12 is required for SEA assets (`sea.getAsset`). */
export const MIN_SEA_NODE_VERSION = "20.12.0";
export const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const DIST_URL = "https://nodejs.org/dist";
/** A release version as nodejs.org publishes it. It becomes a directory name and a URL path, so nothing else is accepted. */
const RELEASE_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
/** An `index.json` file key such as `linux-x64` or `win-x64-exe`: a directory name, so letters, digits and dashes only. */
const RELEASE_FILE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

interface DistRelease {
	version: string;
	files: string[];
	lts: string | false;
}

export class NodeRuntime {
	public static cacheDir(): string {
		if (process.env.GRAAK_CACHE) return process.env.GRAAK_CACHE;
		if (process.platform === "win32" && process.env.LOCALAPPDATA) {
			return join(process.env.LOCALAPPDATA, "graak", "cache");
		}
		return join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "graak");
	}

	/** index.json key of an official runtime that runs on this host. */
	public static hostFileKey(): string | null {
		const arch = { x64: "x64", arm64: "arm64", arm: "armv7l", ia32: "x86" }[process.arch as string];
		if (!arch) return null;
		if (process.platform === "linux") return arch === "x86" ? null : `linux-${arch}`;
		if (process.platform === "darwin") return `osx-${arch}-tar`;
		if (process.platform === "win32") return `win-${arch}-exe`;
		return null;
	}

	public static canRunOnHost(target: unknown): boolean {
		const meta = getTargetMetadata(target);
		return (
			meta !== null && meta.nodePlatform === process.platform && meta.nodeArch === process.arch && meta.os !== "ios-ish"
		);
	}

	/**
	 * Reads the Node.js version embedded in a runtime binary. The binary is only read, never run: it may be a file the
	 * user pointed at, or one built for another platform, and running it to ask its version is not worth either risk.
	 */
	public static readVersion(binaryPath: string): string | null {
		const content = readFileSync(binaryPath).toString("latin1");
		const match =
			/nodejs\.org\/download\/release\/v(\d+\.\d+\.\d+)\//.exec(content) ??
			/node-v(\d+\.\d+\.\d+)\.tar\.gz/.exec(content);
		return match ? match[1] : null;
	}

	/** "absent" | "ready" (fuse unflipped) | "injected" (already a SEA). */
	public static seaFuseState(binary: Buffer): "absent" | "ready" | "injected" {
		const at = binary.indexOf(SEA_FUSE, 0, "latin1");
		if (at === -1) return "absent";
		return binary[at + SEA_FUSE.length + 1] === 0x31 ? "injected" : "ready";
	}

	private static async fetchBuffer(url: string): Promise<Buffer> {
		if (!url.startsWith(`${DIST_URL}/`))
			throw new RuntimeError(`Refusing to download from outside ${DIST_URL}: ${url}`);
		const res = await fetch(url);
		if (!res.ok) throw new RuntimeError(`Download failed (${res.status}) for ${url}`);
		return Buffer.from(await res.arrayBuffer());
	}

	/**
	 * Picks the newest official release that ships `fileKey` and satisfies `minNode`.
	 * `requested` may be a full version ("22.11.0") or a major ("22").
	 */
	public static async resolveOfficialVersion(
		fileKey: string,
		requested?: string | null,
		minNode?: string | null
	): Promise<string> {
		const index = JSON.parse(
			(await NodeRuntime.fetchBuffer(`${DIST_URL}/index.json`)).toString("utf-8")
		) as DistRelease[];

		const wanted = requested?.replace(/^v/, "");
		const floor = [MIN_SEA_NODE_VERSION, minNode ?? "0.0.0"].sort(compareVersions)[1];

		const match = index
			.map((r) => ({ ...r, version: r.version.replace(/^v/, "") }))
			.filter((r) => RELEASE_VERSION.test(r.version))
			.filter((r) => r.files.includes(fileKey))
			.filter((r) => compareVersions(r.version, floor) >= 0)
			.filter((r) => (wanted ? r.version === wanted || r.version.startsWith(`${wanted}.`) : r.lts !== false))
			.sort((a, b) => compareVersions(b.version, a.version))[0];

		if (!match) {
			throw new RuntimeError(
				`No official Node.js release provides '${fileKey}'` +
					(wanted ? ` for version '${wanted}'` : "") +
					` (>= ${floor}). Pass --node-binary instead.`
			);
		}
		return match.version;
	}

	/**
	 * Downloads (once) and verifies an official Node.js runtime, returning the binary path.
	 */
	public static async ensureOfficial(version: string, fileKey: string): Promise<string> {
		if (!RELEASE_VERSION.test(version) || !RELEASE_FILE_KEY.test(fileKey)) {
			throw new RuntimeError(`Not a Node.js release version and file key: '${version}', '${fileKey}'`);
		}
		const isWindows = fileKey.startsWith("win-");
		const dir = join(NodeRuntime.cacheDir(), "node", `v${version}`, fileKey);
		const binary = join(dir, isWindows ? "node.exe" : "node");
		if (existsSync(binary)) return binary;

		let remotePath: string;
		let innerPath: string | null = null;
		if (isWindows) {
			remotePath = `${fileKey.replace(/-exe$/, "")}/node.exe`;
		} else {
			const platform = fileKey.replace(/^osx-/, "darwin-").replace(/-tar$/, "");
			const folder = `node-v${version}-${platform}`;
			remotePath = `${folder}.tar.gz`;
			innerPath = `${folder}/bin/node`;
		}

		const base = `${DIST_URL}/v${version}`;
		const sums = (await NodeRuntime.fetchBuffer(`${base}/SHASUMS256.txt`)).toString("utf-8");
		const expected = sums
			.split("\n")
			.map((line) => line.trim().split(/\s+/))
			.find(([, file]) => file === remotePath)?.[0];
		if (!expected) throw new RuntimeError(`No checksum published for ${remotePath}`);

		const download = await NodeRuntime.fetchBuffer(`${base}/${remotePath}`);
		const actual = createHash("sha256").update(download).digest("hex");
		if (actual !== expected) {
			throw new RuntimeError(`Checksum mismatch for ${remotePath}: expected ${expected}, got ${actual}`);
		}

		const content = innerPath ? NodeRuntime.extractFromTarGz(download, innerPath) : download;
		mkdirSync(dir, { recursive: true });
		const tmp = `${binary}.${process.pid}.tmp`;
		writeFileSync(tmp, content);
		if (!isWindows) chmodSync(tmp, 0o755);
		renameSync(tmp, binary);
		return binary;
	}

	public static extractFromTarGz(archive: Buffer, wanted: string): Buffer {
		const tar = gunzipSync(archive);
		let offset = 0;
		let longName: string | null = null;

		while (offset + 512 <= tar.length) {
			const header = tar.subarray(offset, offset + 512);
			if (header.every((b) => b === 0)) break;

			const field = (start: number, len: number) => header.toString("utf-8", start, start + len).replace(/\0.*$/s, "");
			const size = Number.parseInt(field(124, 12).trim() || "0", 8);
			const type = field(156, 1);
			const prefix = field(345, 155);
			let name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
			longName = null;

			const dataStart = offset + 512;
			const data = tar.subarray(dataStart, dataStart + size);
			offset = dataStart + Math.ceil(size / 512) * 512;

			if (type === "L") {
				longName = data.toString("utf-8").replace(/\0.*$/s, "");
				continue;
			}
			if (type === "x") {
				const path = /\d+ path=([^\n]*)\n/.exec(data.toString("utf-8"));
				if (path) longName = path[1];
				continue;
			}
			name = name.replace(/^\.\//, "");
			if (name === wanted && (type === "0" || type === "")) return Buffer.from(data);
		}
		throw new RuntimeError(`'${wanted}' not found in downloaded archive`);
	}
}
