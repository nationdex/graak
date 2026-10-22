import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	QUICKJS_TARGET_ASSETS,
	QUICKJS_VERSION,
	QUICKJS_VISTA_ONLY_IMPORTS,
	QuickJsRuntime,
	TargetDevice,
} from "../dist/index.js";

async function withFetch<T>(handler: (url: string) => Response, fn: () => Promise<T>): Promise<T> {
	const original = globalThis.fetch;
	// @ts-expect-error test-only stub
	globalThis.fetch = (url: string) => handler(String(url));
	try {
		return await fn();
	} finally {
		globalThis.fetch = original;
	}
}

async function withIsolatedCache<T>(fn: () => Promise<T>): Promise<T> {
	const previous = process.env.GRAAK_CACHE;
	process.env.GRAAK_CACHE = mkdtempSync(join(tmpdir(), "graak-qjs-cache-"));
	try {
		return await fn();
	} finally {
		if (previous === undefined) delete process.env.GRAAK_CACHE;
		else process.env.GRAAK_CACHE = previous;
	}
}

function response(body: Buffer): Response {
	// A real Response, with a body that can be streamed, as fetch returns.
	return new Response(new Uint8Array(body), { status: 200 });
}

test("every mapped quickjs-ng asset carries a pinned checksum", () => {
	const entries = Object.entries(QUICKJS_TARGET_ASSETS);
	assert.ok(entries.length > 0);
	for (const [target, asset] of entries) {
		assert.ok(asset, target);
		// quickjs-ng publishes no SHASUMS file, so an unpinned asset means nothing vouches for
		// the bytes. Downloading an executable on that basis is what RuntimeRegistry refuses.
		assert.match(asset.sha256 ?? "", /^[0-9a-f]{64}$/, `${target} must pin a SHA-256`);
	}
});

test("32-bit targets Node.js cannot serve do have a quickjs-ng engine", () => {
	// The point of the engine: Node's last 32-bit Linux build is an unofficial 12.16.3, and
	// Windows 7 tops out at 12.22.12, both far below current discord.js. quickjs-ng publishes
	// current builds for exactly these.
	for (const target of [TargetDevice.LinuxX86, TargetDevice.WinLegacyX86, TargetDevice.WinVistaX86]) {
		const asset = QuickJsRuntime.assetFor(target);
		assert.ok(asset, `${target} should map to a published engine`);
	}
});

test("download URLs point at the pinned release", () => {
	const url = QuickJsRuntime.downloadUrl("qjs-linux-x86");
	assert.equal(url, `https://github.com/quickjs-ng/quickjs/releases/download/${QUICKJS_VERSION}/qjs-linux-x86`);
});

test("a failed download is reported rather than cached as an empty engine", async () => {
	await withIsolatedCache(() =>
		withFetch(
			() => ({ ok: false, status: 404 }) as Response,
			async () => {
				await assert.rejects(QuickJsRuntime.ensure(TargetDevice.LinuxX86), /Download failed \(404\)/);
			}
		)
	);
});

test("an engine that fails verification is never written to the cache", async () => {
	// The safety property that matters: a mismatch must leave nothing behind, or the next build
	// would find the bad file already cached and trust it.
	await withIsolatedCache(async () => {
		let attempts = 0;
		await withFetch(
			() => {
				attempts++;
				return response(Buffer.from("tampered"));
			},
			async () => {
				await assert.rejects(QuickJsRuntime.ensure(TargetDevice.LinuxX86), /Checksum mismatch/);
				await assert.rejects(QuickJsRuntime.ensure(TargetDevice.LinuxX86), /Checksum mismatch/);
			}
		);
		assert.equal(attempts, 2, "a rejected engine must not be served from the cache on the next call");
	});
});

test("ensure rejects a download whose bytes do not match the pin", async () => {
	await withIsolatedCache(() =>
		withFetch(
			() => response(Buffer.from("not the real engine")),
			async () => {
				await assert.rejects(QuickJsRuntime.ensure(TargetDevice.LinuxX86), /Checksum mismatch/);
			}
		)
	);
});

test("ensure caches a verified engine and does not re-download it", async () => {
	const payload = Buffer.from("pretend engine binary");
	const sha256 = createHash("sha256").update(payload).digest("hex");
	let downloads = 0;

	await withIsolatedCache(() =>
		withFetch(
			() => {
				downloads++;
				return response(payload);
			},
			async () => {
				const first = await QuickJsRuntime.ensure(TargetDevice.LinuxX86, { sha256 });
				const second = await QuickJsRuntime.ensure(TargetDevice.LinuxX86, { sha256 });
				assert.equal(first, second);
				assert.equal(downloads, 1, "a cached engine must not be fetched again");
			}
		)
	);
});

test("a target with no published build says so instead of guessing", async () => {
	await assert.rejects(QuickJsRuntime.ensure(TargetDevice.FreeBsdX86), /publishes no prebuilt engine for freebsd-x86/);
});

test("windowsFloor reads the imports, not the PE header's declared version", () => {
	const dir = mkdtempSync(join(tmpdir(), "graak-qjs-pe-"));

	// The published 32-bit build declares subsystem 4.0 yet imports Vista-only functions, so the
	// header alone would put it on Windows 95. The imports are what decide.
	const vistaBuild = join(dir, "vista.exe");
	writeFileSync(vistaBuild, `MZ${"\0".repeat(64)}KERNEL32.dll\0${QUICKJS_VISTA_ONLY_IMPORTS.join("\0")}\0`);
	assert.equal(QuickJsRuntime.windowsFloor(vistaBuild), "vista");

	// The same engine with its JS_HAVE_THREADS block compiled out has none of them, which is what
	// an XP-capable build has to look like.
	const xpBuild = join(dir, "xp.exe");
	writeFileSync(xpBuild, `MZ${"\0".repeat(64)}KERNEL32.dll\0EnterCriticalSection\0`);
	assert.equal(QuickJsRuntime.windowsFloor(xpBuild), "xp");

	const notWindows = join(dir, "elf");
	writeFileSync(notWindows, "\x7fELF\0\0\0");
	assert.equal(QuickJsRuntime.windowsFloor(notWindows), null);
});

test("the Vista-only import list is the exact set an XP build has to remove", () => {
	// All four come from one block in the engine's cutils.h, guarded by JS_HAVE_THREADS. Keeping
	// the list here is what makes "XP needs one block changed, not a port" a checkable claim.
	assert.deepEqual([...QUICKJS_VISTA_ONLY_IMPORTS].sort(), [
		"InitOnceExecuteOnce",
		"InitializeConditionVariable",
		"SleepConditionVariableCS",
		"WakeConditionVariable",
	]);
});

/**
 * Behavioural checks for the Node compatibility layer, run against a real quickjs-ng engine.
 *
 * Skipped when no engine is on PATH (set GRAAK_QJS to point at one, or `qjs`), because the
 * binary is not a build dependency. The same selftest is also run against Node below, which is
 * what makes a pass meaningful: the file is not tailored to either runtime.
 */
function findEngine(): string | null {
	const explicit = process.env.GRAAK_QJS;
	if (explicit && existsSync(explicit)) return explicit;
	const result = spawnSync("sh", ["-c", "command -v qjs"], { encoding: "utf-8" });
	const found = result.stdout.trim();
	if (found) return found;
	// Built from the quickjs-ng sources the native host build fetched (see the README's testing notes).
	const cached = join(homedir(), ".cache/graak/tools/qjs");
	return existsSync(cached) ? cached : null;
}

const engine = findEngine();

test("the Node compatibility layer behaves the same on quickjs-ng as on Node", {
	skip: engine ? false : "no qjs engine found",
}, () => {
	const selftest = join(process.cwd(), "quickjs/runtime/selftest.js");
	const compat = join(process.cwd(), "quickjs/runtime/node-compat.js");

	const onQuickjs = spawnSync(engine as string, ["-m", compat, selftest], { encoding: "utf-8" });
	const onNode = spawnSync(process.execPath, [selftest], { encoding: "utf-8" });

	const summary = (out: string) => out.trim().split("\n").pop() ?? "";
	assert.match(summary(onNode.stdout), /selftest: (\d+)\/\1 passed/, `Node baseline failed:\n${onNode.stdout}`);
	assert.equal(
		summary(onQuickjs.stdout),
		summary(onNode.stdout),
		`quickjs-ng must match Node exactly:\n${onQuickjs.stdout}${onQuickjs.stderr}`
	);
});

test("modules needing a socket are real with a native layer and explicit without one", () => {
	const source = readFileSync(join(process.cwd(), "quickjs/runtime/node-compat.js"), "utf-8");
	// The property that matters is not that these are unimplemented -- they are implemented now --
	// but that they are never quietly stubbed: with a native layer they are real, and without one
	// they say what is missing rather than half-working.
	for (const name of ["net", "tls", "http", "https", "crypto", "zlib"]) {
		assert.match(
			source,
			new RegExp(`\\b${name}: nativeModules\\?\\.\\w+ \\?\\? notImplemented\\(`),
			`${name} must be native-backed with an explicit fallback`
		);
	}
	// http2 is built on first use from node-http2.js, with the same explicit fallback when there is no native layer.
	assert.match(source, /get http2\(\)/);
	assert.match(source, /createHttp2\(/);
	assert.match(source, /notImplemented\("http2"/);
	assert.ok(source.includes("__graakUnavailable"), "unavailable modules must stay detectable by the conformance tool");
});

/**
 * The C native host under `quickjs/native/` installs the `__graak_native` surface that
 * `native-modules.js` builds Node-shaped crypto/zlib/net/tls on top of. This checks the built
 * binary actually delivers what that layer expects, not just that it launches.
 *
 * Skipped unless a built backend is present, since it is not a build dependency: GRAAK_C
 * points at one, or it is looked for where `quickjs/native/build.sh` put it.
 */
function findBackend(): string | null {
	const bin = process.env.GRAAK_C ?? "";
	if (bin && existsSync(bin)) return bin;
	const cached = join(homedir(), ".cache/graak/native-host", `${process.platform}-${process.arch}`, "graak-c");
	return existsSync(cached) ? cached : null;
}

const backend = findBackend();

test("the native backend delivers real crypto, compression and TLS", {
	skip: backend ? false : "no native backend built",
}, () => {
	const selftest = join(process.cwd(), "quickjs/runtime/native-selftest.js");
	// A real program runs through the compatibility layer, so that is how the self-test runs too.
	const compat = join(process.cwd(), "quickjs/runtime/node-compat.js");
	const run = spawnSync(backend as string, [compat, selftest], { encoding: "utf-8", timeout: 60_000 });
	const output = run.stdout;

	// Known vectors, so the backend that quietly computes something else is caught rather
	// than merely producing bytes.
	assert.match(
		output,
		/sha256: ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad/,
		`sha256 must match the known vector\n${output}${run.stderr}`
	);
	assert.match(
		output,
		/createHmac sha256\s+: f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8/,
		`HMAC must match the RFC vector\n${output}`
	);
	assert.match(output, /zlib deflate\/inflate\s+: true/, `zlib must round-trip\n${output}`);
	// The whole point of the native layer: a Node-shaped tls.connect() reaching Discord.
	assert.match(output, /tls\.connect status\s+: HTTP\/1\.1 200 OK/, `TLS must work\n${output}${run.stderr}`);
});

test("native-modules.js goes through a single promise/value adapter", () => {
	const source = readFileSync(join(process.cwd(), "quickjs/runtime/native-modules.js"), "utf-8");
	// The C host's socket calls return values directly rather than promises. Every call is
	// wrapped through one adapter so the code above stays agnostic to that.
	assert.ok(source.includes("const settled ="), "a promise/value adapter must exist");
	assert.ok(
		!/native\.(write|close|connect|read)\([^)]*\)\.(then|catch)\(/.test(source),
		"native calls must go through it"
	);
});
