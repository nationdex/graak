import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
	BinaryInspector,
	BinaryPackager,
	GraakError,
	RuntimeError,
	RuntimeRegistry,
	TargetDevice,
} from "../dist/index.js";

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

function response(body: Buffer, ok = true): Response {
	// A real Response, with a body that can be streamed, as fetch returns.
	return new Response(new Uint8Array(body), { status: ok ? 200 : 404 });
}

/** Minimal PE32 header recognised by BinaryInspector. */
function fakePe32(): Buffer {
	const buf = Buffer.alloc(256);
	buf.write("MZ", 0, "latin1");
	buf.writeUInt32LE(0x80, 0x3c);
	buf.writeUInt32BE(0x50450000, 0x80);
	buf.writeUInt16LE(0x014c, 0x84); // I386
	buf.writeUInt16LE(0x10b, 0x98); // PE32
	return buf;
}

/** Minimal single-entry ustar archive, gzipped, containing "node" at the given path. */
function tarGz(path: string, content: Buffer): Buffer {
	const header = Buffer.alloc(512);
	header.write(path, 0, "utf-8");
	header.write(content.length.toString(8).padStart(11, "0"), 124, "utf-8");
	header.write("0", 156, "utf-8"); // regular file
	header.write("ustar", 257, "utf-8");
	let checksum = 0;
	header.fill(0x20, 148, 156);
	for (const b of header) checksum += b;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "utf-8");

	const padded = Buffer.concat([content, Buffer.alloc((512 - (content.length % 512)) % 512)]);
	return gzipSync(Buffer.concat([header, padded, Buffer.alloc(1024)]));
}

/** Minimal ZIP with a single stored (uncompressed) entry. */
function zip(name: string, content: Buffer): Buffer {
	const nameBuf = Buffer.from(name, "utf-8");
	const local = Buffer.alloc(30 + nameBuf.length);
	local.writeUInt32LE(0x04034b50, 0);
	local.writeUInt16LE(nameBuf.length, 26);
	nameBuf.copy(local, 30);

	const central = Buffer.alloc(46 + nameBuf.length);
	central.writeUInt32LE(0x02014b50, 0);
	central.writeUInt32LE(content.length, 20); // compressed size (method 0: stored)
	central.writeUInt32LE(content.length, 24); // uncompressed size
	central.writeUInt16LE(nameBuf.length, 28);
	central.writeUInt32LE(0, 42); // offset of the local header
	nameBuf.copy(central, 46);

	const localBlock = Buffer.concat([local, content]);
	const eocd = Buffer.alloc(22);
	eocd.writeUInt32LE(0x06054b50, 0);
	eocd.writeUInt16LE(1, 8);
	eocd.writeUInt16LE(1, 10);
	eocd.writeUInt32LE(central.length, 12);
	eocd.writeUInt32LE(localBlock.length, 16);

	return Buffer.concat([localBlock, central, eocd]);
}

test("RuntimeRegistry.add rejects unpinned or non-https entries", () => {
	const root = mkdtempSync(join(tmpdir(), "graak-registry-"));
	assert.throws(
		() =>
			RuntimeRegistry.add(
				{
					target: TargetDevice.WinLegacyX86,
					version: "20.18.1",
					url: "https://x/node.exe",
					sha256: "not-a-hash",
				},
				{ root }
			),
		GraakError
	);
	assert.throws(
		() =>
			RuntimeRegistry.add(
				{
					target: TargetDevice.WinLegacyX86,
					version: "20.18.1",
					url: "http://x/node.exe",
					sha256: "a".repeat(64),
				},
				{ root }
			),
		GraakError
	);
	assert.equal(RuntimeRegistry.list(root).length, 0);
});

test("RuntimeRegistry add/find/remove round-trip via the project manifest", () => {
	const root = mkdtempSync(join(tmpdir(), "graak-registry-"));
	RuntimeRegistry.add(
		{
			target: TargetDevice.WinLegacyX86,
			version: "20.18.1",
			url: "https://example.invalid/node.exe",
			sha256: "a".repeat(64),
		},
		{ root }
	);
	RuntimeRegistry.add(
		{
			target: TargetDevice.WinLegacyX86,
			version: "20.10.0",
			url: "https://example.invalid/older.exe",
			sha256: "b".repeat(64),
		},
		{ root }
	);

	const found = RuntimeRegistry.find(TargetDevice.WinLegacyX86, root);
	assert.equal(found.length, 2);
	assert.equal(found[0].version, "20.18.1", "newest version must be tried first");

	assert.equal(RuntimeRegistry.remove(TargetDevice.WinLegacyX86, "20.10.0", { root }), true);
	assert.equal(RuntimeRegistry.find(TargetDevice.WinLegacyX86, root).length, 1);
	assert.equal(RuntimeRegistry.remove(TargetDevice.WinLegacyX86, "20.10.0", { root }), false);
});

test("RuntimeRegistry.ensure verifies the SHA-256 of the downloaded file", async () => {
	const content = fakePe32();
	const sha256 = createHash("sha256").update(content).digest("hex");

	await withFetch(
		() => response(content),
		async () => {
			const path = await RuntimeRegistry.ensure({
				target: TargetDevice.WinLegacyX86,
				version: "99.0.0",
				url: "https://example.invalid/node.exe",
				sha256,
				addedAt: new Date().toISOString(),
			});
			const info = BinaryInspector.inspect(path);
			assert.equal(info?.format, "pe32");
		}
	);

	await assert.rejects(
		withFetch(
			() => response(content),
			() =>
				RuntimeRegistry.ensure({
					target: TargetDevice.WinLegacyX86,
					version: "99.0.1",
					url: "https://example.invalid/wrong.exe",
					sha256: "0".repeat(64),
					addedAt: new Date().toISOString(),
				})
		),
		RuntimeError
	);
});

test("RuntimeRegistry.ensure extracts node/node.exe from .tar.gz and .zip archives", async () => {
	const content = fakePe32();

	const tar = tarGz("node-v99.0.0-win-x86/node.exe", content);
	await withFetch(
		() => response(tar),
		async () => {
			const path = await RuntimeRegistry.ensure({
				target: TargetDevice.WinLegacyX86,
				version: "99.0.2",
				url: "https://example.invalid/node.tar.gz",
				sha256: createHash("sha256").update(tar).digest("hex"),
				addedAt: new Date().toISOString(),
			});
			assert.equal(BinaryInspector.inspect(path)?.format, "pe32");
		}
	);

	const archive = zip("node.exe", content);
	await withFetch(
		() => response(archive),
		async () => {
			const path = await RuntimeRegistry.ensure({
				target: TargetDevice.WinLegacyX86,
				version: "99.0.3",
				url: "https://example.invalid/node.zip",
				sha256: createHash("sha256").update(archive).digest("hex"),
				addedAt: new Date().toISOString(),
			});
			assert.equal(BinaryInspector.inspect(path)?.format, "pe32");
		}
	);
});

test("BinaryPackager uses a registered community runtime for targets with no official build", async () => {
	const root = mkdtempSync(join(tmpdir(), "graak-registry-project-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "legacy-bot" }));
	writeFileSync(join(root, "index.js"), "console.log('hi')");

	const content = fakePe32();
	RuntimeRegistry.add(
		{
			target: TargetDevice.WinLegacyX86,
			version: "99.0.4",
			url: "https://example.invalid/win7-node.exe",
			sha256: createHash("sha256").update(content).digest("hex"),
		},
		{ root }
	);

	await withFetch(
		() => response(content),
		async () => {
			const result = await BinaryPackager.compile({
				entrypoint: join(root, "index.js"),
				target: TargetDevice.WinLegacyX86,
				packageManager: "npm",
				offline: false,
			});
			assert.equal(result.strategy, "portable");
			assert.equal(result.runtimeVersion, null, "the fake binary has no readable version");
			assert.ok(!result.warnings.some((w) => w.includes("No Node.js runtime bundled")));
		}
	);
});

test("a registry file is checked when it is read: an entry that could escape the cache or leave https is refused", () => {
	const sha = "a".repeat(64);
	const good = {
		target: "linux-x86",
		version: "20.1.0-community",
		url: "https://example.invalid/node.tar.gz",
		sha256: sha,
	};
	const readWith = (entry: Record<string, unknown>) => {
		const root = mkdtempSync(join(tmpdir(), "graak-registry-file-"));
		mkdirSync(join(root, ".graak"));
		writeFileSync(join(root, ".graak", "runtimes.json"), JSON.stringify({ runtimes: [entry] }));
		return () => RuntimeRegistry.list(root);
	};
	assert.equal(readWith(good)().filter((e) => e.version === "20.1.0-community").length, 1);
	for (const bad of [
		{ ...good, version: "../../outside" },
		{ ...good, version: "a/b" },
		{ ...good, version: ".hidden" },
		{ ...good, target: "../x" },
		{ ...good, target: "no-such-target" },
		{ ...good, url: "http://example.invalid/node.tar.gz" },
		{ ...good, url: "file:///etc/passwd" },
		{ ...good, url: "not a url" },
		{ ...good, sha256: "abc" },
		"just a string",
	]) {
		assert.throws(readWith(bad as Record<string, unknown>), GraakError, JSON.stringify(bad));
	}
});
