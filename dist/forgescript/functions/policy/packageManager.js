"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const forgescript_1 = require("@tryforge/forgescript");
const PolicyEnforcer_1 = require("../../../compiler/PolicyEnforcer");
const util_1 = require("../../util");
exports.default = new forgescript_1.NativeFunction({
    name: "$packageManager",
    version: "1.0.0",
    description: "Returns the package manager or runtime the project uses (bun, pnpm, npm, yarn)",
    unwrap: false,
    output: forgescript_1.ArgType.String,
    execute(ctx) {
        return this.success(PolicyEnforcer_1.PolicyEnforcer.detectPackageManager((0, util_1.getRoot)(ctx)));
    },
});
//# sourceMappingURL=packageManager.js.map