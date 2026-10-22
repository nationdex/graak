import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { downloadToFile, RuntimeError } from "../dist/index.js";

const body = Buffer.from("not really a runtime, but exactly these bytes ".repeat(500));
const sha = createHash("sha256").update(body).digest("hex");

async function withServer<T>(run: (base: string) => Promise<T>): Promise<T> {
	const server: Server = createServer((req, res) => {
		if (req.url === "/ok") res.end(body);
		else if (req.url === "/stream") {
			// No Content-Length: the size is only known by counting what arrives.
			res.write(body.subarray(0, 1000));
			setTimeout(() => res.end(body.subarray(1000)), 10);
		} else {
			res.statusCode = 404;
			res.end();
		}
	});
	await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
	try {
		return await run(`http://127.0.0.1:${(server.address() as { port: number }).port}`);
	} finally {
		server.close();
	}
}

const emptyDir = () => mkdtempSync(join(tmpdir(), "graak-download-"));

test("a download is written, hashed and moved into place only when complete", async () => {
	await withServer(async (base) => {
		const dir = emptyDir();
		const file = join(dir, "runtime.bin");
		const digest = await downloadToFile(`${base}/ok`, file, { maxBytes: 1_000_000, sha256: sha });
		assert.equal(digest, sha);
		assert.deepEqual(readFileSync(file), body);
		assert.deepEqual(readdirSync(dir), ["runtime.bin"], "no temporary file is left behind");
	});
});

test("a body with the wrong checksum is refused and leaves nothing", async () => {
	await withServer(async (base) => {
		const dir = emptyDir();
		const file = join(dir, "runtime.bin");
		await assert.rejects(
			downloadToFile(`${base}/ok`, file, { maxBytes: 1_000_000, sha256: "0".repeat(64) }),
			(error) => error instanceof RuntimeError && /Checksum mismatch/.test(error.message)
		);
		assert.equal(existsSync(file), false);
		assert.deepEqual(readdirSync(dir), []);
	});
});

test("a body over the limit stops the transfer and leaves nothing, with or without a Content-Length", async () => {
	await withServer(async (base) => {
		for (const path of ["/ok", "/stream"]) {
			const dir = emptyDir();
			const file = join(dir, "runtime.bin");
			await assert.rejects(downloadToFile(`${base}${path}`, file, { maxBytes: 5000 }), /limit/, path);
			assert.equal(existsSync(file), false, path);
			assert.deepEqual(readdirSync(dir), [], path);
		}
	});
});

test("an error status is reported and nothing is written", async () => {
	await withServer(async (base) => {
		const dir = emptyDir();
		await assert.rejects(
			downloadToFile(`${base}/missing`, join(dir, "x"), { maxBytes: 1000 }),
			/Download failed \(404\)/
		);
		assert.deepEqual(readdirSync(dir), []);
	});
});
