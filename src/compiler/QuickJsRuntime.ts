import { chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RuntimeError, TargetDevice } from "../structures";
import { downloadToFile } from "./Download";
import { NodeRuntime } from "./NodeRuntime";

/**
 * Obtains a [quickjs-ng](https://github.com/quickjs-ng/quickjs) engine binary for a target.
 *
 * This exists because the Node.js path has a hard ceiling on old hardware, and quickjs-ng does
 * not share it. Node's own platform support decides which *language* a machine can run: Windows 7
 * is stuck on Node 12, and 32-bit Linux on an unofficial Node 12.16.3, both far below what
 * current discord.js is written in. quickjs-ng is a small C99 engine with no such coupling — the
 * project publishes a 32-bit Windows build and a 32-bit Linux build of a *current* JavaScript
 * engine, which is the thing Node cannot offer those platforms at all.
 *
 * Measured against the official v0.16.2 binaries rather than assumed:
 *
 * - Every piece of syntax that fails to parse on the Windows 7 Node pin runs here: optional
 *   chaining, nullish coalescing and its assignment form, private class methods calling `super`,
 *   class static blocks, async generators, `Array.prototype.at`/`findLast`, `Object.hasOwn`,
 *   `String.prototype.replaceAll`/`toWellFormed`, `Promise.any`, `AggregateError`, BigInt.
 * - The 32-bit Linux build is static-pie linked, so it carries no glibc version requirement.
 * - The 32-bit Windows build declares PE subsystem 4.0, but its imports are what actually decide
 *   where it runs: `InitOnceExecuteOnce`, `InitializeConditionVariable`, `WakeConditionVariable`
 *   and `SleepConditionVariableCS`. All four are Windows Vista and later, and all four come from
 *   one block in the engine's `cutils.h` guarded by `JS_HAVE_THREADS`. So Vista and 7 are
 *   expected to work unmodified, and Windows XP needs that single block replaced (or compiled
 *   out) rather than a port.
 *
 * What this does NOT yet provide is a runtime: quickjs-ng is an engine, and a ForgeScript bot
 * needs Node's library surface on top of it. Scanning the real dependency tree, that is 30
 * builtin modules, led by `assert`, `util`, `stream`, `buffer`, `fs`, `process`, `events` and
 * `crypto`, plus sockets and TLS for Discord. Until that layer exists, this module is how the
 * engine is fetched and verified, not a way to run a bot.
 */

/** Release the pinned checksums below were taken from. */
export const QUICKJS_VERSION = "v0.16.2";
/** No quickjs-ng release binary is anywhere near this large; a response that is, is not one. */
const MAX_ENGINE_DOWNLOAD = 64 * 1024 * 1024;

const RELEASE_URL = "https://github.com/quickjs-ng/quickjs/releases/download";

export interface QuickJsAsset {
	/** Asset file name in the quickjs-ng release. */
	asset: string;
	/**
	 * SHA-256 of that asset, pinned the same way community Node.js runtimes are: quickjs-ng
	 * publishes no checksum file with its releases, so nothing is downloaded without a hash
	 * recorded here first.
	 */
	sha256: string | null;
}

/**
 * quickjs-ng assets that match a Graak target. Targets are absent when the release has no
 * build for them, which is not the same as the target being unsupported by the engine — it means
 * it would have to be built from source.
 */
export const QUICKJS_TARGET_ASSETS: Partial<Record<TargetDevice, QuickJsAsset>> = {
	[TargetDevice.WinXpX86]: {
		asset: "qjs-windows-x86.exe",
		sha256: "1354a90a4587e2d917e65506d7b22a8ef9f76e53ff6e6c0027b3976210e83273",
	},
	[TargetDevice.WinVistaX86]: {
		asset: "qjs-windows-x86.exe",
		sha256: "1354a90a4587e2d917e65506d7b22a8ef9f76e53ff6e6c0027b3976210e83273",
	},
	[TargetDevice.WinVistaX64]: {
		asset: "qjs-windows-x86_64.exe",
		sha256: "7b27412de844403545bd151fbe49191b4d5b91a9e15b5db7c863fea54639a82b",
	},
	[TargetDevice.WinLegacyX86]: {
		asset: "qjs-windows-x86.exe",
		sha256: "1354a90a4587e2d917e65506d7b22a8ef9f76e53ff6e6c0027b3976210e83273",
	},
	[TargetDevice.WinLegacyX64]: {
		asset: "qjs-windows-x86_64.exe",
		sha256: "7b27412de844403545bd151fbe49191b4d5b91a9e15b5db7c863fea54639a82b",
	},
	[TargetDevice.WinX86]: {
		asset: "qjs-windows-x86.exe",
		sha256: "1354a90a4587e2d917e65506d7b22a8ef9f76e53ff6e6c0027b3976210e83273",
	},
	[TargetDevice.WinModernX64]: {
		asset: "qjs-windows-x86_64.exe",
		sha256: "7b27412de844403545bd151fbe49191b4d5b91a9e15b5db7c863fea54639a82b",
	},
	[TargetDevice.LinuxX86]: {
		asset: "qjs-linux-x86",
		sha256: "473051a31954e142e42b0c6a35efca9dd57b86f0b97ba116eb6c021ba1f903c0",
	},
	[TargetDevice.LinuxArmV7]: {
		asset: "qjs-linux-armv7",
		sha256: "c967653e40db763561e952b9820a7acba03b4a526d531ab74142dd636399815c",
	},
	[TargetDevice.LinuxModernX64]: {
		asset: "qjs-linux-x86_64",
		sha256: "c5e1b16adfa36def7ac523d6ba54edc77ef66a4dfd65d73e6eae19025f9b7b0a",
	},
	[TargetDevice.LinuxModernArm64]: {
		asset: "qjs-linux-aarch64",
		sha256: "5fb05fd4e81f26c0039f7166ed9af1050968a0e252c981c461a6aa3376244e6b",
	},
	[TargetDevice.DarwinX64]: {
		asset: "qjs-darwin-x86_64",
		sha256: "4448991c0500dbe40c7b2f91ba39275995413aa4ee59db3b513b68350908a413",
	},
	[TargetDevice.DarwinArm64]: {
		asset: "qjs-darwin-arm64",
		sha256: "f6200e9856c45578a5d42ac873a32f3f994b421e29df9f63b452d9c7145015fc",
	},
};

/**
 * Windows APIs the published 32-bit build imports that do not exist before Windows Vista. Kept
 * here because it is the concrete list an XP build has to deal with, and because it is checked
 * by a test: if a future release starts importing something newer, that should be noticed rather
 * than discovered on a user's machine.
 */
export const QUICKJS_VISTA_ONLY_IMPORTS = [
	"InitOnceExecuteOnce",
	"InitializeConditionVariable",
	"WakeConditionVariable",
	"SleepConditionVariableCS",
] as const;

export class QuickJsRuntime {
	public static cacheDir(): string {
		return join(NodeRuntime.cacheDir(), "quickjs");
	}

	public static assetFor(target: TargetDevice): QuickJsAsset | null {
		return QUICKJS_TARGET_ASSETS[target] ?? null;
	}

	public static downloadUrl(asset: string, version: string = QUICKJS_VERSION): string {
		return `${RELEASE_URL}/${version}/${asset}`;
	}

	/**
	 * Downloads an engine binary into the cache, verifying it against the pinned checksum.
	 *
	 * A missing checksum is refused rather than trusted. quickjs-ng ships no SHASUMS file, so
	 * "no hash recorded" means nobody has vouched for that asset, and downloading an executable
	 * on that basis is exactly what `RuntimeRegistry` already refuses to do for community Node
	 * builds.
	 */
	public static async ensure(
		target: TargetDevice,
		options: { version?: string; sha256?: string } = {}
	): Promise<string> {
		const entry = QuickJsRuntime.assetFor(target);
		if (!entry) {
			throw new RuntimeError(
				`quickjs-ng publishes no prebuilt engine for ${target}; it would have to be built from source.`
			);
		}

		const version = options.version ?? QUICKJS_VERSION;
		const expected = options.sha256 ?? entry.sha256;
		if (!expected) {
			throw new RuntimeError(
				`No SHA-256 is pinned for quickjs-ng ${version} '${entry.asset}'. Graak does not download an ` +
					"executable it cannot verify; record the checksum first."
			);
		}

		const dir = join(QuickJsRuntime.cacheDir(), version, target);
		const file = join(dir, entry.asset);
		if (existsSync(file)) return file;

		mkdirSync(dir, { recursive: true });
		// Streamed to a temporary file, checked against the pinned checksum as it arrives, and moved into place only if it matches.
		await downloadToFile(QuickJsRuntime.downloadUrl(entry.asset, version), file, {
			maxBytes: MAX_ENGINE_DOWNLOAD,
			sha256: expected,
		});
		if (!entry.asset.endsWith(".exe")) chmodSync(file, 0o755);
		return file;
	}

	/**
	 * Reads the DLL function names a Windows build imports. Used to decide how old a Windows a
	 * binary can actually run on, which the PE header's declared subsystem version does not tell
	 * you: the published 32-bit build claims subsystem 4.0 while importing Vista-only functions.
	 *
	 * This is a deliberately shallow scan of the file's ASCII contents rather than a full import
	 * directory walk. It is used to answer "does this reference something too new", where a false
	 * positive is safe and only a false negative would mislead.
	 */
	public static importedSymbols(binaryPath: string, wanted: readonly string[]): string[] {
		const text = readFileSync(binaryPath).toString("latin1");
		return wanted.filter((symbol) => text.includes(`${symbol}\0`) || text.includes(symbol));
	}

	/**
	 * Oldest Windows a given engine binary can run on, judged by what it imports.
	 * Returns `null` for a binary that is not a Windows build.
	 */
	public static windowsFloor(binaryPath: string): "xp" | "vista" | null {
		if (!readFileSync(binaryPath, { encoding: "latin1", flag: "r" }).startsWith("MZ")) return null;
		const found = QuickJsRuntime.importedSymbols(binaryPath, QUICKJS_VISTA_ONLY_IMPORTS);
		return found.length > 0 ? "vista" : "xp";
	}
}
