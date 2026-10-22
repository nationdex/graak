/*
 * Behavioural checks for the quickjs-ng Node compatibility layer.
 *
 * Runs unmodified on both runtimes, which is the point: the same file under `node` and under
 * `qjs -m node-compat.js` must produce the same output. A layer that merely loads proves nothing;
 * these exercise the semantics libraries depend on.
 *
 *   node quickjs/runtime/selftest.js
 *   qjs -m quickjs/runtime/node-compat.js quickjs/runtime/selftest.js
 */

const assert = require("assert");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { EventEmitter } = require("events");
const { Readable, Writable, Transform, PassThrough } = require("stream");
const { StringDecoder } = require("string_decoder");
const querystring = require("querystring");
const util = require("util");
const dc = require("diagnostics_channel");

let passed = 0;
const failures = [];

function test(name, fn) {
	try {
		const result = fn();
		if (result && typeof result.then === "function") {
			return result.then(
				() => {
					passed++;
				},
				(err) => failures.push(`${name}: ${err && err.message}`)
			);
		}
		passed++;
	} catch (err) {
		failures.push(`${name}: ${err && err.message}`);
	}
	return Promise.resolve();
}

async function main() {
	await test("Buffer utf8 round-trip", () => {
		assert.strictEqual(Buffer.from("héllo wörld", "utf8").toString("utf8"), "héllo wörld");
	});

	await test("Buffer handles astral characters as 4-byte sequences", () => {
		const buf = Buffer.from("a😀b", "utf8");
		assert.strictEqual(buf.length, 6, "1 + 4 + 1 bytes");
		assert.strictEqual(buf.toString("utf8"), "a😀b");
	});

	await test("Buffer hex and base64", () => {
		assert.strictEqual(Buffer.from("ff00a0", "hex")[0], 255);
		assert.strictEqual(Buffer.from([255, 0, 160]).toString("hex"), "ff00a0");
		assert.strictEqual(Buffer.from("hello").toString("base64"), "aGVsbG8=");
		assert.strictEqual(Buffer.from("aGVsbG8=", "base64").toString("utf8"), "hello");
	});

	await test("Buffer.concat and equals", () => {
		const joined = Buffer.concat([Buffer.from("ab"), Buffer.from("cd")]);
		assert.strictEqual(joined.toString(), "abcd");
		assert.ok(Buffer.from("ab").equals(Buffer.from("ab")));
		assert.ok(!Buffer.from("ab").equals(Buffer.from("ac")));
	});

	await test("Buffer is a Uint8Array", () => {
		assert.ok(Buffer.from("x") instanceof Uint8Array);
		assert.ok(Buffer.isBuffer(Buffer.alloc(1)));
	});

	await test("TextDecoder replaces a lone surrogate rather than emitting it", () => {
		// 0xED 0xA0 0x80 is a lone high surrogate encoded as UTF-8.
		assert.strictEqual(new TextDecoder().decode(new Uint8Array([0xed, 0xa0, 0x80])).charCodeAt(0), 0xfffd);
	});

	await test("EventEmitter on/once/off ordering", () => {
		const emitter = new EventEmitter();
		const seen = [];
		emitter.on("x", (v) => seen.push(`on:${v}`));
		emitter.once("x", (v) => seen.push(`once:${v}`));
		emitter.emit("x", 1);
		emitter.emit("x", 2);
		assert.deepStrictEqual(seen, ["on:1", "once:1", "on:2"]);
		assert.strictEqual(emitter.listenerCount("x"), 1);
	});

	await test("EventEmitter throws an unhandled error event", () => {
		assert.throws(() => new EventEmitter().emit("error", new Error("boom")));
	});

	await test("path join/resolve/dirname/extname", () => {
		assert.strictEqual(path.join("a", "b", "..", "c"), `a${path.sep}c`);
		assert.strictEqual(path.extname("x/y/file.tar.gz"), ".gz");
		assert.strictEqual(path.basename("x/y/file.js", ".js"), "file");
		assert.ok(path.isAbsolute(path.resolve("relative")));
	});

	await test("path.normalize collapses traversal", () => {
		assert.strictEqual(path.normalize("a/./b/../c"), `a${path.sep}c`);
	});

	await test("fs write/read/stat/readdir/unlink round-trip", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fgtest-"));
		const file = path.join(dir, "sample.txt");
		fs.writeFileSync(file, "contents");
		assert.strictEqual(fs.readFileSync(file, "utf8"), "contents");
		assert.ok(fs.readFileSync(file).length === 8, "binary read returns bytes");
		assert.ok(fs.existsSync(file));
		assert.ok(fs.statSync(file).isFile());
		assert.ok(fs.statSync(dir).isDirectory());
		assert.ok(fs.readdirSync(dir).includes("sample.txt"));
		fs.unlinkSync(file);
		assert.ok(!fs.existsSync(file));
		fs.rmdirSync(dir);
	});

	await test("querystring parse/stringify", () => {
		assert.deepStrictEqual({ ...querystring.parse("a=1&b=two%20words") }, { a: "1", b: "two words" });
		assert.strictEqual(querystring.stringify({ a: 1, b: "x y" }), "a=1&b=x%20y");
	});

	await test("StringDecoder joins a split multi-byte character", () => {
		const decoder = new StringDecoder("utf8");
		const euro = Buffer.from("€", "utf8");
		const first = decoder.write(euro.subarray(0, 1));
		const rest = decoder.write(euro.subarray(1));
		assert.strictEqual(first + rest, "€");
	});

	await test("util.promisify turns a callback API into a promise", async () => {
		const fn = (value, cb) => cb(null, value * 2);
		assert.strictEqual(await util.promisify(fn)(21), 42);
	});

	await test("util.format handles %s and %d", () => {
		assert.strictEqual(util.format("%s is %d", "answer", 42), "answer is 42");
	});

	await test("util.inherits links prototypes", () => {
		function Base() {}
		Base.prototype.hello = () => "hi";
		function Child() {}
		util.inherits(Child, Base);
		assert.strictEqual(new Child().hello(), "hi");
	});

	await test("diagnostics_channel publish/subscribe", () => {
		const seen = [];
		dc.subscribe("fg:test", (msg) => seen.push(msg));
		dc.channel("fg:test").publish({ n: 1 });
		assert.deepStrictEqual(seen, [{ n: 1 }]);
	});

	await test("Readable emits data then end", async () => {
		const readable = new Readable();
		readable.push("a");
		readable.push("b");
		readable.push(null);
		const chunks = [];
		await new Promise((resolve, reject) => {
			readable.on("data", (c) => chunks.push(c.toString()));
			readable.on("end", resolve);
			readable.on("error", reject);
		});
		assert.deepStrictEqual(chunks, ["a", "b"]);
	});

	await test("Readable async iteration", async () => {
		const readable = new Readable({ objectMode: true });
		readable.push(1);
		readable.push(2);
		readable.push(null);
		const seen = [];
		for await (const item of readable) seen.push(item);
		assert.deepStrictEqual(seen, [1, 2]);
	});

	await test("pipe moves data from Readable to Writable", async () => {
		const readable = new Readable();
		readable.push("x");
		readable.push("y");
		readable.push(null);
		const written = [];
		const writable = new Writable({
			write(chunk, _enc, cb) {
				written.push(chunk.toString());
				cb();
			},
		});
		await new Promise((resolve) => {
			writable.on("finish", resolve);
			readable.pipe(writable);
		});
		assert.deepStrictEqual(written, ["x", "y"]);
	});

	await test("Transform rewrites chunks passing through", async () => {
		const upper = new Transform({
			transform(chunk, _enc, cb) {
				cb(null, chunk.toString().toUpperCase());
			},
		});
		const out = [];
		await new Promise((resolve) => {
			upper.on("data", (c) => out.push(c.toString()));
			upper.on("end", resolve);
			upper.write("ab");
			upper.end();
		});
		assert.deepStrictEqual(out, ["AB"]);
	});

	await test("PassThrough forwards unchanged", async () => {
		const pass = new PassThrough();
		const out = [];
		await new Promise((resolve) => {
			pass.on("data", (c) => out.push(c.toString()));
			pass.on("end", resolve);
			pass.end("hello");
		});
		assert.deepStrictEqual(out, ["hello"]);
	});

	await test("structuredClone copies binary data and cycles", () => {
		const bytes = new Uint8Array([1, 2, 3]);
		const source = { bytes, when: new Date(0), set: new Set([1]) };
		source.self = source;
		const copy = structuredClone(source);
		assert.notStrictEqual(copy.bytes, bytes);
		assert.strictEqual(copy.bytes[2], 3, "bytes must survive the clone");
		assert.strictEqual(copy.when.getTime(), 0);
		assert.ok(copy.set.has(1));
		assert.strictEqual(copy.self, copy, "cycles must be preserved");
	});

	await test("AbortController signals its listeners", () => {
		const controller = new AbortController();
		let aborted = false;
		controller.signal.addEventListener("abort", () => {
			aborted = true;
		});
		controller.abort();
		assert.ok(aborted);
		assert.ok(controller.signal.aborted);
	});

	await test("process basics are populated", () => {
		assert.ok(typeof process.cwd() === "string" && process.cwd().length > 0);
		assert.ok(typeof process.platform === "string");
		assert.ok(process.env && typeof process.env === "object");
	});

	await test("unimplemented modules fail loudly instead of pretending", () => {
		// Only meaningful on the quickjs layer; on Node these modules genuinely exist.
		const net = require("net");
		if (net.__graakUnavailable) {
			assert.throws(() => net.createServer(), /not available on the quickjs-ng runtime/);
		}
	});

	const total = passed + failures.length;
	for (const failure of failures) console.log(`  FAIL  ${failure}`);
	console.log(`\nselftest: ${passed}/${total} passed`);
	if (failures.length && typeof process !== "undefined" && process.exit) process.exit(1);
}

main();
