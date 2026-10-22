import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { OPTIONAL_ACCELERATORS } from "../runtime/nativeShim";
import { RuntimeError, TARGET_METADATA_MAP, TargetDevice } from "../structures";
import type { ArchiveEntry } from "./Archive";
import { writeFileAtomic } from "./AtomicWrite";
import { NodeRuntime } from "./NodeRuntime";
import { Prebuilt } from "./Prebuilt";
import { hasPosixShell } from "./SpawnOutput";

/**
 * Packages a bot to run on the Graak native host (quickjs-ng + `quickjs/native/`) instead of
 * a bundled Node.js binary.
 *
 * Default for the legacy Windows targets, iSH, and 32-bit Linux: those are exactly the targets
 * Node.js itself cannot serve well (Windows 7 tops out at Node 12, XP has no official build at
 * all, and 32-bit Linux's last Node is an unofficial 12.16.3), so the native host is the better
 * default there rather than an alternative. `LinuxModernX64` is included too, as the original
 * proof target. Every other target still ships on Node.js. See NATIVE_HOST_BUILD_TARGET below for
 * exactly which targets this covers today, and why some are missing: coverage is added only once
 * this repo can both build and actually run the result, per target, with real verification — not
 * declared for a target just because it seems like it should work.
 *
 * Known limitation, called out rather than hidden: the output is loose files (`app/`, `runtime/`),
 * not the compressed single-file FGAR archive the Node path produces, because the quickjs runtime
 * has no in-engine unarchiver yet. `native-modules.js`/`node-compat.js` already expose a working
 * `zlib`, so adding one is possible — just not part of proving this path works at all.
 */

/**
 * Maps a target to the `quickjs/native/build.sh` argument that builds its native host. Only
 * targets this repo can actually build belong here; every other target keeps shipping on Node.js
 * until it gets its own entry, with its own real verification.
 *
 * `IosIshX86` and `LinuxX86` share `linux-x86`: both need a 32-bit x86 Linux ELF (iSH is an
 * Alpine/musl userland), so the same static binary serves both. `linux-x86` needs an
 * `i686-linux-musl-gcc` cross-compiler on PATH -- Debian/Ubuntu's own `gcc-multilib` cannot
 * provide one here (the installed `gcc-13` and the only available `gcc-13-multilib` are different
 * point releases with no compatible build), so this build uses a prebuilt i686-linux-musl-cross
 * toolchain from musl.cc instead, which needs nothing from the system package manager at all.
 * This is also, fittingly, the same libc iSH itself runs on.
 *
 * `LinuxModernX64` maps to `linux-x64`, a static musl build cross-compiled the same way, not the
 * `native` target (which links dynamically against whatever libc the build host has). Confirmed
 * on real Alpine Linux via Docker: the dynamic-glibc build fails outright with a bare
 * `exec: no such file or directory` -- the classic symptom of a missing ELF interpreter, since
 * Alpine's loader lives at a different path and glibc and musl are not ABI-compatible -- while
 * the static musl build runs and passes the same live-Discord self-test unmodified. Alpine is a
 * very common Docker base for exactly the kind of small bot this packages, so this was a real
 * gap, not a hypothetical one.
 */
const NATIVE_HOST_BUILD_TARGET: Partial<Record<TargetDevice, string>> = {
	[TargetDevice.LinuxModernX64]: "linux-x64",
	[TargetDevice.WinXpX86]: "win-xp-x86",
	[TargetDevice.WinVistaX86]: "win-x86",
	[TargetDevice.WinLegacyX86]: "win-x86",
	[TargetDevice.WinVistaX64]: "win-x64",
	[TargetDevice.WinLegacyX64]: "win-x64",
	[TargetDevice.LinuxX86]: "linux-x86",
	[TargetDevice.IosIshX86]: "linux-x86",
};

/**
 * Explicit opt-in for targets where a dynamically-linked glibc build also exists, for whoever
 * specifically wants that instead of the static-musl default (e.g. matching a glibc-based
 * production image, or a smaller build when musl's own libc growth is not wanted). Static musl
 * stays the default because it is the one build that runs unmodified on both glibc and musl
 * systems; this map is deliberately not a replacement for it, and is not filled in until a target
 * both has a `build.sh` glibc variant and has been run for real.
 */
const NATIVE_HOST_GLIBC_BUILD_TARGET: Partial<Record<TargetDevice, string>> = {
	[TargetDevice.LinuxModernX64]: "linux-x64-glibc",
};

/**
 * Dynamically linked against musl: what an addon needs on Alpine and iSH, where the static host
 * cannot dlopen. Only built for the targets where musl is the system libc.
 */
const NATIVE_HOST_MUSL_DYNAMIC_BUILD_TARGET: Partial<Record<TargetDevice, string>> = {
	[TargetDevice.LinuxModernX64]: "linux-x64-musl-dyn",
	[TargetDevice.LinuxX86]: "linux-x86-musl-dyn",
	[TargetDevice.IosIshX86]: "linux-x86-musl-dyn",
};

/** "musl" is the static host, "musl-dynamic" and "glibc" the ones that can load native addons. */
export type NativeHostLibc = "musl" | "musl-dynamic" | "glibc";

function buildTargetFor(target: TargetDevice, libc: NativeHostLibc): string | undefined {
	const map =
		libc === "glibc"
			? NATIVE_HOST_GLIBC_BUILD_TARGET
			: libc === "musl-dynamic"
				? NATIVE_HOST_MUSL_DYNAMIC_BUILD_TARGET
				: NATIVE_HOST_BUILD_TARGET;
	return map[target];
}

const PLATFORM_NAMES = ["win32", "linux", "darwin", "freebsd", "openbsd", "android"];

/** `name-linux-x64` -> `name`: cut at the first `-<platform>-` that has something after it. No regex over the whole name. */
function stripPlatformSuffix(name: string): string {
	let cut = -1;
	for (const platform of PLATFORM_NAMES) {
		const marker = `-${platform}-`;
		for (let at = name.indexOf(marker); at !== -1; at = name.indexOf(marker, at + 1)) {
			if (at + marker.length < name.length) {
				if (cut === -1 || at < cut) cut = at;
				break;
			}
		}
	}
	return cut === -1 ? name : name.slice(0, cut);
}

/**
 * Maps an addon's archive path to the package a developer actually depends on. Native packages
 * usually ship as a per-platform sibling (`@lmdb/lmdb-win32-x64`, `mediaplex-win32-x64-msvc`), so
 * the platform suffix is stripped and both the scoped and unscoped spellings are returned.
 */
export function addonPackageNames(addonPath: string): string[] {
	const segments = addonPath.split("/");
	const at = segments.lastIndexOf("node_modules");
	const first = segments[at + 1];
	if (at < 0 || !first) return [addonPath];
	const scoped = first.startsWith("@");
	const scope = scoped ? first : "";
	const raw = (scoped ? segments[at + 2] : first) ?? first;
	const base = stripPlatformSuffix(raw);
	if (!scoped) return [base, raw];
	// `@lmdb/lmdb-win32-x64` is the platform half of plain `lmdb`, not of a package called `@lmdb/lmdb`.
	const own = `${scope}/${base}`;
	return scope.slice(1) === base ? [base, own, `${scope}/${raw}`] : [own, base, `${scope}/${raw}`];
}

/**
 * Splits the native addons found in a project into the ones the bot can live without and the ones
 * it needs. `required` addons decide which host gets built: a static executable cannot dlopen, so a
 * bot that depends on one needs a dynamically linked host. `optional` ones are accelerators whose own
 * library falls back to pure JavaScript, and must not be the reason a build gives up the portable
 * static host.
 */
export function classifyNativeAddons(addonPaths: readonly string[]): {
	required: Map<string, string[]>;
	optional: Map<string, string[]>;
} {
	const required = new Map<string, string[]>();
	const optional = new Map<string, string[]>();
	for (const path of addonPaths) {
		const names = addonPackageNames(path);
		const fallback = names.find((n) => (OPTIONAL_ACCELERATORS as readonly string[]).includes(n));
		const bucket = fallback ? optional : required;
		const key = fallback ?? names[0];
		bucket.set(key, [...(bucket.get(key) ?? []), path]);
	}
	return { required, optional };
}

/**
 * `node-compat.js`'s own dependency graph: `node-web.js` (Web platform bits), `node-misc.js`,
 * `segmenter.js` + `segmenter-tables.js` (Intl.Segmenter), and `native-modules.js` (dynamically
 * imported once a native host is present). `native-selftest.js` and `selftest.js` are test
 * harnesses, not part of what a packaged bot needs, so they are deliberately left out.
 */
const RUNTIME_FILES = [
	"node-compat.js",
	"node-web.js",
	"web-streams.js",
	"node-http.js",
	"node-stream.js",
	"node-fs.js",
	"node-system.js",
	"node-wasm.js",
	"node-wasi.js",
	"node-crypto.js",
	"node-assert.js",
	"node-extras.js",
	"node-sqlite.js",
	"node-websocket.js",
	"node-fetch.js",
	"node-buffer.js",
	"node-misc.js",
	"node-v8.js",
	"node-child.js",
	"node-cluster.js",
	"node-inspect.js",
	"node-url.js",
	"intl.js",
	"intl-zone.js",
	"node-test.js",
	"node-test-mock.js",
	"node-test-util.js",
	"node-crypto2.js",
	"node-asn1.js",
	"node-pkcs.js",
	"node-pqc.js",
	"node-x509.js",
	"node-subtle.js",
	"node-ocb.js",
	"node-keccak.js",
	"url-pattern.js",
	"node-urlpattern.js",
	"whatwg-url.js",
	"idna-data.js",
	"node-crypto-dh.js",
	"node-blake2.js",
	"node-argon2.js",
	"node-http2.js",
	"node-http2-data.js",
	"node-dns.js",
	"segmenter.js",
	"segmenter-tables.js",
	"native-modules.js",
	"node-sea.js",
	"node-repl.js",
	"node-inspector.js",
];

export interface QuickJsBuildOptions {
	target: TargetDevice;
	name: string;
	/** Entry file, relative to the project root, POSIX separators (as `ProjectCollector` gives it). */
	entry: string;
	entries: ArchiveEntry[];
	outputPath: string;
	/** Path to a `graak-c`(.exe) built by `ensureNativeHost()`. */
	nativeHostBinary: string;
	/**
	 * Whether to ship the data behind `Intl` (about 7 MB, 1.5 MB compressed): `all`, `none`, or `auto` (the default), which
	 * ships it when the program or a package it bundles mentions `Intl`, `toLocale*String` or `localeCompare`.
	 */
	intl?: IntlData;
}

export type IntlData = "auto" | "all" | "none";

const INTL_USE = /\bIntl\b|\btoLocale(?:String|DateString|TimeString|UpperCase|LowerCase)\b|\blocaleCompare\b/;
const SCANNED_EXTENSIONS = new Set([".js", ".cjs", ".mjs", ".jsx", ".ts", ".cts", ".mts", ".tsx"]);

/** Whether any bundled source mentions `Intl` or the locale-aware built-ins, which is what needs their data. */
function mentionsIntl(entries: ArchiveEntry[]): boolean {
	for (const entry of entries) {
		if (!SCANNED_EXTENSIONS.has(extname(entry.path))) continue;
		try {
			const text =
				typeof entry.source === "string" ? readFileSync(entry.source, "utf-8") : entry.source.toString("utf-8");
			if (INTL_USE.test(text)) return true;
		} catch {
			// Unreadable: cannot tell, so ship the data.
			return true;
		}
	}
	return false;
}

export interface QuickJsBuildResult {
	outputPath: string;
	launcherPath: string;
	nativeHostBinary: string;
	sizeBytes: number;
	/** SHA-256 over the bundled app files and the native host binary, in write order. */
	sha256: string;
	warnings: string[];
}

export class QuickJsPackager {
	/** Whether this target has a wired-up native host build (see the module doc for why so few do). */
	public static supports(target: TargetDevice): boolean {
		return target in NATIVE_HOST_BUILD_TARGET;
	}

	/**
	 * Whether the host built for `target` with `libc` can `dlopen` a native addon. Windows hosts are
	 * ordinary dynamic executables and always can. On Linux only the dynamically linked glibc build
	 * can: a static musl executable has no dynamic loader to load a library with, and this is a
	 * property of static linking, not a limitation of the host's Node-API layer.
	 */
	public static loadsAddons(target: TargetDevice, libc: NativeHostLibc): boolean {
		const buildTarget = buildTargetFor(target, libc);
		return buildTarget !== undefined && (buildTarget.startsWith("win-") || libc !== "musl");
	}

	/** Every distinct `build.sh` argument a host is built for, in a stable order. */
	public static hostBuildTargets(): string[] {
		return [
			...new Set([
				...Object.values(NATIVE_HOST_BUILD_TARGET),
				...Object.values(NATIVE_HOST_GLIBC_BUILD_TARGET),
				...Object.values(NATIVE_HOST_MUSL_DYNAMIC_BUILD_TARGET),
			]),
		]
			.filter((t): t is string => Boolean(t))
			.sort();
	}

	/**
	 * Compiles the host for one `build.sh` argument from source into `cacheDir` and returns the
	 * executable. Needs a POSIX shell and the target's C toolchain; `ensureNativeHost` only comes here
	 * when there is no matching prebuilt host.
	 */
	public static compileHost(
		repoRoot: string,
		buildTarget: string,
		cacheDir: string,
		onLog: (message: string) => void = () => {}
	): string {
		const exe = join(cacheDir, buildTarget.startsWith("win-") ? "graak-c.exe" : "graak-c");
		if (!hasPosixShell()) {
			throw new RuntimeError(
				`The Graak native host for '${buildTarget}' has to be compiled here, which needs a POSIX shell (sh) and ` +
					"the target's C toolchain, and this machine has no `sh`. Graak ships prebuilt hosts for that reason " +
					"(quickjs/prebuilt/hosts), but none matches this checkout's native sources. Reinstall Graak from its " +
					"published package or a clean checkout, or run the build from WSL or Git Bash."
			);
		}
		onLog(`Building the Graak native host for '${buildTarget}' from source (first run only; cached at ${exe} after)`);
		mkdirSync(cacheDir, { recursive: true });
		const result = spawnSync("sh", [join(repoRoot, "quickjs/native/build.sh"), buildTarget, cacheDir], {
			stdio: "inherit",
		});
		if (result.status !== 0 || !existsSync(exe)) {
			throw new RuntimeError(
				`Building the native host for '${buildTarget}' failed (${result.error?.message ?? `exit ${result.status ?? result.signal}`}). ` +
					"See quickjs/native/build.sh's own output above for the reason."
			);
		}
		return exe;
	}

	/**
	 * Returns the `graak-c` binary for a target, from the cheapest place that has it: the cache
	 * (instant), the prebuilt host that ships with Graak (a decompress), or `quickjs/native/build.sh`
	 * (minutes; needs a shell and a C toolchain). Not a download: there is no published, checksummed
	 * release of this binary, so the only trustworthy sources are the ones built from the pinned
	 * quickjs-ng/mbedTLS/miniz/wasm3 versions the script fetches itself.
	 */
	public static async ensureNativeHost(
		target: TargetDevice,
		libc: NativeHostLibc = "musl",
		onLog: (message: string) => void = () => {}
	): Promise<string> {
		const buildTarget = buildTargetFor(target, libc);
		if (!buildTarget) {
			if (libc !== "musl") {
				const available = Object.keys(
					libc === "glibc" ? NATIVE_HOST_GLIBC_BUILD_TARGET : NATIVE_HOST_MUSL_DYNAMIC_BUILD_TARGET
				);
				throw new RuntimeError(
					`No ${libc} native host build exists yet for ${target}. Only ${available.join(", ")} do. ` +
						"Drop --native-libc to use the static-musl default instead, which every native-host target has."
				);
			}
			throw new RuntimeError(
				`No native host build is wired up yet for ${target}. Only ${Object.keys(NATIVE_HOST_BUILD_TARGET).join(", ")} ` +
					"are, because those are the ones this build can both compile and actually run."
			);
		}

		const repoRoot = dirname(require.resolve("../../package.json"));
		const cacheDir = join(NodeRuntime.cacheDir(), "native-host", buildTarget);
		const exe = join(cacheDir, buildTarget.startsWith("win-") ? "graak-c.exe" : "graak-c");
		// The cached binary is only good for the sources it was built from: a host cached before the
		// native layer changed would otherwise be reused forever, missing whatever changed.
		const sourceHash = QuickJsPackager.nativeSourceHash(repoRoot);
		const marker = join(cacheDir, ".native-source-hash");
		if (existsSync(exe) && existsSync(marker) && readFileSync(marker, "utf-8") === sourceHash) return exe;

		const prebuilt = Prebuilt.host(repoRoot, buildTarget, sourceHash);
		if (prebuilt) {
			mkdirSync(cacheDir, { recursive: true });
			writeFileAtomic(exe, prebuilt);
			chmodSync(exe, 0o755);
			writeFileSync(marker, sourceHash);
			onLog(`Using the prebuilt Graak native host for '${buildTarget}'`);
			return exe;
		}

		QuickJsPackager.compileHost(repoRoot, buildTarget, cacheDir, onLog);
		chmodSync(exe, 0o755);
		writeFileSync(marker, sourceHash);
		return exe;
	}

	/**
	 * Whether every one of these addon files is linked against musl rather than glibc, which decides
	 * which dynamic host fits them: a musl-linked addon cannot load into a glibc process, or the reverse.
	 */
	public static addonsAreMusl(entries: readonly ArchiveEntry[], paths: readonly string[]): boolean {
		const sources = paths
			.map((p) => entries.find((e) => e.path === p)?.source)
			.filter((s): s is string => typeof s === "string");
		// glibc-linked code carries GLIBC_x.y symbol-version strings; musl-linked code names musl's loader
		// or its libc (Rust's musl targets say libc.musl-<arch>.so.1, musl's own toolchains just libc.so).
		return (
			sources.length > 0 &&
			sources.every((file) => {
				const bytes = readFileSync(file);
				if (bytes.includes("GLIBC_")) return false;
				return bytes.includes("libc.musl") || bytes.includes("ld-musl") || bytes.includes("libc.so\0");
			})
		);
	}

	/**
	 * Hash of everything under `quickjs/native/` that ends up inside the host binary. Line endings do
	 * not count: a Windows checkout with CRLF must still recognise the prebuilt hosts.
	 */
	public static nativeSourceHash(repoRoot: string): string {
		return Prebuilt.digest([
			// ca_bundle.c is generated from the building machine's trust store and is not part of the sources.
			...Prebuilt.sourcesUnder(join(repoRoot, "quickjs/native"), "native/").filter(
				([name]) => name !== "native/ca_bundle.c"
			),
			["winxp-compat.patch", join(repoRoot, "quickjs/winxp-compat.patch")],
		]);
	}

	/**
	 * Writes the project, the compatibility layer and the native host into `outputPath`, plus a
	 * launcher script that runs them with no Node.js involved at any point.
	 */
	public static build(options: QuickJsBuildOptions): QuickJsBuildResult {
		const meta = TARGET_METADATA_MAP[options.target];
		if (!meta) throw new RuntimeError(`Unknown target '${options.target}'`);
		const isWindows = meta.nodePlatform === "win32";

		const out = options.outputPath;
		mkdirSync(out, { recursive: true });

		let sizeBytes = 0;
		const hash = createHash("sha256");
		const appDir = join(out, "app");
		for (const entry of options.entries) {
			const dest = join(appDir, entry.path);
			mkdirSync(dirname(dest), { recursive: true });
			const bytes = typeof entry.source === "string" ? readFileSync(entry.source) : entry.source;
			writeFileSync(dest, bytes);
			if (entry.mode) chmodSync(dest, entry.mode);
			sizeBytes += bytes.length;
			hash.update(entry.path).update(bytes);
			if (entry.path === "package.json") {
				writeFileSync(join(out, "package.json"), bytes);
			}
		}

		const runtimeDir = join(out, "runtime");
		mkdirSync(runtimeDir, { recursive: true });
		const repoRoot = dirname(require.resolve("../../package.json"));
		// The locale data `intl.js` reads on demand: shared tables, and per locale its formats and its display names.
		const wantsIntl =
			(options.intl ?? "auto") === "all" || ((options.intl ?? "auto") === "auto" && mentionsIntl(options.entries));
		const intlData = (wantsIntl ? readdirSync(join(repoRoot, "quickjs/runtime")) : []).filter((file) =>
			/^intl-(data|(names-)?[a-z]{2}-([A-Z]{2}|\d{3}))\.js$/.test(file)
		);
		for (const file of [...RUNTIME_FILES, ...intlData]) {
			const from = join(repoRoot, "quickjs/runtime", file);
			const to = join(runtimeDir, file);
			copyFileSync(from, to);
			const bytes = readFileSync(to);
			sizeBytes += bytes.length;
			hash.update(file).update(bytes);
		}

		const hostDest = join(out, isWindows ? "graak-c.exe" : "graak-c");
		copyFileSync(options.nativeHostBinary, hostDest);
		if (!isWindows) chmodSync(hostDest, 0o755);
		const hostBytes = readFileSync(hostDest);
		sizeBytes += hostBytes.length;
		hash.update("graak-c").update(hostBytes);

		const launcherPath = join(out, isWindows ? `${options.name}.cmd` : options.name);
		const appEntry = `app/${options.entry}`;
		if (isWindows) {
			writeFileSync(
				launcherPath,
				[
					"@echo off",
					"setlocal",
					'set "GRAAK_DIR=%~dp0"',
					'set "GRAAK=1"',
					'set "GRAAK_APP_DIR=%GRAAK_DIR%app"',
					'set "GRAAK_ROOT_DIR=%GRAAK_DIR%"',
					`"%GRAAK_DIR%graak-c.exe" "%GRAAK_DIR%runtime\\node-compat.js" "%GRAAK_DIR%${appEntry.replace(/\//g, "\\")}" %*`,
					"exit /b %ERRORLEVEL%",
					"",
				].join("\r\n")
			);
		} else {
			writeFileSync(
				launcherPath,
				[
					"#!/bin/sh",
					'GRAAK_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd) || exit 1',
					'export GRAAK="1"',
					'export GRAAK_APP_DIR="$GRAAK_DIR/app"',
					'export GRAAK_ROOT_DIR="$GRAAK_DIR"',
					`exec "$GRAAK_DIR/graak-c" "$GRAAK_DIR/runtime/node-compat.js" "$GRAAK_DIR/${appEntry}" "$@"`,
					"",
				].join("\n")
			);
			chmodSync(launcherPath, 0o755);
		}

		return {
			outputPath: out,
			launcherPath,
			nativeHostBinary: hostDest,
			sizeBytes,
			sha256: hash.digest("hex"),
			warnings: [
				"This build ships as loose files (app/, runtime/, graak-c) rather than a single compressed " +
					"archive: the quickjs path has no in-runtime unarchiver yet. Distribute the whole output directory.",
			],
		};
	}
}
