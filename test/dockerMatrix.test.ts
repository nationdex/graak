import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";

/*
 * Runs the shipped native hosts inside each emulated environment of test/docker/compose.yaml and checks that the
 * runtime self-test passes there. The services themselves are pinned: the Alpine images by digest for each
 * architecture, the Windows versions by the version string Wine reports. macOS and Termux have no service: they cannot
 * run in a Linux container, see the header of that file.
 */

const compose = join(process.cwd(), "test/docker/compose.yaml");
const hosts = join(process.cwd(), "quickjs/prebuilt/hosts");

const dockerReady =
	spawnSync("docker", ["compose", "version"]).status === 0 && spawnSync("docker", ["info"]).status === 0;

/** The Wine services keep their prefixes in named volumes; two runs at once would corrupt one, so they take turns. */
function withWineLock<T>(run: () => T): T {
	const lock = join(tmpdir(), "graak-wine-compose.lock");
	const deadline = Date.now() + 40 * 60_000;
	for (;;) {
		try {
			mkdirSync(lock);
			break;
		} catch {
			try {
				// A lock older than any single run was left by a crashed process: take it over.
				if (Date.now() - statSync(lock).mtimeMs > 20 * 60_000) rmSync(lock, { recursive: true, force: true });
			} catch {
				// Released meanwhile.
			}
			if (Date.now() > deadline) throw new Error("timed out waiting for the Wine compose lock");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
		}
	}
	try {
		return run();
	} finally {
		rmSync(lock, { recursive: true, force: true });
	}
}

const wineSelftest = (exe: string) =>
	`wineboot -u >/dev/null 2>&1; wineserver -w; wine /w/${exe} 'Z:\\graak\\quickjs\\runtime\\node-compat.js' 'Z:\\graak\\quickjs\\runtime\\selftest.js'`;

const cases: Array<{ service: string; host: string; exe: string; command: string[] }> = [
	{
		service: "alpine-x64",
		host: "linux-x64.gz",
		exe: "graak-linux-x64",
		command: ["/w/graak-linux-x64", "/graak/quickjs/runtime/node-compat.js", "/graak/quickjs/runtime/selftest.js"],
	},
	{
		service: "alpine-i386",
		host: "linux-x86.gz",
		exe: "graak-linux-x86",
		command: ["/w/graak-linux-x86", "/graak/quickjs/runtime/node-compat.js", "/graak/quickjs/runtime/selftest.js"],
	},
	{
		service: "win7",
		host: "win-x64.gz",
		exe: "graak-win-x64.exe",
		command: ["sh", "-c", wineSelftest("graak-win-x64.exe")],
	},
	{
		service: "vista",
		host: "win-x64.gz",
		exe: "graak-win-x64.exe",
		command: ["sh", "-c", wineSelftest("graak-win-x64.exe")],
	},
	{
		service: "xp",
		host: "win-xp-x86.gz",
		exe: "graak-win-xp.exe",
		command: ["sh", "-c", wineSelftest("graak-win-xp.exe")],
	},
];

for (const { service, host, exe, command } of cases) {
	test(`the native host passes its self-test under ${service} (docker compose)`, {
		skip: !dockerReady && "docker compose is not available",
		timeout: 900_000,
	}, () => {
		// The host is decompressed into a scratch directory the service mounts at /w; the runtime comes from the repo.
		const dir = mkdtempSync(join(tmpdir(), "graak-matrix-"));
		writeFileSync(join(dir, exe), gunzipSync(readFileSync(join(hosts, host))), { mode: 0o755 });
		const env: NodeJS.ProcessEnv = { ...process.env, GRAAK_MATRIX_DIR: dir };
		delete env.FORCE_COLOR;
		const launch = () =>
			spawnSync("docker", ["compose", "-f", compose, "run", "--rm", service, ...command], {
				encoding: "utf-8",
				env,
				timeout: 850_000,
			});
		const run = service === "alpine-x64" || service === "alpine-i386" ? launch() : withWineLock(launch);
		const out = `${run.stdout}${run.stderr}`;
		assert.equal(run.status, 0, out);
		assert.match(out, /selftest: (\d+)\/\1 passed/, out);
	});
}
