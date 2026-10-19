import { type TargetDevice } from "../structures";
export declare const PACKAGE_MANAGERS: readonly ["bun", "pnpm", "npm", "yarn"];
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];
export declare class PolicyEnforcer {
    static parsePackageManager(value: unknown): PackageManager | null;
    /**
     * Parses a user supplied package manager, falling back to detection when empty.
     * Throws on unknown values so policy checks can never be bypassed with typos.
     */
    static resolvePackageManager(value: unknown, rootDir?: string): PackageManager;
    /**
     * Detects the package manager (or runtime) a project uses. The project's own declaration wins
     * over lockfiles, lockfiles win over the invoking environment.
     */
    static detectPackageManager(rootDir?: string): PackageManager;
    /**
     * Targets permitted for a package manager. All package managers now have full access
     * to legacy targets (XP, Vista, 7, iSH) and modern platforms.
     */
    static getAllowedTargets(_packageManager: PackageManager): TargetDevice[];
    static assertTargetAllowed(targetInput: unknown, packageManager?: PackageManager): TargetDevice;
    /**
     * Non-throwing variant of {@link PolicyEnforcer.assertTargetAllowed}.
     */
    static checkTarget(targetInput: unknown, packageManager?: PackageManager): {
        allowed: boolean;
        reason?: string;
        target?: TargetDevice;
    };
}
//# sourceMappingURL=PolicyEnforcer.d.ts.map