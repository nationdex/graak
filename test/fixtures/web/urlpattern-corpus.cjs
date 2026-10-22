/* Differential corpus: URLPattern (construction, canonicalisation, test, exec, groups, options, errors). */
const line = (label, value) => console.log(label + ": " + (typeof value === "string" ? value : JSON.stringify(value)));
const attempt = (label, fn) => {
	try {
		line(label, fn());
	} catch (err) {
		line(label, ["throws", err.constructor.name]);
	}
};
// Credentials are compared, not shown: the output carries a salted, iterated derivation of the password component, so a
// difference still fails the comparison without any password (even a made-up one) being written to the log.
const digest = (value) => require("crypto").pbkdf2Sync(String(value), "graak-corpus", 1000, 8, "sha256").toString("hex");
// A match result carries a password component too: it is shown the same way, as a derivation under the key "derived", with
// every other part as is.
const shown = (result) => {
	if (!result || !result.password) return result;
	const { password, ...rest } = result;
	return { ...rest, derived: { input: digest(password.input), groups: digest(JSON.stringify(password.groups)) } };
};
const props = (p) => ({ protocol: p.protocol, username: p.username, derived: digest(p.password), hostname: p.hostname, port: p.port, pathname: p.pathname, search: p.search, hash: p.hash, hasRegExpGroups: p.hasRegExpGroups });

line("global", [typeof URLPattern, URLPattern.name, URLPattern.length, Object.prototype.toString.call(new URLPattern({}))]);

/* ---- patterns and their normalised components */
const patterns = [
	"https://example.com/books/:id",
	"https://example.com:8080/a/*?x=1#frag",
	"http{s}?://*.example.com/:path*",
	"/foo/bar",
	"/:foo/:bar?",
	"/:a(\\d+)-:b",
	"/files/*.png",
	"/a{/b}?/c",
	"/a/:b+",
	"/(foo|bar)/:baz(.*)",
	"data\\:text/html,:x",
	"https://:user::pass@example.com/",
	"https://[::1]:3000/x",
	"https://EXAMPLE.com/Path",
	"file:///c:/x/:y",
	"*://*/*",
	"../x",
	"?q=:v",
	"#:h",
	"https://example.com/caf\u00e9",
	"https://ex\u00e4mple.com/",
	"https://example.com/a b",
	"foo://bar/baz",
	"https://example.com/:foo\\?",
	"blob:https://:origin/",
];
for (const pattern of patterns) {
	try {
		line("pattern " + pattern, props(new URLPattern(pattern, "https://base.example/dir/page")));
	} catch (err) {
		line("pattern " + pattern, ["throws", err.constructor.name]);
	}
}
const inits = [
	{ pathname: "/books/:id" },
	{ protocol: "https", hostname: "*.example.com", pathname: "/:a/:b?" },
	{ pathname: "/x", baseURL: "https://example.com/y/z" },
	{ search: "q=:v", hash: ":h" },
	{ hostname: "example.com", port: "8080", pathname: "*" },
	{ username: "u", password: "p", hostname: "h.example", pathname: "/" },
	{ protocol: "http{s}?", hostname: "x.example" },
	{ pathname: "/a/:b", search: "*" },
];
for (const init of inits) line("init " + JSON.stringify(init), props(new URLPattern(init)));
line("init with base", props(new URLPattern({ pathname: "../q" }, { ignoreCase: true })).pathname);
attempt("base with init", () => props(new URLPattern({ pathname: "x" }, "https://a.example/b/c")));
attempt("ignoreCase option", () => new URLPattern("https://example.com/Books", { ignoreCase: true }).test("https://example.com/books"));

/* ---- test and exec */
const cases = [
	["https://example.com/books/:id", "https://example.com/books/123"],
	["https://example.com/books/:id", "https://example.com/books/123/"],
	["https://example.com/books/:id", "https://example.org/books/123"],
	["/foo/:bar", "https://example.com/foo/x?y=1#z"],
	["/foo/*", "https://example.com/foo/a/b/c"],
	["/:a(\\d+)-:b", "https://example.com/12-xyz"],
	["/:a(\\d+)-:b", "https://example.com/ab-xyz"],
	["http{s}?://*.example.com/:path*", "https://a.example.com/x/y/z"],
	["http{s}?://*.example.com/:path*", "http://example.com/"],
	["/a/:b+", "https://x.example/a/1/2/3"],
	["/a/:b+", "https://x.example/a/"],
	["/(foo|bar)/:baz(.*)", "https://x.example/bar/qq/rr"],
	["https://:sub.example.com/", "https://www.example.com/"],
	["https://example.com/:file.:ext", "https://example.com/a.tar.gz"],
	["?q=:v", "https://example.com/?q=hello"],
	["#:h", "https://example.com/#top"],
	["https://user:pass@example.com/*", "https://user:pass@example.com/x"],
	["*://*/*", "ftp://host/path"],
	["https://example.com:*/", "https://example.com:8443/"],
	["https://example.com/caf\u00e9", "https://example.com/caf%C3%A9"],
	["https://example.com/", "HTTPS://EXAMPLE.COM/"],
	["https://[::1]/*", "https://[::1]/x"],
	["/x", "https://example.com/x/../x"],
];
for (const [pattern, input] of cases) {
	let p;
	try {
		p = new URLPattern(pattern, "https://example.com");
	} catch (err) {
		line("exec " + pattern + " <- " + input, ["constructor throws", err.constructor.name]);
		continue;
	}
	let result;
	try {
		result = p.exec(input);
	} catch (err) {
		result = ["throws", err.constructor.name];
	}
	line("exec " + pattern + " <- " + input, [p.test(input), shown(result)]);
}
line("exec inputs form", shown(new URLPattern({ pathname: "/:id" }).exec({ baseURL: "https://example.com" })));
line("exec base argument", shown(new URLPattern({ pathname: "/:id" }).exec("/9", "https://example.com/")));
line("exec array input", new URLPattern("https://example.com/:x").exec(["https://example.com/a"]) === null);
line("exec no match", shown(new URLPattern("/x", "https://example.com").exec("https://example.com/y")));
line("exec invalid url", new URLPattern("/x", "https://example.com").exec("not a url"));
line("test invalid url", new URLPattern("/x", "https://example.com").test("not a url"));
line("exec undefined groups", new URLPattern({ pathname: "/:a/:b?" }).exec("https://e.example/one").pathname.groups);
line("exec numbered groups", new URLPattern({ pathname: "/(.*)/(.*)?" }).exec("https://e.example/one/two").pathname.groups);
line("exec wildcard groups", new URLPattern({ hostname: "*.example.com", pathname: "*" }).exec("https://a.example.com/z").hostname.groups);
line("regexp groups", [new URLPattern({ pathname: "/:a" }).hasRegExpGroups, new URLPattern({ pathname: "/(\\d+)" }).hasRegExpGroups, new URLPattern({ pathname: "/*" }).hasRegExpGroups]);

/* ---- errors */
for (const bad of ["/:", "/(", "/(?:x)", "/a/{b", "/:1", "https://exa mple.com/", "/x\\", "(unclosed", "/a**", "/((x)", "https://example.com:99999/"]) {
	attempt("bad " + bad, () => props(new URLPattern(bad, "https://base.example/")).pathname);
}
attempt("no input", () => new URLPattern().pathname);
attempt("relative without base", () => new URLPattern("/x").pathname);
attempt("relative init without base", () => new URLPattern({ pathname: "x" }).pathname);
attempt("bad base", () => new URLPattern("/x", "not a url").pathname);
attempt("bad type", () => new URLPattern(5).pathname);
attempt("call without new", () => URLPattern("/x"));
line("property descriptors", ["protocol", "hasRegExpGroups", "test", "exec"].map((k) => typeof Object.getOwnPropertyDescriptor(URLPattern.prototype, k)));
