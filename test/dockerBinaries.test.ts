import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { BinaryPackager, generateWasmShim, TargetDevice } from "../dist/index.js";

/*
 * Real programs, each packaged by Graak for every environment of test/docker/compose.yaml and run there. Each must
 * print exactly what the same program prints under Node.js on this machine. macOS and Termux have no service: they
 * cannot run in a Linux container (see that file's header), so no binary here runs on them.
 */

const compose = join(process.cwd(), "test/docker/compose.yaml");
const fixtures = join(process.cwd(), "test/fixtures/matrix");
const dockerReady =
	spawnSync("docker", ["compose", "version"]).status === 0 && spawnSync("docker", ["info"]).status === 0;

const ENVIRONMENTS = [
	{ service: "alpine-x64", target: TargetDevice.LinuxModernX64, exe: "app", wine: false },
	{ service: "alpine-i386", target: TargetDevice.LinuxX86, exe: "app", wine: false },
	{ service: "win7", target: TargetDevice.WinLegacyX64, exe: "app.exe", wine: true },
	{ service: "vista", target: TargetDevice.WinVistaX64, exe: "app.exe", wine: true },
	{ service: "xp", target: TargetDevice.WinXpX86, exe: "app.exe", wine: true },
] as const;

const PROGRAMS = ["basic", "sqlite", "fsdir", "http", "wasm"] as const;

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

// A two-function WebAssembly module, hand-assembled (the same technique as test/fixtures/web/wasm-corpus.cjs):
// add(i32, i32) -> i32 and double_f64(f64) -> f64.
function buildReactor(): Uint8Array {
	const leb = (n: number): number[] => {
		const bytes: number[] = [];
		do {
			let byte = n & 0x7f;
			n >>>= 7;
			if (n) byte |= 0x80;
			bytes.push(byte);
		} while (n);
		return bytes;
	};
	const str = (s: string): number[] => [s.length, ...Buffer.from(s)];
	const vec = (items: number[][]): number[] => [...leb(items.length), ...items.flat()];
	const section = (id: number, body: number[]): number[] => [id, ...leb(body.length), ...body];
	const fn = (params: number[], results: number[]) => [
		0x60,
		...vec(params.map((p) => [p])),
		...vec(results.map((r) => [r])),
	];
	const I32 = 0x7f;
	const F64 = 0x7c;
	const addBody = [0, 0x20, 0, 0x20, 1, 0x6a, 0x0b];
	// f64.const 2.0 (IEEE-754 little-endian), f64.mul
	const doubleBody = [0, 0x20, 0, 0x44, 0, 0, 0, 0, 0, 0, 0, 0x40, 0xa2, 0x0b];
	const types = section(1, vec([fn([I32, I32], [I32]), fn([F64], [F64])]));
	const funcs = section(3, vec([[0], [1]]));
	const exports = section(
		7,
		vec([
			[...str("add"), 0, 0],
			[...str("double_f64"), 0, 1],
		])
	);
	const code = section(
		10,
		vec([
			[...leb(addBody.length), ...addBody],
			[...leb(doubleBody.length), ...doubleBody],
		])
	);
	return new Uint8Array([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0, ...types, ...funcs, ...exports, ...code]);
}

/** A directory holding one program and what it needs beside it. */
function project(program: string): string {
	const root = mkdtempSync(join(tmpdir(), `graak-matrix-${program}-`));
	writeFileSync(join(root, "package.json"), JSON.stringify({ name: `matrix-${program}`, private: true }));
	copyFileSync(join(fixtures, `${program}.mjs`), join(root, `${program}.mjs`));
	if (program === "wasm") {
		const wasm = buildReactor();
		writeFileSync(join(root, "reactor.wasm"), wasm);
		// The binding Graak would generate: written here too, so Node.js runs the very same file.
		writeFileSync(join(root, "reactor.wasm.js"), generateWasmShim(wasm, "reactor.wasm") as string);
	}
	return root;
}

/** Line endings and the trailing newline are the only things allowed to differ between a console and a file. */
const normalize = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n+$/, "\n");

const baselines = new Map<string, string>();
function nodeOutput(program: string, root: string): string {
	let out = baselines.get(program);
	if (out === undefined) {
		const env: NodeJS.ProcessEnv = { ...process.env };
		delete env.FORCE_COLOR;
		const run = spawnSync(process.execPath, [`${program}.mjs`], {
			cwd: root,
			encoding: "utf-8",
			env,
			timeout: 120_000,
		});
		assert.equal(run.status, 0, `Node.js baseline failed for ${program}:\n${run.stdout}${run.stderr}`);
		out = normalize(run.stdout);
		baselines.set(program, out);
	}
	return out;
}

for (const program of PROGRAMS) {
	for (const env of ENVIRONMENTS) {
		test(`${program} prints the same on ${env.service} as under Node.js (Graak binary, docker compose)`, {
			skip: !dockerReady && "docker compose is not available",
			timeout: 900_000,
		}, async () => {
			const root = project(program);
			const expected = nodeOutput(program, root);
			const out = mkdtempSync(join(tmpdir(), `graak-matrix-out-${env.service}-`));
			const built = await BinaryPackager.compile({
				entrypoint: join(root, `${program}.mjs`),
				target: env.target,
				packageManager: "npm",
				offline: true,
				strategy: "sea",
				output: join(out, env.exe),
			});
			const command = env.wine
				? ["sh", "-c", `wineboot -u >/dev/null 2>&1; wineserver -w; wine /w/${env.exe}`]
				: [`/w/${env.exe}`];
			const childEnv: NodeJS.ProcessEnv = { ...process.env, GRAAK_MATRIX_DIR: dirname(built.launcherPath) };
			delete childEnv.FORCE_COLOR;
			const run = (): ReturnType<typeof spawnSync> =>
				spawnSync("docker", ["compose", "-f", compose, "run", "--rm", env.service, ...command], {
					encoding: "utf-8",
					env: childEnv,
					timeout: 800_000,
				});
			const result = env.wine ? withWineLock(run) : run();
			assert.equal(result.status, 0, `${env.service} exited ${result.status}:\n${result.stdout}${result.stderr}`);
			assert.equal(normalize(String(result.stdout)), expected, `${program} on ${env.service} differs from Node.js`);
		});
	}
}
