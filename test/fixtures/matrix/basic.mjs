// Pure JavaScript and the built-in modules every target has: hashes, compression, paths, URLs, JSON, Buffer, text
// encoding, timers and numbers. Prints only values that are the same on every operating system.
import { createHash, createHmac, randomBytes } from "node:crypto";
import { brotliCompressSync, brotliDecompressSync, deflateSync, gunzipSync, gzipSync, inflateSync } from "node:zlib";
import { posix } from "node:path";

const lines = [];
const show = (value) => (typeof value === "string" ? value : typeof value === "bigint" ? `${value}n` : JSON.stringify(value));
const say = (...values) => lines.push(values.map(show).join(" "));

async function main() {
	say("sha256", createHash("sha256").update("graak").digest("hex"));
	say("md5", createHash("md5").update("graak").digest("hex"));
	say("sha1", createHash("sha1").update("graak").digest("base64"));
	say("hmac-sha512", createHmac("sha512", "key").update("data").digest("hex").slice(0, 40));
	say("blake2b512", createHash("blake2b512").update("graak").digest("hex").slice(0, 32));
	say("random bytes", randomBytes(16).length);

	const text = "hello hello hello hello";
	say("gzip", gunzipSync(gzipSync(text)).toString("utf8"));
	say("deflate", inflateSync(deflateSync(Buffer.from("abc"))).toString());
	say("brotli", brotliDecompressSync(brotliCompressSync("xyz")).toString());

	say("posix", posix.join("a", "b", "..", "c.txt"), posix.extname("x.tar.gz"), posix.basename("/p/q/r.js", ".js"));
	const url = new URL("https://user@example.com:8443/p/a?x=1&y=two#frag");
	say("url", url.hostname, url.port, url.searchParams.get("y"), new URL("../q", "http://a.test/b/c").href);

	say("json", JSON.parse(JSON.stringify({ n: 1, s: "é", list: [1, 2, null], nested: { ok: true } })));
	say("buffer", Buffer.from("héllo").toString("base64"), Buffer.from("aGk=", "base64").toString(), Buffer.byteLength("✓"));
	say("text", new TextDecoder().decode(new TextEncoder().encode("ok ✓")));

	const order = [];
	process.nextTick(() => order.push("tick"));
	setTimeout(() => order.push("timeout 20"), 20);
	setTimeout(() => order.push("timeout 5"), 5);
	await new Promise((resolve) => setTimeout(resolve, 80));
	say("order", order);

	say("numbers", Math.round(Math.sqrt(2) * 1e6) / 1e6, (0.1 + 0.2).toFixed(2), Number.MAX_SAFE_INTEGER, 2n ** 64n);
	console.log(lines.join("\n"));
}

main();
