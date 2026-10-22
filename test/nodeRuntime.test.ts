import assert from "node:assert/strict";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { NodeRuntime } from "../dist/index.js";

test("a runtime binary is read for its version, never run", {
	skip: process.platform === "win32" && "needs a shell script",
}, () => {
	// A program that leaves a mark if it is ever executed, and carries no version a reader could find.
	const dir = mkdtempSync(join(tmpdir(), "graak-readversion-"));
	const marker = join(dir, "was-run");
	const script = join(dir, "not-node");
	writeFileSync(script, `#!/bin/sh\ntouch '${marker}'\necho v99.0.0\n`);
	chmodSync(script, 0o755);
	assert.equal(NodeRuntime.readVersion(script), null);
	assert.equal(existsSync(marker), false, "the file was executed to ask its version");
});

test("the version embedded in an official Node.js build is found without running it", () => {
	const version = NodeRuntime.readVersion(process.execPath);
	if (version === null) return; // a distribution build that does not embed its release URL
	assert.equal(version, process.versions.node);
});

test("only a well-formed release version and file key can name a cache directory", async () => {
	for (const [version, key] of [
		["../../etc", "linux-x64"],
		["22.11.0", "../x"],
		["22.11.0/../..", "linux-x64"],
		["22.11", "linux-x64"],
		["22.11.0", "Linux X64"],
	]) {
		await assert.rejects(
			NodeRuntime.ensureOfficial(version, key),
			/Not a Node\.js release version and file key/,
			`${version} ${key}`
		);
	}
});
