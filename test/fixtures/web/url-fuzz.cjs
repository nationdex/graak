/* Differential fuzz: WHATWG URL parsing, relative resolution, setters, searchParams and the legacy url module, over
   seeded random inputs built from awkward pieces. */
const { URL, URLSearchParams } = require("url");
const legacy = require("url");

let seed = 0x9e3779b9;
const rand = () => {
	seed += 0x6d2b79f5;
	let t = seed;
	t = Math.imul(t ^ (t >>> 15), t | 1);
	t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const maybe = (p, value) => (rand() < p ? value : "");

const schemes = ["http", "https", "ws", "wss", "ftp", "file", "blob", "data", "mailto", "javascript", "foo", "web+x", "HTTP", "Https", "a.b-c+d", "1bad", "", "about"];
const users = ["", "user", "user:pass", "u%20ser", "us er", "u@ser", ":pass", "us\u00e9r", "a:b:c", "x!$&'()*+,;=", "\u4e2d:\u6587"];
const hosts = [
	"example.com", "EXAMPLE.COM", "www.Example.Org", "a.b.c.d.e", "localhost", "127.0.0.1", "0x7f.1", "0177.0.0.1", "2130706433", "192.168.1.256", "1.2.3", "1.2.3.4.5", "0x100000000", "[::1]", "[2001:db8::1]", "[2001:0DB8:0:0:0:0:0:1]", "[::ffff:192.0.2.1]", "[1:2:3:4:5:6:7:8]", "[::]", "[1::2::3]", "[g::1]", "[::1", "::1]",
	"ex\u00e4mple.com", "\u4f8b\u3048.jp", "M\u00fcnchen.de", "\u0645\u062b\u0627\u0644.\u0625\u062e\u062a\u0628\u0627\u0631", "xn--exmple-cua.com", "xn--bcher-kva.example", "faß.de", "EX\u00c4MPLE.com", "\u2460.com", "a\u2024b.com", "ex ample.com", "ex_ample.com", "ex%41mple.com", "ex%zzmple.com", "exa<mple.com", "exa>mple.com", "ex^ample.com", "ex|ample.com", "-a.com", "a-.com", "a..b", ".a", "a.", "", "%", "\u00ad.com", "a\u200db.com", "\uff21.com", "example.com.", "\u3002.com", "1\uff0e2\uff0e3\uff0e4", "xn--", "xn--a", "a.xn--zzz",
];
const ports = ["", ":80", ":443", ":8080", ":0", ":65535", ":65536", ":99999", ":abc", ":", ":08", ":+1", ":21", ":\uff18\uff10", ":80a"];
const paths = ["", "/", "/a", "/a/b/c", "/a/./b", "/a/../b", "/../..", "/a/b/..", "/%2e/x", "/%2E%2e/x", "/a%2fb", "/a b", "/\u00e9", "/\u4e2d\u6587", "/a\\b", "\\a\\b", "//a//b", "/a/b/", "/;x=1", "/?", "/a?b", "/a#b", "/%", "/%zz", "/%41", "/\u{1F600}", "/a\tb\nc", "/a\u0000b", "/ ", "/\u007f", "/\u00a0", "/{x}", "/[x]", "/<>", "/`", "/^|", "/'\"", "/a/../../b", "/C:/x", "/c|/x"];
const queries = ["", "?", "?a=1", "?a=1&b=2", "?a=b c", "?a=\u00e9", "?a=%", "?a&b", "?='", "?\"<>`{}", "?a=1#", "?\u4e2d=\u6587", "?a=1&a=2", "?x=%20+%2B", "?%zz", "?a=b\tc"];
const hashes = ["", "#", "#f", "#a b", "#\u00e9", "#%", "#{x}", "#`<>\"", "#a#b", "#?q", "#\u4e2d"];
const relatives = ["", "x", "./x", "../x", "../../x", "/x", "//other.example/x", "?q", "#h", "?q#h", "x?y#z", "\\x", "//", "///x", "http:x", "https://abs.example/y", "file:x", "//h:1/x", "  spaced  ", "\tx", "x\ny", "..", ".", "a/../..", "%2e%2e/x", ":x", "1:x", "mailto:me@example.com"];
const bases = ["https://base.example/dir/file?q=1#h", "http://base.example:8080/a/b/", "file:///C:/dir/file.txt", "data:text/plain,hi", "mailto:x@y", "https://user:pw@base.example/p", "blob:https://base.example/uuid", "foo://bar/baz/qux", "about:blank", "ws://base.example/socket"];
// Credentials are compared, not shown: the output carries a digest of the password component, so a difference still fails
// the comparison without any password (even a made-up one) being written to the log.
const digest = (value) => require("crypto").createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
const summary = (u) => [u.href, u.origin, u.protocol, u.username, digest(u.password), u.host, u.hostname, u.port, u.pathname, u.search, u.hash];
const show = (fn) => {
	try {
		return fn();
	} catch (err) {
		return ["throws", err.constructor.name, err.code];
	}
};
const build = () => {
	const scheme = pick(schemes);
	const specialish = ["http", "https", "ws", "wss", "ftp", "file", "HTTP", "Https"].includes(scheme);
	const authority = rand() < 0.9 ? "//" + maybe(0.3, pick(users) + "@") + pick(hosts) + pick(ports) : maybe(0.2, "//");
	return (scheme ? scheme + ":" : "") + (specialish || rand() < 0.6 ? authority : "") + pick(paths) + pick(queries) + pick(hashes);
};

const total = 2500;
for (let i = 0; i < total; i++) {
	const input = rand() < 0.75 ? build() : pick(relatives);
	const base = rand() < 0.4 || !/^[A-Za-z][A-Za-z0-9+.-]*:/.test(input) ? pick(bases) : undefined;
	const result = show(() => summary(new URL(input, base)));
	console.log(i + " " + JSON.stringify(input) + " " + JSON.stringify(base) + " " + JSON.stringify(result));
	if (i % 5 === 0) {
		console.log("  canParse " + [URL.canParse(input, base), typeof URL.parse === "function" ? URL.parse(input, base)?.href ?? null : "n/a"].join());
	}
	if (i % 7 === 0 && Array.isArray(result) && result[0] !== "throws") {
		// setters
		const u = new URL(result[0]);
		const changes = [];
		for (const [name, values] of [["protocol", ["http", "https:", "ftp", "foo", "file", "1x", ""]], ["username", ["a", "a b", "\u00e9", ""]], ["password", ["p", "p:q", ""]], ["hostname", ["h.example", "EX.com", "[::1]", "a b", "", "127.1", "ex\u00e4.com"]], ["host", ["h.example:99", "h:0", "h:65536", "x:y"]], ["port", ["8080", "80", "", "abc", "99999", "12ab"]], ["pathname", ["/x/y", "z", "", "/a b", "/../q", "\\a"]], ["search", ["?a=1", "b c", "", "?", "%"]], ["hash", ["#h", "h i", "", "#"]]]) {
			const value = pick(values);
			const before = u.href;
			const applied = show(() => {
				u[name] = value;
				return u.href;
			});
			changes.push(name + "=" + JSON.stringify(value) + "=>" + JSON.stringify(applied === before ? "same" : applied));
		}
		console.log("  setters " + changes.join(" | "));
	}
	if (i % 11 === 0) {
		const q = pick(["a=1&b=2", "a=%20b&c=+d", "x=1&x=2&y", "=&&=", "\u00e9=\u4e2d", "a=b%zz", "k=v#x", "?a=1", "a[]=1&a[]=2", "%E4%B8%AD=1"]);
		const params = new URLSearchParams(q);
		params.append("z", "a b&c");
		params.set("a", "\u00e9");
		params.delete("y");
		params.sort();
		console.log("  params " + JSON.stringify([params.toString(), [...params.keys()], params.get("x"), params.getAll("x"), params.has("a"), params.size]));
	}
}

/* ---- legacy url module */
for (const input of ["http://user:pass@host.com:8080/p/a/t/h?query=string#hash", "//foo/bar", "/relative/path?x=1", "mailto:a@b.c", "javascript:alert(1)", "http://[::1]:80/x", "HTTP://EXAMPLE.COM/A?B#C", "http://a b.com/", "http://exa\u00e4mple.com/", "file:///etc/passwd", "x", "//a.com:80", "http://a.com/\u00e9?\u00e9#\u00e9"]) {
	console.log("legacy " + JSON.stringify(input) + " " + JSON.stringify(show(() => {
		const p = legacy.parse(input, true, true);
		return [p.protocol, p.slashes, p.auth, p.host, p.port, p.hostname, p.hash, p.search, p.query, p.pathname, p.path, p.href];
	})));
}
for (const [from, to] of [["http://a.com/b/c", "../d"], ["http://a.com/b/c", "//x.com/y"], ["/a/b", "c"], ["http://a.com", "?q"], ["http://a.com/x?y#z", "#w"], ["a", "b"]]) {
	console.log("resolve " + JSON.stringify([from, to]) + " " + JSON.stringify(show(() => legacy.resolve(from, to))));
}
console.log("format " + JSON.stringify([legacy.format({ protocol: "https", hostname: "a.com", port: 8080, pathname: "/x", query: { a: 1, b: [2, 3] }, hash: "h" }), legacy.format(new URL("https://u:p@a.com/x?y#z"), { auth: false, fragment: false, search: false }), legacy.format(new URL("https://ex\u00e4mple.com/"), { unicode: true })]));
for (const input of ["file:///C:/a/b", "file:///tmp/x%20y", "file://host/share/x"]) console.log("fileURLToPath " + JSON.stringify(show(() => legacy.fileURLToPath(input, { windows: input.includes("C:") }))));
console.log("pathToFileURL " + JSON.stringify([legacy.pathToFileURL("/tmp/a b#c?d%e").href, legacy.pathToFileURL("/tmp/\u00e9").href]));
console.log("domain " + JSON.stringify([legacy.domainToASCII("ex\u00e4mple.com"), legacy.domainToUnicode("xn--exmple-cua.com"), legacy.domainToASCII("xn--iñvalid.com"), legacy.domainToASCII("\u4f8b\u3048.jp"), legacy.domainToUnicode("xn--r8jz45g.jp"), legacy.domainToASCII(""), legacy.domainToASCII("faß.de")]));
console.log("urlToHttpOptions " + JSON.stringify(legacy.urlToHttpOptions(new URL("https://u:p%40@a.example:8443/x?y#z"))));
