"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const PolicyEnforcer_1 = require("../../../compiler/PolicyEnforcer");
const util_1 = require("../../util");
exports.default = new forgescript_1.NativeFunction({
    name: "$supportedTargets",
    version: "1.0.0",
    description: "Returns the targets Graak builds for a package manager",
    unwrap: true,
    brackets: false,
    output: forgescript_1.ArgType.String,
    args: [
        {
            name: "packageManager",
            description: "Package manager (bun, pnpm, npm, yarn), detected from the project when empty",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
        {
            name: "separator",
            description: "Separator between targets, defaults to ,",
            rest: false,
            type: forgescript_1.ArgType.String,
        },
    ],
    execute(ctx, [pm, separator]) {
        try {
            return this.success(PolicyEnforcer_1.PolicyEnforcer.getAllowedTargets((0, util_1.packageManagerArg)(ctx, pm)).join(separator ?? ","));
        }
        catch (err) {
            return this.error((0, util_1.toError)(err));
        }
    },
});
//# sourceMappingURL=supportedTargets.js.map