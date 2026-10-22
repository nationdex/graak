import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	ALL_TARGETS,
	BinaryPackager,
	PortablePackager,
	RuntimeRegistry,
	TARGET_METADATA_MAP,
	TargetDevice,
} from "../dist/index.js";

const TARGETS_WITH_WIN7_PIN = [TargetDevice.WinLegacyX86, TargetDevice.WinLegacyX64];
const TARGETS_WITH_VISTA_PIN = [TargetDevice.WinVistaX86, TargetDevice.WinVistaX64];
const TARGETS_WITH_PINNED_LEGACY_NODE = [...TARGETS_WITH_WIN7_PIN, ...TARGETS_WITH_VISTA_PIN];
const TARGETS_WITH_BOOTSTRAP = [TargetDevice.IosIshX86, TargetDevice.FreeBsdX86];

test("only Windows 7 targets pin Node.js 12.22.12", () => {
	for (const target of ALL_TARGETS) {
		const meta = TARGET_METADATA_MAP[target];
		if (TARGETS_WITH_WIN7_PIN.includes(target)) {
			assert.equal(meta.pinnedLegacyNode?.version, "12.22.12", target);
			assert.match(meta.pinnedLegacyNode!.fileKey, /^win-x(86|64)-exe$/, target);
			assert.match(meta.pinnedLegacyNode!.warning, /discord\.js/i, target);
		}
	}
});

test("only Windows Vista targets pin Node.js 5.12.0, older than the Windows 7 pin", () => {
	for (const target of ALL_TARGETS) {
		const meta = TARGET_METADATA_MAP[target];
		if (TARGETS_WITH_VISTA_PIN.includes(target)) {
			assert.equal(meta.pinnedLegacyNode?.version, "5.12.0", target);
			assert.match(meta.pinnedLegacyNode!.fileKey, /^win-x(86|64)-exe$/, target);
			assert.match(meta.pinnedLegacyNode!.warning, /Vista/i, target);
		}
	}
});

test("no other target carries a pinned legacy Node.js release", () => {
	for (const target of ALL_TARGETS) {
		const meta = TARGET_METADATA_MAP[target];
		if (!TARGETS_WITH_PINNED_LEGACY_NODE.includes(target)) {
			assert.equal(meta.pinnedLegacyNode, null, target);
		}
	}
});

test("only iSH and FreeBSD carry an on-device bootstrap install command", () => {
	for (const target of ALL_TARGETS) {
		const meta = TARGET_METADATA_MAP[target];
		if (TARGETS_WITH_BOOTSTRAP.includes(target)) {
			assert.ok(meta.bootstrapInstall, target);
			assert.ok(meta.bootstrapInstall!.command.length > 0, target);
		} else {
			assert.equal(meta.bootstrapInstall, null, target);
		}
	}
});

test("the iSH and FreeBSD portable launchers install Node.js themselves instead of just hinting", () => {
	for (const target of TARGETS_WITH_BOOTSTRAP) {
		const meta = TARGET_METADATA_MAP[target];
		const script = PortablePackager.unixLauncher(meta);
		const quoted = meta.bootstrapInstall!.command.map((arg: string) => `'${arg}'`).join(" ");
		assert.match(script, /^#!\/bin\/sh/);
		assert.ok(script.includes(quoted), `${target}: script must run its own bootstrap command`);
		assert.ok(!script.includes("was not found. "), `${target}: must not fall back to the plain hint-only message`);
	}
});

test("targets without a bootstrap command keep the plain hint-only launcher", () => {
	const meta = TARGET_METADATA_MAP[TargetDevice.LinuxX86];
	const script = PortablePackager.unixLauncher(meta);
	assert.ok(script.includes("Node.js was not found. "));
	assert.ok(!script.includes("apk"));
	assert.ok(!script.includes("pkg install"));
});

test("bootstrap commands are safely single-quoted for sh, and parse as valid POSIX shell", () => {
	for (const target of TARGETS_WITH_BOOTSTRAP) {
		const script = PortablePackager.unixLauncher(TARGET_METADATA_MAP[target]);
		const dir = mkdtempSync(join(tmpdir(), "graak-shcheck-"));
		const file = join(dir, "launcher.sh");
		writeFileSync(file, script);
		// `sh -n` only parses; it never executes apk/pkg, so this is safe on any host.
		assert.doesNotThrow(() => execFileSync("sh", ["-n", file], { stdio: "pipe" }), `${target}: must be valid POSIX sh`);
	}
});

/**
 * Keeps the mock installed for the entire async operation, not just until its first
 * `await` suspends — a plain synchronous try/finally around a call to an async `fn` tears
 * the mock down after the first internal await, silently letting any *later* fetch inside
 * `fn` (e.g. the actual file download after a checksum-file fetch) hit the real network.
 */
async function withFetch<T>(
	handler: (url: string) => Promise<Response> | Response,
	fn: () => Promise<T> | T
): Promise<T> {
	const original = globalThis.fetch;
	// @ts-expect-error test-only stub
	globalThis.fetch = (url: string) => handler(String(url));
	try {
		return await fn();
	} finally {
		globalThis.fetch = original;
	}
}

/**
 * Runs `fn` with GRAAK_CACHE pointed at a throwaway directory. `ensureOfficial` trusts
 * whatever is already on disk at that path without re-verifying it, and win-x86-exe/
 * win-x64-exe at version 12.22.12 is the *exact* real path a genuine `graak compile
 * --target win-legacy-x86` uses on this machine — writing synthetic test data there would
 * corrupt every future real build until the cache is cleared by hand.
 */
async function withIsolatedCache<T>(fn: () => Promise<T>): Promise<T> {
	const previous = process.env.GRAAK_CACHE;
	process.env.GRAAK_CACHE = mkdtempSync(join(tmpdir(), "graak-cache-"));
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

/**
 * A synthetic Windows PE that also carries the update-check URL string real official Node.js
 * Windows builds embed, so NodeRuntime.readVersion() reads the requested version from it exactly as it
 * would from the genuine binary — this must behave identically to the real download for the
 * test to mean anything, not just happen to pass on a machine where the real one is cached.
 */
function fakeOfficialNodeExe(machine: number, version: string): Buffer {
	const header = Buffer.alloc(256);
	header.write("MZ", 0, "latin1");
	header.writeUInt32LE(0x80, 0x3c);
	header.writeUInt32BE(0x50450000, 0x80);
	header.writeUInt16LE(machine, 0x84);
	header.writeUInt16LE(0x10b, 0x98); // PE32
	const marker = Buffer.from(`https://nodejs.org/download/release/v${version}/`, "latin1");
	return Buffer.concat([header, marker, Buffer.alloc(16)]);
}

/** Serves a fake official Node.js dist tree so ensureOfficial's checksum path is exercised. */
function serveFakeDist(fileKey: string, content: Buffer) {
	const remotePath = `${fileKey.replace(/-exe$/, "")}/node.exe`;
	const sha256 = createHash("sha256").update(content).digest("hex");
	const shasums = `${sha256}  ${remotePath}\n`;
	return (url: string) => {
		if (url.endsWith("SHASUMS256.txt")) return response(Buffer.from(shasums, "utf-8"));
		if (url.endsWith(remotePath)) return response(content);
		throw new Error(`unexpected fetch: ${url}`);
	};
}

test("BinaryPackager auto-provisions the pinned legacy Node.js for Windows 7/Vista, warning prominently", async () => {
	// win-legacy-x86 now defaults to the Graak native host; an explicit strategy is the
	// documented way to opt back into a Node.js build, and the pinned-Node auto-provisioning this
	// test checks only runs once that opt-in is given.
	const root = mkdtempSync(join(tmpdir(), "graak-win7-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "win7-bot" }));
	writeFileSync(join(root, "index.js"), "console.log('hi');");

	const content = fakeOfficialNodeExe(0x014c, "12.22.12"); // I386
	await withIsolatedCache(() =>
		withFetch(serveFakeDist("win-x86-exe", content), async () => {
			const result = await BinaryPackager.compile({
				entrypoint: join(root, "index.js"),
				target: TargetDevice.WinLegacyX86,
				packageManager: "npm",
				strategy: "portable",
				offline: false,
			});
			assert.equal(result.strategy, "portable", "Node 12 predates SEA, so this must fall back to portable");
			assert.equal(result.runtimeVersion, "12.22.12");
			assert.ok(
				result.warnings.some((w: string) => w.includes("discord.js") && w.includes("12.22.12")),
				"the discord.js-incompatibility warning must be in the build output, not just a doc"
			);
		})
	);
});

function projectNeedingNode(prefix: string, floor: string): string {
	const root = mkdtempSync(join(tmpdir(), prefix));
	mkdirSync(join(root, "node_modules/needs-new-node"), { recursive: true });
	writeFileSync(
		join(root, "package.json"),
		JSON.stringify({ name: "win7-bot", dependencies: { "needs-new-node": "1" } })
	);
	writeFileSync(
		join(root, "node_modules/needs-new-node/package.json"),
		JSON.stringify({ name: "needs-new-node", version: "1.0.0", engines: { node: `>=${floor}` } })
	);
	writeFileSync(join(root, "node_modules/needs-new-node/index.js"), "module.exports = {};");
	writeFileSync(join(root, "index.js"), "require('needs-new-node');");
	return root;
}

test("a dependency's engines.node floor is overridden, with a warning, when its code is being lowered", async () => {
	// The whole point of the legacy pipeline is to run code on a runtime older than the one its
	// authors declared. Refusing the build here would reject the only runtime the target has.
	// (strategy: "portable" opts win-legacy-x64 back into Node.js -- see the test above.)
	const root = projectNeedingNode("graak-win7-floor-", "20.0.0");
	const content = fakeOfficialNodeExe(0x8664, "12.22.12"); // AMD64
	await withIsolatedCache(() =>
		withFetch(serveFakeDist("win-x64-exe", content), async () => {
			const result = await BinaryPackager.compile({
				entrypoint: join(root, "index.js"),
				target: TargetDevice.WinLegacyX64,
				packageManager: "npm",
				strategy: "portable",
				offline: false,
			});
			assert.equal(result.runtimeVersion, "12.22.12");
			assert.ok(
				result.warnings.some(
					(w: string) => w.includes("declare they need Node.js >= 20.0.0") && w.includes("override")
				),
				"overriding a declared engines floor must be stated, not silent"
			);
		})
	);
});

test("the engines.node floor is still enforced when nothing is being done about it", async () => {
	// A modern runtime gets no lowering and no polyfills, so a dependency that needs something
	// newer still has no way to run and the build must stop.
	const root = projectNeedingNode("graak-modern-floor-", "99.0.0");
	const content = fakeOfficialNodeExe(0x014c, "22.11.0");
	RuntimeRegistry.add(
		{
			target: TargetDevice.WinLegacyX86,
			version: "22.11.0",
			url: "https://example.invalid/modern-node.exe",
			sha256: createHash("sha256").update(content).digest("hex"),
		},
		{ root }
	);

	await withIsolatedCache(() =>
		withFetch(
			() => response(content),
			async () => {
				await assert.rejects(
					BinaryPackager.compile({
						entrypoint: join(root, "index.js"),
						target: TargetDevice.WinLegacyX86,
						packageManager: "npm",
						offline: false,
					}),
					/require Node\.js >= 99\.0\.0, but the target runtime is 22\.11\.0/
				);
			}
		)
	);
});

test("BinaryPackager auto-provisions the older pinned Node.js for Windows Vista, distinct from the Windows 7 pin", async () => {
	const root = mkdtempSync(join(tmpdir(), "graak-vista-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "vista-bot" }));
	writeFileSync(join(root, "index.js"), "console.log('hi');");

	const content = fakeOfficialNodeExe(0x014c, "5.12.0"); // I386
	await withIsolatedCache(() =>
		withFetch(serveFakeDist("win-x86-exe", content), async () => {
			const result = await BinaryPackager.compile({
				entrypoint: join(root, "index.js"),
				target: TargetDevice.WinVistaX86,
				packageManager: "npm",
				strategy: "portable",
				offline: false,
			});
			assert.equal(result.strategy, "portable");
			assert.equal(result.runtimeVersion, "5.12.0", "Vista must not get the 12.22.12 Windows 7 pin");
			assert.ok(
				result.warnings.some((w: string) => w.includes("5.12.0") && w.includes("Vista")),
				"the Vista-specific warning must be in the build output"
			);
		})
	);
});

test("a user's own registered runtime takes priority over the pinned legacy Node.js", async () => {
	const root = mkdtempSync(join(tmpdir(), "graak-win7-registry-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "win7-bot" }));
	writeFileSync(join(root, "index.js"), "console.log('hi');");

	// A registered runtime the user picked themselves, at a version that is not the pin.
	const content = fakeOfficialNodeExe(0x014c, "20.99.0");
	RuntimeRegistry.add(
		{
			target: TargetDevice.WinLegacyX86,
			version: "20.99.0",
			url: "https://example.invalid/custom-win7-node.exe",
			sha256: createHash("sha256").update(content).digest("hex"),
		},
		{ root }
	);

	await withIsolatedCache(() =>
		withFetch(
			() => response(content),
			async () => {
				const result = await BinaryPackager.compile({
					entrypoint: join(root, "index.js"),
					target: TargetDevice.WinLegacyX86,
					packageManager: "npm",
					offline: false,
				});
				assert.equal(result.runtimeVersion, "20.99.0", "the registered runtime, not the 12.22.12 pin, must be used");
				assert.ok(
					!result.warnings.some((w: string) => w.includes("12.22.12")),
					"the pinned-fallback warning must not appear when a registered runtime was used instead"
				);
			}
		)
	);
});
