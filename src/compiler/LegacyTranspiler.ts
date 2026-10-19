import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { dirname, join, posix } from "node:path";
import type { ArchiveEntry } from "./Archive";

/**
 * Lowers a collected project to syntax an old Node.js runtime can parse.
 *
 * Targets like Windows 7 (Node.js 12) and Windows Vista (Node.js 5) are pinned to runtimes
 * whose V8 predates syntax that current discord.js and ForgeScript are shipped in. Nothing
 * about a Node.js binary can be picked around that, but the *code* can be rewritten, which is
 * what this does: every bundled JavaScript file is re-emitted for the target's language level
 * before it is packed into the archive.
 *
 * esbuild does the rewriting rather than the TypeScript compiler, which was tried first and
 * rejected on evidence: TypeScript's ES2019 downlevel hoists private class methods out of the
 * class body but leaves their `super.x()` calls behind, emitting
 * `SyntaxError: 'super' keyword unexpected here` (reproduced on undici's decompress
 * interceptor). esbuild emits a `__superGet` helper instead, and is roughly six times faster
 * on a real dependency tree.
 *
 * Source files on disk are never modified. Entries carry either a path or a buffer, so a
 * rewritten file is swapped for an in-memory buffer and the user's `node_modules` is left
 * exactly as their package manager installed it.
 */

/** Files worth handing to esbuild. Anything else is copied into the archive untouched. */
const TRANSPILABLE = /\.(js|cjs|mjs)$/;

export interface LegacyTranspileOptions {
	/**
	 * esbuild target for the runtime that will run this build, e.g. `node12`. Derived from the
	 * pinned runtime version rather than the target id, so it stays right if the pin moves.
	 */
	jsTarget: string;
	onLog?: (message: string) => void;
}

export interface LegacyTranspileResult {
	entries: ArchiveEntry[];
	/** Files whose emitted form differed from the original and were replaced. */
	rewritten: number;
	/** Files that were ES modules and are now CommonJS. */
	esmConverted: number;
	/** Packages whose `"type": "module"` declaration was removed. */
	manifestsRewritten: number;
	/**
	 * Files esbuild could not parse. These keep their original contents: packages do ship
	 * unparseable files (editor backups under `.history/`, fixtures) that are never loaded, and
	 * failing the whole build over one of them would be wrong. If such a file really is loaded,
	 * the runtime reports its own syntax error, pointing at the actual file.
	 */
	failures: string[];
}

function entrySource(entry: ArchiveEntry): Buffer {
	return typeof entry.source === "string" ? readFileSync(entry.source) : entry.source;
}

export class LegacyTranspiler {
	/**
	 * Maps every directory in the archive to the module format its nearest `package.json`
	 * declares. Resolved from the archive's own entries rather than from disk, so it is correct
	 * for generated, in-memory files too.
	 *
	 * This has to be resolved rather than assumed. Emitting CommonJS into a package that
	 * declares `"type": "module"` rewrites its `import`/`export` into `require`/`exports`, and
	 * Node then loads those files as ES modules and rejects them.
	 */
	private static packageTypes(entries: readonly ArchiveEntry[]): Map<string, "module" | "commonjs"> {
		const declared = new Map<string, "module" | "commonjs">();
		for (const entry of entries) {
			if (posix.basename(entry.path) !== "package.json") continue;
			try {
				const manifest = JSON.parse(entrySource(entry).toString("utf-8"));
				declared.set(posix.dirname(entry.path), manifest.type === "module" ? "module" : "commonjs");
			} catch {
				// A package.json that does not parse cannot be declaring "type": "module".
			}
		}
		return declared;
	}

	private static formatFor(file: string, declared: Map<string, "module" | "commonjs">): "module" | "commonjs" {
		if (file.endsWith(".mjs")) return "module";
		if (file.endsWith(".cjs")) return "commonjs";
		let dir = posix.dirname(file);
		for (;;) {
			const hit = declared.get(dir);
			if (hit) return hit;
			const parent = posix.dirname(dir);
			if (parent === dir) return "commonjs";
			dir = parent;
		}
	}

	/**
	 * Rewrites every JavaScript entry for `jsTarget`, converting ES modules to CommonJS on the
	 * way. The conversion is not optional: `require()` of an ES module only works on Node.js
	 * 20.19+/22.12+, and ForgeScript itself `require()`s chalk, which is published as pure ESM.
	 */
	public static async transpile(
		entries: readonly ArchiveEntry[],
		options: LegacyTranspileOptions
	): Promise<LegacyTranspileResult> {
		// Imported lazily so that builds for modern targets, which never transpile, do not pay
		// for loading esbuild at all.
		const esbuild = require("esbuild") as typeof import("esbuild");

		const declared = LegacyTranspiler.packageTypes(entries);
		const result: LegacyTranspileResult = {
			entries: [...entries],
			rewritten: 0,
			esmConverted: 0,
			manifestsRewritten: 0,
			failures: [],
		};

		const jobs: Array<Promise<void>> = [];
		for (let i = 0; i < result.entries.length; i++) {
			const index = i;
			const entry = result.entries[index];
			if (!TRANSPILABLE.test(entry.path)) continue;

			const wasEsm = LegacyTranspiler.formatFor(entry.path, declared) === "module";
			jobs.push(
				(async () => {
					const original = entrySource(entry).toString("utf-8");
					try {
						const out = await esbuild.transform(original, {
							target: options.jsTarget,
							format: "cjs",
							platform: "node",
							loader: "js",
							sourcefile: entry.path,
							// Keeps @license / @preserve blocks where they are, which matters for a
							// bundle that redistributes other people's code.
							legalComments: "inline",
						});
						if (wasEsm) result.esmConverted++;
						if (out.code !== original) {
							result.entries[index] = { ...entry, source: Buffer.from(out.code, "utf-8") };
							result.rewritten++;
						}
					} catch (err) {
						result.failures.push(`${entry.path}: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
					}
				})()
			);
		}

		await Promise.all(jobs);

		// Every ES module in the bundle is CommonJS now, so a surviving "type": "module" would
		// make Node reject files it can otherwise load.
		for (let i = 0; i < result.entries.length; i++) {
			const entry = result.entries[i];
			if (posix.basename(entry.path) !== "package.json") continue;
			if (declared.get(posix.dirname(entry.path)) !== "module") continue;
			try {
				const manifest = JSON.parse(entrySource(entry).toString("utf-8"));
				delete manifest.type;
				result.entries[i] = { ...entry, source: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8") };
				result.manifestsRewritten++;
			} catch {
				// Already skipped above when it failed to parse.
			}
		}

		options.onLog?.(
			`Lowered ${result.rewritten} files to ${options.jsTarget}` +
				(result.esmConverted ? `, ${result.esmConverted} of them ES modules converted to CommonJS` : "") +
				(result.failures.length ? `, ${result.failures.length} left as-is (unparseable)` : "")
		);

		return result;
	}

	/**
	 * A module that awaits at its top level becomes the body of an async function. Its imports become require() calls
	 * (through esbuild's own interop, so default and namespace imports mean what they do in a converted module) and
	 * its exports are assigned once it has finished. The program's entry point is the case that matters: it runs to
	 * completion. A module that another one requires sees its exports only after its own awaits are done.
	 */
	private static async wrapTopLevelAwait(
		esbuild: typeof import("esbuild"),
		source: string,
		options: import("esbuild").TransformOptions
	): Promise<string> {
		const EXTERNAL = "graak-external";
		const built = await esbuild.build({
			stdin: { contents: source, sourcefile: options.sourcefile, loader: options.loader, resolveDir: "/" },
			bundle: true,
			write: false,
			format: "esm",
			platform: "node",
			target: "esnext",
			jsx: "automatic",
			logLevel: "silent",
			legalComments: "inline",
			metafile: true,
			supported: { "dynamic-import": false },
			define: options.define,
			plugins: [
				{
					name: "externals",
					setup(build) {
						build.onResolve({ filter: /.*/ }, (args) => {
							if (args.kind === "entry-point") return undefined;
							// The require() inside a virtual module is the runtime's own, not something to bundle.
							if (args.namespace === EXTERNAL) return { path: args.path, external: true };
							// A suffix keeps ".mjs" and ".cjs" out of the virtual path: esbuild reads a module's kind from
							// its extension, and this one is CommonJS whatever the file it stands for is.
							return { path: `${args.path}?graak`, namespace: EXTERNAL };
						});
						build.onLoad({ filter: /.*/, namespace: EXTERNAL }, (args) => ({
							contents: `module.exports = require(${JSON.stringify(args.path.slice(0, -"?graak".length))});`,
							loader: "js",
						}));
					},
				},
			],
		});
		let body = built.outputFiles[0].text;
		const names: string[] = [];
		let exportsCode = "";
		const block = /\nexport \{([^}]*)\};?\s*$/.exec(body);
		if (block) {
			body = body.slice(0, block.index);
			for (const item of block[1].split(",")) {
				const [local, exported] = item.trim().split(/\s+as\s+/);
				if (!local) continue;
				names.push(exported ?? local);
				exportsCode += `\nexports[${JSON.stringify(exported ?? local)}] = ${local};`;
			}
		}
		// What this module imports, so it can wait for any of those that awaits too.
		const imported = Object.values(built.metafile.outputs)
			.flatMap((output) => output.imports.map((i) => i.path))
			.filter((path) => !path.startsWith("<"));
		const meta = /__fgMetaUrl/.test(body) ? 'const __fgMetaUrl = require("url").pathToFileURL(__filename).href;\n' : "";
		// Every export exists from the start, as an import binding that is read later must find it; its value arrives when the
		// module's own awaits are done, and `Symbol.for("graak.tla")` is the promise that says when.
		const declare = names
			.map(
				(name) =>
					`Object.defineProperty(exports, ${JSON.stringify(name)}, { enumerable: true, configurable: true, writable: true, value: undefined });`
			)
			.join("\n");
		const waits = imported.length
			? `await Promise.all([${imported.map((path) => `require(${JSON.stringify(path)})?.[Symbol.for("graak.tla")]`).join(", ")}]);\n`
			: "";
		return `${meta}${declare}\nObject.defineProperty(exports, Symbol.for("graak.tla"), { value: (async () => {\n"use strict";\n${waits}${body}${exportsCode}\n})(), enumerable: false });\n`;
	}

	/**
	 * What the native host needs: ES modules become CommonJS and TypeScript/JSX become JavaScript, and nothing else
	 * changes. The host's engine parses current syntax directly, so unlike {@link transpile} no downlevelling happens
	 * (`target: esnext`), and a file that is already plain CommonJS is left alone without being parsed at all.
	 *
	 * This is what makes ES-module-only packages (chalk 5, nanoid 5, node-fetch 3, ...) and `.mjs` or TypeScript
	 * programs run: the host loads CommonJS. TypeScript and JSX files are renamed to `.js`; the module resolver maps
	 * an import of `./x.ts` (or `./x.js` written for an `x.ts`) onto the renamed file.
	 */
	public static async toCommonJs(
		entries: readonly ArchiveEntry[],
		options: { onLog?: (message: string) => void; cacheDir?: string } = {}
	): Promise<{ entries: ArchiveEntry[]; renamed: Map<string, string>; converted: number; failures: string[] }> {
		const esbuild = require("esbuild") as typeof import("esbuild");
		const declared = LegacyTranspiler.packageTypes(entries);
		const out: ArchiveEntry[] = [...entries];
		const renamed = new Map<string, string>();
		const failures: string[] = [];
		let converted = 0;

		const ESM_SYNTAX =
			/(^|[\n;])[ \t]*(import\s*[\w{*'"]|export\s+(default|const|let|var|function|class|async|\{|\*)|export\s*\{)|import\.meta|\bawait\s+import\b/;
		const LOADERS: Record<string, "ts" | "tsx" | "jsx"> = {
			".ts": "ts",
			".mts": "ts",
			".cts": "ts",
			".tsx": "tsx",
			".jsx": "jsx",
		};

		// Converting is deterministic in the file's bytes, so a converted file is kept on disk and the next
		// build of the same project (or of another one that shares its dependencies) skips esbuild for it.
		const cacheDir = options.cacheDir;
		const salt = createHash("sha256").update(`toCommonJs-1:${esbuild.version}`).digest("hex").slice(0, 16);
		const cached = { hits: 0 };
		const cachePath = (original: string, kind: string, sourcefile: string, usesMeta: boolean) =>
			join(
				cacheDir as string,
				`${createHash("sha256").update(`${salt}\0${kind}\0${sourcefile}\0${usesMeta}\0`).update(original).digest("hex")}.js`
			);

		// esbuild works on many files at once, but not on thousands of source strings held in memory at once.
		const limit = Math.max(4, availableParallelism() * 2);
		let active = 0;
		const waiting: Array<() => void> = [];
		const slot = async () => {
			if (active >= limit) await new Promise<void>((resolve) => waiting.push(resolve));
			active++;
		};
		const release = () => {
			active--;
			waiting.shift()?.();
		};

		const jobs: Array<Promise<void>> = [];
		for (let i = 0; i < out.length; i++) {
			const index = i;
			const entry = out[index];
			const ext = posix.extname(entry.path);
			const loader = LOADERS[ext];
			if (!loader && !/\.(js|cjs|mjs)$/.test(entry.path)) continue;
			if (entry.path.endsWith(".d.ts") || entry.path.endsWith(".d.mts") || entry.path.endsWith(".d.cts")) continue;

			const convert = async () => {
				const original = entrySource(entry).toString("utf-8");
				const isModule = LegacyTranspiler.formatFor(entry.path, declared) === "module";
				// Plain CommonJS needs no work. A file in a "type": "module" package or a .mjs is converted
				// whether or not it looks like it, since a bare `export {}` still marks it as a module.
				if (!loader && !isModule && !ESM_SYNTAX.test(original)) return;
				try {
					const usesMeta = original.includes("import.meta");
					// esbuild reads ".mjs" as "Node ESM importing CommonJS" and then hands `import x from "y"` the whole
					// module.exports. Everything here was ES modules that are CommonJS now, so the extension is hidden
					// and a default import is the module's `default` export, as it was.
					const sourcefile = entry.path.replace(/\.mjs$/, ".js").replace(/\.mts$/, ".ts");
					let code: string | undefined;
					const file = cacheDir ? cachePath(original, loader ?? "js", sourcefile, usesMeta) : undefined;
					if (file) {
						try {
							code = readFileSync(file, "utf-8");
							cached.hits++;
						} catch {
							// Not converted before.
						}
					}
					if (code === undefined) {
						const options: import("esbuild").TransformOptions = {
							target: "esnext",
							format: "cjs",
							platform: "node",
							loader: loader ?? "js",
							sourcefile,
							jsx: "automatic",
							legalComments: "inline",
							// import() becomes Promise.resolve().then(() => require(...)): a real dynamic import would ask the
							// engine's own module loader, which knows nothing of node_modules resolution or CommonJS interop.
							supported: { "dynamic-import": false },
							...(usesMeta
								? {
										define: {
											"import.meta.url": "__fgMetaUrl",
											"import.meta.dirname": "__dirname",
											"import.meta.filename": "__filename",
										},
										banner: 'const __fgMetaUrl = require("url").pathToFileURL(__filename).href;',
									}
								: {}),
						};
						let result: { code: string };
						try {
							result = await esbuild.transform(original, options);
						} catch (error) {
							// CommonJS cannot express top-level await. The module still can run: as the body of an async function.
							if (!/top-level await/i.test(error instanceof Error ? error.message : String(error))) throw error;
							result = { code: await LegacyTranspiler.wrapTopLevelAwait(esbuild, original, options) };
						}
						code = result.code;
						if (file) {
							try {
								mkdirSync(dirname(file), { recursive: true });
								// Written beside its final name first: a build stopped halfway must not leave a truncated file
								// that a later build would trust.
								const partial = `${file}.${process.pid}.tmp`;
								writeFileSync(partial, code);
								renameSync(partial, file);
							} catch {
								// A cache that cannot be written is a slower build, not a failed one.
							}
						}
					}
					converted++;
					let path = entry.path;
					if (loader) {
						path = entry.path.slice(0, -ext.length) + (ext === ".mts" ? ".mjs" : ext === ".cts" ? ".cjs" : ".js");
						renamed.set(entry.path, path);
					}
					out[index] = { ...entry, path, source: Buffer.from(code, "utf-8") };
				} catch (err) {
					failures.push(`${entry.path}: ${(err instanceof Error ? err.message : String(err)).split("\n")[0]}`);
				}
			};
			jobs.push(
				(async () => {
					await slot();
					try {
						await convert();
					} finally {
						release();
					}
				})()
			);
		}
		await Promise.all(jobs);

		// A surviving "type": "module" would mislead tools that read the manifest, and the files are CommonJS now.
		for (let i = 0; i < out.length; i++) {
			const entry = out[i];
			if (posix.basename(entry.path) !== "package.json") continue;
			if (declared.get(posix.dirname(entry.path)) !== "module") continue;
			try {
				const manifest = JSON.parse(entrySource(entry).toString("utf-8"));
				delete manifest.type;
				out[i] = { ...entry, source: Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf-8") };
			} catch {
				// Not a manifest we can rewrite.
			}
		}

		if (converted) {
			options.onLog?.(
				`Converted ${converted} ES module / TypeScript files to CommonJS for the native host` +
					(cached.hits ? ` (${cached.hits} from the conversion cache)` : "") +
					(failures.length ? `, ${failures.length} left as-is (unparseable)` : "")
			);
		}
		return { entries: out, renamed, converted, failures };
	}
}
