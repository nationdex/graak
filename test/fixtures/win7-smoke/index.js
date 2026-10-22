// Graak Windows smoke test: run the packaged output on the machine you care about (a Windows 7 VM,
// say) and read the PASS/FAIL lines. It uses only built-in modules, so a failure is the host's, not a
// dependency's. The network check is reported separately because a VM may simply have no network.
const results = [];
const check = async (name, fn) => {
	try {
		const detail = await fn();
		results.push(true);
		console.log(`PASS  ${name}${detail ? `  (${detail})` : ""}`);
	} catch (err) {
		results.push(false);
		console.log(`FAIL  ${name}: ${err && err.message ? err.message : err}`);
	}
};
const assert = (cond, message) => {
	if (!cond) throw new Error(message);
};

(async () => {
	console.log(`Graak smoke test on ${process.platform}/${process.arch}, pid ${process.pid}`);
	await check("console formats objects like Node", () => {
		const { inspect } = require("util");
		assert(inspect({ a: [1, { b: 2 }], c: new Map([["k", 1]]) }) === "{ a: [ 1, { b: 2 } ], c: Map(1) { 'k' => 1 } }", "unexpected output");
	});
	await check("path handles drive letters", () => {
		const path = require("path");
		assert(path.join("C:\\a", "b", "..", "c") === "C:\\a\\c" || path.join("C:\\a", "b", "..", "c") === "C:/a/c", path.join("C:\\a", "b", "..", "c"));
		return path.resolve(".");
	});
	await check("fs write, read, stat, readdir, unlink", () => {
		const fs = require("fs");
		const path = require("path");
		const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "fg-smoke-"));
		const file = path.join(dir, "a.txt");
		fs.writeFileSync(file, "héllo");
		assert(fs.readFileSync(file, "utf8") === "héllo", "read back differs");
		assert(fs.statSync(file).isFile(), "stat");
		assert(fs.readdirSync(dir).includes("a.txt"), "readdir");
		fs.unlinkSync(file);
		fs.rmdirSync(dir);
		return dir;
	});
	await check("timers and promises", async () => {
		const started = Date.now();
		await new Promise((resolve) => setTimeout(resolve, 60));
		assert(Date.now() - started >= 50, "timer fired too early");
	});
	await check("crypto sha256 and hmac", () => {
		const crypto = require("crypto");
		assert(crypto.createHash("sha256").update("abc").digest("hex") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", "sha256");
		assert(crypto.createHmac("sha256", "k").update("d").digest("hex").length === 64, "hmac");
	});
	await check("zlib deflate/inflate", () => {
		const zlib = require("zlib");
		const data = Buffer.from("x".repeat(500));
		assert(zlib.inflateSync(zlib.deflateSync(data)).equals(data), "round trip");
	});
	await check("child process output", () => {
		const cp = require("child_process");
		const out = process.platform === "win32" ? cp.execSync("echo graak", { encoding: "utf8" }) : cp.execSync("echo graak", { encoding: "utf8" });
		assert(out.trim() === "graak", JSON.stringify(out));
	});
	await check("uncaught-looking errors keep their stack", () => {
		const e = new Error("boom");
		assert(require("util").inspect(e).startsWith("Error: boom"), "no header");
	});
	for (const addon of ["better-sqlite3", "@napi-rs/canvas", "lmdb"]) {
		let present = true;
		try {
			require.resolve(addon);
		} catch {
			present = false;
		}
		if (!present) continue;
		await check(`native addon ${addon} loads`, () => {
			const mod = require(addon);
			assert(mod, "empty export");
		});
	}
	await check("NETWORK: TLS request to discord.com", async () => {
		const https = require("https");
		const status = await new Promise((resolve, reject) => {
			const req = https.get("https://discord.com/api/v10/gateway", (res) => {
				res.resume();
				resolve(res.statusCode);
			});
			req.on("error", reject);
			setTimeout(() => reject(new Error("timed out after 15s")), 15000);
		});
		assert(status === 200, `HTTP ${status}`);
		return `HTTP ${status}`;
	});
	const failed = results.filter((ok) => !ok).length;
	console.log(failed === 0 ? `\nALL ${results.length} CHECKS PASSED` : `\n${failed} OF ${results.length} CHECKS FAILED`);
	process.exit(failed === 0 ? 0 : 1);
})();
