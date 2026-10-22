// Credentials are compared, not shown: the output carries a salted, iterated derivation of the password component, so a
// difference still fails the comparison without any password (even a made-up one) being written to the log.
const digest = (value) => require("crypto").pbkdf2Sync(String(value), "graak-corpus", 1000, 8, "sha256").toString("hex");
const cases = [
	["https://user:pa%20ss@Example.COM:8080/a/./b/../c?x=1&y=2#frag"],
	["http://example.com:80/"], ["https://example.com:443/x"], ["http://example.com:8080"], ["HTTP://EXAMPLE.com"],
	["http://a b.com"], ["http://[::1]:3000/p"], ["http://[2001:db8:0:0:0:0:0:1]/"], ["http://192.168.0.1:81/"], ["http://0x7f.1/"],
	["https://example.com/a b/ü?q=a b&r=ü#h h"], ["https://example.com/%7Efoo/%2e%2e/bar"], ["https://example.com/a/b/../../../c"],
	["https://example.com?x=1"], ["https://example.com#f"], ["https://example.com/path/"], ["https://example.com//double//slash"],
	["/rel/path", "https://base.org/dir/file?q#h"], ["../up", "https://base.org/a/b/c"], ["./same", "https://base.org/a/b/c"], ["?only=query", "https://base.org/a/b?old"],
	["#only-hash", "https://base.org/a?b"], ["//other.net/x", "https://base.org/a"], ["", "https://base.org/a?b#c"], ["x", "https://base.org"],
	["file:///C:/Users/me/a%20b.txt"], ["file:///home/me/x.txt"], ["file://server/share/f"],
	["mailto:someone@example.com?subject=hi"], ["data:text/plain;base64,SGVsbG8="], ["javascript:alert(1)"], ["custom://host/p?q#h"], ["blob:https://a.com/uuid"],
	["ws://example.com/socket"], ["wss://example.com:8443/socket?x=1"],
	["https://discord.com/api/v10/gateway/bot"], ["https://cdn.discordapp.com/avatars/1/2.png?size=256"], ["https://discord.com/api/v10/channels/123/messages?limit=50&before=9"],
	["not a url"], ["http://"], ["http://exa mple.com"], ["https://example.com:99999"], ["//no-base"], ["http://[::1"],
];
const out = [];
for (const [input, base] of cases) {
	try {
		const u = base === undefined ? new URL(input) : new URL(input, base);
		out.push([input, base, u.href, u.origin, u.protocol, u.username, digest(u.password), u.host, u.hostname, u.port, u.pathname, u.search, u.hash]);
	} catch (e) { out.push([input, base, "THROWS", e.name, e.code]); }
}
for (const line of out) console.log(JSON.stringify(line));

const u = new URL("https://example.com/p?a=1&b=2&a=3#h");
console.log([...u.searchParams], u.searchParams.getAll("a"), u.searchParams.get("zz"), u.searchParams.has("b"), u.searchParams.size);
u.searchParams.append("c", "x y&z"); u.searchParams.set("a", "9"); u.searchParams.delete("b"); u.searchParams.sort();
console.log(u.href, String(u.searchParams));
u.search = "?q=1"; console.log(u.href, [...u.searchParams]);
u.hash = "new"; u.pathname = "/a b/c"; u.port = "8080"; u.hostname = "other.org"; u.protocol = "http"; u.username = "me"; u.password = "p@ss";
console.log(u.href, u.origin);
u.port = "80"; console.log(u.href);
u.host = "h.com:99"; console.log(u.href);
const sp = new URLSearchParams({ a: "1", b: "two words", "k&": "v=" });
console.log(sp.toString(), new URLSearchParams("a=1&a=2&b=%C3%BC+x").getAll("a"), new URLSearchParams([["x", "1"], ["y", "2"]]).toString(), [...new URLSearchParams("?a=%20&b=+")]);
console.log(URL.canParse("http://x"), URL.canParse("nope"), URL.canParse("/p", "http://x"));
console.log(JSON.stringify({ u: new URL("http://a.com/x") }), String(new URL("http://a.com/x")));
const url = require("url");
console.log(url.fileURLToPath("file:///home/me/a%20b.txt"), url.pathToFileURL("/tmp/a b#c").href);
console.log(JSON.stringify(url.parse("http://user:pass@host.com:8080/p/a/t/h?query=string#hash")));
console.log(JSON.stringify(url.parse("/a/b?x=1&y=2", true).query), url.format({ protocol: "https", hostname: "x.com", pathname: "/p", query: { a: 1, b: "c d" } }));
console.log(url.resolve("http://a.com/b/c/d", "../e"), url.resolve("/one/two/three", "four"), url.resolve("http://example.com/", "/one"));
console.log(new URL("https://example.com/a"), new URLSearchParams("a=1&b=2"));
