"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyEnforcer = exports.PACKAGE_MANAGERS = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const structures_1 = require("../structures");
exports.PACKAGE_MANAGERS = ["bun", "pnpm", "npm", "yarn"];
const LOCKFILES = [
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["package-lock.json", "npm"],
    ["npm-shrinkwrap.json", "npm"],
];
class PolicyEnforcer {
    static parsePackageManager(value) {
        if (typeof value !== "string")
            return null;
        const normalized = value.trim().toLowerCase();
        return exports.PACKAGE_MANAGERS.includes(normalized) ? normalized : null;
    }
    /**
     * Parses a user supplied package manager, falling back to detection when empty.
     * Throws on unknown values so policy checks can never be bypassed with typos.
     */
    static resolvePackageManager(value, rootDir = process.cwd()) {
        if (value === undefined || value === null || value === "") {
            return PolicyEnforcer.detectPackageManager(rootDir);
        }
        const pm = PolicyEnforcer.parsePackageManager(value);
        if (!pm)
            throw new structures_1.InvalidPackageManagerError(String(value), exports.PACKAGE_MANAGERS);
        return pm;
    }
    /**
     * Detects the package manager (or runtime) a project uses. The project's own declaration wins
     * over lockfiles, lockfiles win over the invoking environment.
     */
    static detectPackageManager(rootDir = process.cwd()) {
        try {
            const pkg = JSON.parse((0, node_fs_1.readFileSync)((0, node_path_1.join)(rootDir, "package.json"), "utf-8"));
            if (typeof pkg.packageManager === "string") {
                const pm = PolicyEnforcer.parsePackageManager(pkg.packageManager.split("@")[0]);
                if (pm)
                    return pm;
            }
        }
        catch {
            // No readable package.json, continue with lockfiles
        }
        for (const [file, pm] of LOCKFILES) {
            if ((0, node_fs_1.existsSync)((0, node_path_1.join)(rootDir, file)))
                return pm;
        }
        const userAgent = process.env.npm_config_user_agent ?? "";
        for (const pm of exports.PACKAGE_MANAGERS) {
            if (userAgent.startsWith(`${pm}/`))
                return pm;
        }
        if (typeof process.versions.bun === "string")
            return "bun";
        return "npm";
    }
    /**
     * Targets permitted for a package manager. All package managers now have full access
     * to legacy targets (XP, Vista, 7, iSH) and modern platforms.
     */
    static getAllowedTargets(_packageManager) {
        return [...structures_1.ALL_TARGETS];
    }
    static assertTargetAllowed(targetInput, packageManager = PolicyEnforcer.detectPackageManager()) {
        const target = (0, structures_1.parseTargetDevice)(targetInput);
        if (!target)
            throw new structures_1.InvalidTargetError(String(targetInput), structures_1.ALL_TARGETS);
        const pm = PolicyEnforcer.parsePackageManager(packageManager);
        if (!pm) {
            throw new structures_1.InvalidPackageManagerError(String(packageManager), exports.PACKAGE_MANAGERS);
        }
        return target;
    }
    /**
     * Non-throwing variant of {@link PolicyEnforcer.assertTargetAllowed}.
     */
    static checkTarget(targetInput, packageManager = PolicyEnforcer.detectPackageManager()) {
        try {
            const target = PolicyEnforcer.assertTargetAllowed(targetInput, packageManager);
            return { allowed: true, target };
        }
        catch (err) {
            return {
                allowed: false,
                reason: err instanceof Error ? err.message : String(err),
            };
        }
    }
}
exports.PolicyEnforcer = PolicyEnforcer;
//# sourceMappingURL=PolicyEnforcer.js.map