import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	ALL_TARGETS,
	InvalidPackageManagerError,
	InvalidTargetError,
	parseTargetDevice,
	type TargetDevice,
} from "../structures";

export const PACKAGE_MANAGERS = ["bun", "pnpm", "npm", "yarn"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

const LOCKFILES: ReadonlyArray<[string, PackageManager]> = [
	["bun.lock", "bun"],
	["bun.lockb", "bun"],
	["pnpm-lock.yaml", "pnpm"],
	["yarn.lock", "yarn"],
	["package-lock.json", "npm"],
	["npm-shrinkwrap.json", "npm"],
];

export class PolicyEnforcer {
	public static parsePackageManager(value: unknown): PackageManager | null {
		if (typeof value !== "string") return null;
		const normalized = value.trim().toLowerCase();
		return (PACKAGE_MANAGERS as readonly string[]).includes(normalized) ? (normalized as PackageManager) : null;
	}

	/**
	 * Parses a user supplied package manager, falling back to detection when empty.
	 * Throws on unknown values so policy checks can never be bypassed with typos.
	 */
	public static resolvePackageManager(value: unknown, rootDir: string = process.cwd()): PackageManager {
		if (value === undefined || value === null || value === "") {
			return PolicyEnforcer.detectPackageManager(rootDir);
		}
		const pm = PolicyEnforcer.parsePackageManager(value);
		if (!pm) throw new InvalidPackageManagerError(String(value), PACKAGE_MANAGERS);
		return pm;
	}

	/**
	 * Detects the package manager (or runtime) a project uses. The project's own declaration wins
	 * over lockfiles, lockfiles win over the invoking environment.
	 */
	public static detectPackageManager(rootDir: string = process.cwd()): PackageManager {
		try {
			const pkg = JSON.parse(readFileSync(join(rootDir, "package.json"), "utf-8"));
			if (typeof pkg.packageManager === "string") {
				const pm = PolicyEnforcer.parsePackageManager(pkg.packageManager.split("@")[0]);
				if (pm) return pm;
			}
		} catch {
			// No readable package.json, continue with lockfiles
		}

		for (const [file, pm] of LOCKFILES) {
			if (existsSync(join(rootDir, file))) return pm;
		}

		const userAgent = process.env.npm_config_user_agent ?? "";
		for (const pm of PACKAGE_MANAGERS) {
			if (userAgent.startsWith(`${pm}/`)) return pm;
		}

		if (typeof process.versions.bun === "string") return "bun";
		return "npm";
	}

	/**
	 * Targets permitted for a package manager. All package managers now have full access
	 * to legacy targets (XP, Vista, 7, iSH) and modern platforms.
	 */
	public static getAllowedTargets(_packageManager: PackageManager): TargetDevice[] {
		return [...ALL_TARGETS];
	}

	public static assertTargetAllowed(
		targetInput: unknown,
		packageManager: PackageManager = PolicyEnforcer.detectPackageManager()
	): TargetDevice {
		const target = parseTargetDevice(targetInput);
		if (!target) throw new InvalidTargetError(String(targetInput), ALL_TARGETS);

		const pm = PolicyEnforcer.parsePackageManager(packageManager);
		if (!pm) {
			throw new InvalidPackageManagerError(String(packageManager), PACKAGE_MANAGERS);
		}

		return target;
	}

	/**
	 * Non-throwing variant of {@link PolicyEnforcer.assertTargetAllowed}.
	 */
	public static checkTarget(
		targetInput: unknown,
		packageManager: PackageManager = PolicyEnforcer.detectPackageManager()
	): { allowed: boolean; reason?: string; target?: TargetDevice } {
		try {
			const target = PolicyEnforcer.assertTargetAllowed(targetInput, packageManager);
			return { allowed: true, target };
		} catch (err: unknown) {
			return {
				allowed: false,
				reason: err instanceof Error ? err.message : String(err),
			};
		}
	}
}
