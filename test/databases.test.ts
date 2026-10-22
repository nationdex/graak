import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { BinaryPackager, TargetDevice } from "../dist/index.js";

/**
 * Embedded databases are packages with native addons: LevelDB (classic-level), LMDB, RocksDB (rocksdb-native) and SurrealDB's Rust engine, which
 * carries the RocksDB and SurrealKV storage engines. They run on the Graak engine's dynamically linked host through
 * Node-API, and the bar is the usual one: the program prints exactly what it prints under Node.js.
 *
 * The packages are large (SurrealDB's addon alone is 150 MB), so they are installed once into a cache directory
 * (GRAAK_DB_PACKAGES to reuse one) and these tests skip when npm cannot fetch them.
 */
// Native code loaded from here: a per-user directory, not a fixed name another user could have created in the shared temp dir.
const cache =
	process.env.GRAAK_DB_PACKAGES ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "graak-test-packages");
const HAS_GLIBC =
	process.platform === "linux" && process.arch === "x64" && existsSync("/lib/x86_64-linux-gnu/libc.so.6");

function installed(): boolean {
	if (
		existsSync(join(cache, "node_modules/@surrealdb/node/package.json")) &&
		existsSync(join(cache, "node_modules/classic-level/package.json"))
	) {
		return true;
	}
	mkdirSync(cache, { recursive: true });
	writeFileSync(
		join(cache, "package.json"),
		JSON.stringify({
			name: "graak-db-packages",
			version: "1.0.0",
			dependencies: {
				"classic-level": "^3.0.0",
				lmdb: "^3.5.0",
				"rocksdb-native": "^3.0.0",
				surrealdb: "2.0.8",
				"@surrealdb/node": "3.0.3",
			},
		})
	);
	const npm = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
		cwd: cache,
		encoding: "utf-8",
		timeout: 900_000,
	});
	return npm.status === 0 && existsSync(join(cache, "node_modules/classic-level/package.json"));
}

const ready = HAS_GLIBC && installed();
const skip = (!HAS_GLIBC && "needs 64-bit glibc Linux") || (!ready && "the database packages could not be installed");

async function sameAsNode(fixture: string, dependencies: Record<string, string>) {
	const root = mkdtempSync(join(tmpdir(), "graak-db-app-"));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: "db-app", dependencies }));
	symlinkSync(join(cache, "node_modules"), join(root, "node_modules"), "dir");
	copyFileSync(join(import.meta.dirname, "fixtures", "db", fixture), join(root, fixture));
	const onNode = spawnSync(process.execPath, [join(root, fixture)], { cwd: root, encoding: "utf-8", timeout: 180_000 });
	assert.equal(onNode.status, 0, `Node baseline failed:\n${onNode.stdout}${onNode.stderr}`);

	const out = join(root, "out");
	const result = await BinaryPackager.compile({
		entrypoint: join(root, fixture),
		target: TargetDevice.LinuxModernX64,
		packageManager: "npm",
		offline: true,
		output: out,
	});
	assert.ok(
		result.warnings.some((w: string) => /dynamically linked glibc host/.test(w)),
		"native addons choose the dynamic host"
	);
	const name = "db-app";
	const onHost = spawnSync(join(out, name), [], { cwd: root, encoding: "utf-8", timeout: 300_000 });
	assert.equal(onHost.status, 0, `host failed:\n${onHost.stdout}${onHost.stderr}`);
	assert.equal(onHost.stdout, onNode.stdout);
	return onHost.stdout;
}

test("LevelDB (classic-level) stores, iterates and deletes like Node.js", { skip, timeout: 900_000 }, async () => {
	const printed = await sameAsNode("level.cjs", { "classic-level": "^3.0.0" });
	assert.match(printed, /after del \["a","c"\]/);
});

test("LMDB (lmdb) opens, writes and ranges like Node.js", { skip, timeout: 900_000 }, async () => {
	const printed = await sameAsNode("lmdb.cjs", { lmdb: "^3.5.0" });
	assert.match(printed, /get \{"n":1\}/);
});

test("RocksDB (rocksdb-native, which calls libuv directly) reads, writes, batches and iterates like Node.js", {
	skip,
	timeout: 900_000,
}, async () => {
	const printed = await sameAsNode("rocksdb.cjs", { "rocksdb-native": "^3.0.0" });
	assert.match(printed, /read batch 1 4/);
	assert.match(printed, /range \["c"\]/);
});

test("SurrealDB embedded runs on its memory, RocksDB and SurrealKV engines like Node.js", {
	skip,
	timeout: 900_000,
}, async () => {
	const printed = await sameAsNode("surreal.cjs", { surrealdb: "2.0.8", "@surrealdb/node": "3.0.3" });
	for (const engine of ["mem", "rocksdb", "surrealkv"])
		assert.match(printed, new RegExp(`${engine} count \\[\\{"count":3\\}\\]`));
	assert.doesNotMatch(printed, /ERR/);
});
