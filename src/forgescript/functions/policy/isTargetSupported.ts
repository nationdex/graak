import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { PolicyEnforcer } from "../../../compiler/PolicyEnforcer";
import { packageManagerArg, toError } from "../../util";

export default new NativeFunction({
	name: "$isTargetSupported",
	version: "1.0.0",
	description: "Returns whether Graak builds a target for the given or detected package manager",
	unwrap: true,
	brackets: true,
	output: ArgType.Boolean,
	args: [
		{
			name: "target",
			description: "Target identifier (e.g. ios-ish-x86, win-legacy-x86, linux-modern-x64)",
			rest: false,
			type: ArgType.String,
			required: true,
		},
		{
			name: "packageManager",
			description: "Package manager (bun, pnpm, npm, yarn), detected from the project when empty",
			rest: false,
			type: ArgType.String,
		},
	],
	execute(ctx, [target, pm]) {
		try {
			return this.success(PolicyEnforcer.checkTarget(target, packageManagerArg(ctx, pm)).allowed);
		} catch (err) {
			return this.error(toError(err));
		}
	},
});
