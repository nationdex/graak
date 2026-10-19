import { ArgType, NativeFunction } from "@tryforge/forgescript";
import { PolicyEnforcer } from "../../../compiler/PolicyEnforcer";
import { getRoot } from "../../util";

export default new NativeFunction({
	name: "$packageManager",
	version: "1.0.0",
	description: "Returns the package manager or runtime the project uses (bun, pnpm, npm, yarn)",
	unwrap: false,
	output: ArgType.String,
	execute(ctx) {
		return this.success(PolicyEnforcer.detectPackageManager(getRoot(ctx)));
	},
});
