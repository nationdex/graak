import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { PolicyEnforcer } from "../../../compiler/PolicyEnforcer";
import { packageManagerArg, toError } from "../../util";

export default new NativeFunction({
	name: "$supportedTargets",
	version: "1.0.0",
	description: "Returns the targets Graak builds for a package manager",
	unwrap: true,
	brackets: false,
	output: ArgType.String,
	args: [
		{
			name: "packageManager",
			description: "Package manager (bun, pnpm, npm, yarn), detected from the project when empty",
			rest: false,
			type: ArgType.String,
		},
		{
			name: "separator",
			description: "Separator between targets, defaults to ,",
			rest: false,
			type: ArgType.String,
		},
	],
	execute(ctx, [pm, separator]) {
		try {
			return this.success(PolicyEnforcer.getAllowedTargets(packageManagerArg(ctx, pm)).join(separator ?? ","));
		} catch (err) {
			return this.error(toError(err));
		}
	},
});
