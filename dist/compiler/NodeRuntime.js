"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NodeRuntime = exports.SEA_FUSE = exports.MIN_SEA_NODE_VERSION = void 0;
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = require("node:path");
const node_zlib_1 = require("node:zlib");
const structures_1 = require("../structures");
const Download_1 = require("./Download");
const ProjectCollector_1 = require("./ProjectCollector");
/** Node.js >= 20.12 is required for SEA assets (`sea.getAsset`). */
exports.MIN_SEA_NODE_VERSION = "20.12.0";
exports.SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const DIST_URL = "https://nodejs.org/dist";
/** The largest official Node.js download (the macOS and Linux tarballs are well under half of this). */
const MAX_RUNTIME_DOWNLOAD = 512 * 1024 * 1024;
/** A release version as nodejs.org publishes it. It becomes a directory name and a URL path, so nothing else is accepted. */
const RELEASE_VERSION = /^\d{1,3}\.\d{1,3}\.\d{1,3}$/;
/** An `index.json` file key such as `linux-x64` or `win-x64-exe`: a directory name, so letters, digits and dashes only. */
const RELEASE_FILE_KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
class NodeRuntime {
    static cacheDir() {
        if (process.env.GRAAK_CACHE)
            return process.env.GRAAK_CACHE;
        if (process.platform === "win32" && process.env.LOCALAPPDATA) {
            return (0, node_path_1.join)(process.env.LOCALAPPDATA, "graak", "cache");
        }
        return (0, node_path_1.join)(process.env.XDG_CACHE_HOME ?? (0, node_path_1.join)((0, node_os_1.homedir)(), ".cache"), "graak");
    }
    /** index.json key of an official runtime that runs on this host. */
    static hostFileKey() {
        const arch = { x64: "x64", arm64: "arm64", arm: "armv7l", ia32: "x86" }[process.arch];
        if (!arch)
            return null;
        if (process.platform === "linux")
            return arch === "x86" ? null : `linux-${arch}`;
        if (process.platform === "darwin")
            return `osx-${arch}-tar`;
        if (process.platform === "win32")
            return `win-${arch}-exe`;
        return null;
    }
    static canRunOnHost(target) {
        const meta = (0, structures_1.getTargetMetadata)(target);
        return (meta !== null && meta.nodePlatform === process.platform && meta.nodeArch === process.arch && meta.os !== "ios-ish");
    }
    /**
     * Reads the Node.js version embedded in a runtime binary. The binary is only read, never run: it may be a file the
     * user pointed at, or one built for another platform, and running it to ask its version is not worth either risk.
     */
    static readVersion(binaryPath) {
        const content = (0, node_fs_1.readFileSync)(binaryPath).toString("latin1");
        const match = /nodejs\.org\/download\/release\/v(\d+\.\d+\.\d+)\//.exec(content) ??
            /node-v(\d+\.\d+\.\d+)\.tar\.gz/.exec(content);
        return match ? match[1] : null;
    }
    /** "absent" | "ready" (fuse unflipped) | "injected" (already a SEA). */
    static seaFuseState(binary) {
        const at = binary.indexOf(exports.SEA_FUSE, 0, "latin1");
        if (at === -1)
            return "absent";
        return binary[at + exports.SEA_FUSE.length + 1] === 0x31 ? "injected" : "ready";
    }
    static async fetchBuffer(url) {
        if (!url.startsWith(`${DIST_URL}/`))
            throw new structures_1.RuntimeError(`Refusing to download from outside ${DIST_URL}: ${url}`);
        const res = await fetch(url);
        if (!res.ok)
            throw new structures_1.RuntimeError(`Download failed (${res.status}) for ${url}`);
        return Buffer.from(await res.arrayBuffer());
    }
    /**
     * Picks the newest official release that ships `fileKey` and satisfies `minNode`.
     * `requested` may be a full version ("22.11.0") or a major ("22").
     */
    static async resolveOfficialVersion(fileKey, requested, minNode) {
        const index = JSON.parse((await NodeRuntime.fetchBuffer(`${DIST_URL}/index.json`)).toString("utf-8"));
        const wanted = requested?.replace(/^v/, "");
        const floor = [exports.MIN_SEA_NODE_VERSION, minNode ?? "0.0.0"].sort(ProjectCollector_1.compareVersions)[1];
        const match = index
            .map((r) => ({ ...r, version: r.version.replace(/^v/, "") }))
            .filter((r) => RELEASE_VERSION.test(r.version))
            .filter((r) => r.files.includes(fileKey))
            .filter((r) => (0, ProjectCollector_1.compareVersions)(r.version, floor) >= 0)
            .filter((r) => (wanted ? r.version === wanted || r.version.startsWith(`${wanted}.`) : r.lts !== false))
            .sort((a, b) => (0, ProjectCollector_1.compareVersions)(b.version, a.version))[0];
        if (!match) {
            throw new structures_1.RuntimeError(`No official Node.js release provides '${fileKey}'` +
                (wanted ? ` for version '${wanted}'` : "") +
                ` (>= ${floor}). Pass --node-binary instead.`);
        }
        return match.version;
    }
    /**
     * Downloads (once) and verifies an official Node.js runtime, returning the binary path.
     */
    static async ensureOfficial(version, fileKey) {
        if (!RELEASE_VERSION.test(version) || !RELEASE_FILE_KEY.test(fileKey)) {
            throw new structures_1.RuntimeError(`Not a Node.js release version and file key: '${version}', '${fileKey}'`);
        }
        const isWindows = fileKey.startsWith("win-");
        const dir = (0, node_path_1.join)(NodeRuntime.cacheDir(), "node", `v${version}`, fileKey);
        const binary = (0, node_path_1.join)(dir, isWindows ? "node.exe" : "node");
        if ((0, node_fs_1.existsSync)(binary))
            return binary;
        let remotePath;
        let innerPath = null;
        if (isWindows) {
            remotePath = `${fileKey.replace(/-exe$/, "")}/node.exe`;
        }
        else {
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
        if (!expected)
            throw new structures_1.RuntimeError(`No checksum published for ${remotePath}`);
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        // Streamed to disk and checked against the published checksum as it arrives; nothing unverified is ever kept.
        const downloaded = (0, node_path_1.join)(dir, `download-${process.pid}.${innerPath ? "tar.gz" : "exe"}`);
        await (0, Download_1.downloadToFile)(`${base}/${remotePath}`, downloaded, { maxBytes: MAX_RUNTIME_DOWNLOAD, sha256: expected });
        try {
            if (innerPath) {
                const tmp = `${binary}.${process.pid}.tmp`;
                (0, node_fs_1.writeFileSync)(tmp, NodeRuntime.extractFromTarGz((0, node_fs_1.readFileSync)(downloaded), innerPath));
                (0, node_fs_1.chmodSync)(tmp, 0o755);
                (0, node_fs_1.renameSync)(tmp, binary);
            }
            else {
                (0, node_fs_1.renameSync)(downloaded, binary);
            }
        }
        finally {
            (0, node_fs_1.rmSync)(downloaded, { force: true });
        }
        return binary;
    }
    static extractFromTarGz(archive, wanted) {
        const tar = (0, node_zlib_1.gunzipSync)(archive);
        let offset = 0;
        let longName = null;
        while (offset + 512 <= tar.length) {
            const header = tar.subarray(offset, offset + 512);
            if (header.every((b) => b === 0))
                break;
            const field = (start, len) => header.toString("utf-8", start, start + len).replace(/\0.*$/s, "");
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
                if (path)
                    longName = path[1];
                continue;
            }
            name = name.replace(/^\.\//, "");
            if (name === wanted && (type === "0" || type === ""))
                return Buffer.from(data);
        }
        throw new structures_1.RuntimeError(`'${wanted}' not found in downloaded archive`);
    }
}
exports.NodeRuntime = NodeRuntime;
//# sourceMappingURL=NodeRuntime.js.map