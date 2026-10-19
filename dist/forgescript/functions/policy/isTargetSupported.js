"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const PolicyEnforcer_1 = require("../../../compiler/PolicyEnforcer");
const util_1 = require("../../util");
exports.default = new forgescript_1.NativeFunction({
    name: "$isTargetSupported",
    version: "1.0.0",
    description: "Returns whether Graak builds a target for the given or detected package manager",
    unwrap: true,
    brackets: true,
    output: forgescript_1.ArgType.Boolean,
    args: [
        {
            name: "target",
            description: "Target identifier (e.g. ios-ish-x86, win-legacy-x86, linux-modern-x64)",
            rest: false,
            type: forgescript_1.ArgType.String,
            required: true,
        },
        {
            name: "packageManager",
            description: "Package manager (bun, pnpm, npm, yarn), detected from the project when empty",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
    ],
    execute(ctx, [target, pm]) {
        try {
            return this.success(PolicyEnforcer_1.PolicyEnforcer.checkTarget(target, (0, util_1.packageManagerArg)(ctx, pm)).allowed);
        }
        catch (err) {
            return this.error((0, util_1.toError)(err));
        }
    },
});
//# sourceMappingURL=isTargetSupported.js.map