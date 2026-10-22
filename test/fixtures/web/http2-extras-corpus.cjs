/* Differential corpus: http2 stream priority, ORIGIN and ALTSVC frames, respondWithFD. */
const http2 = require("http2");
const fs = require("fs");
const os = require("os");
const path = require("path");
const CERT = "-----BEGIN CERTIFICATE-----\nMIIEIDCCAwigAwIBAgIUZXc4wsQFghqudo40aBMYULbyJB4wDQYJKoZIhvcNAQEL\nBQAwaDELMAkGA1UEBhMCQlIxEjAQBgNVBAgMCVNhbyBQYXVsbzEOMAwGA1UEBwwF\nU2FtcGExEzARBgNVBAoMCkdyYWFrIFRlc3QxCzAJBgNVBAsMAlFBMRMwEQYDVQQD\nDApncmFhay50ZXN0MCAXDTI2MDkyNDE5Mzc1NFoYDzIxMjYwODMxMTkzNzU0WjBo\nMQswCQYDVQQGEwJCUjESMBAGA1UECAwJU2FvIFBhdWxvMQ4wDAYDVQQHDAVTYW1w\nYTETMBEGA1UECgwKR3JhYWsgVGVzdDELMAkGA1UECwwCUUExEzARBgNVBAMMCmdy\nYWFrLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDtoOIXmn2F\ntiV8HccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVK\nUHj4+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0\naqcZln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfm\nxAzOZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5w\nReKN8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWM\nzqy/71aoLgrjAgMBAAGjgb8wgbwwHQYDVR0OBBYEFEZlPe5AwdbrsbjhyH68QL43\n6kY3MB8GA1UdIwQYMBaAFEZlPe5AwdbrsbjhyH68QL436kY3MEoGA1UdEQRDMEGC\nCmdyYWFrLnRlc3SCDCouZ3JhYWsudGVzdIcEfwAAAYcQAAAAAAAAAAAAAAAAAAAA\nAYENcWFAZ3JhYWsudGVzdDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw\nDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAj+ojoizcAeBUG1NQ\nh0ARl4TDShVe+s0NKbQr6LBFbhjfi+1qKXcrVxpgObSBPwe2obLdNixBAHilCC/9\nM4bnicqu2YDaQV47lhP/15gG4t/5Yffz1frWPBZ2GNaBIIuSEp+DHSrYVfl6liNx\nNf09JRV8RUclEq9PN5/8HuN79seDOJN4JUsl4wxACBGjkMHwI2/meT/i6PH9YmLE\n/XNkW2BoorJ4t5OyxCtKVUmr1UIZpV6oAkdctz+FVVZi5ascYyu8cp/Hnm4D5Ctj\n1o47DVvLN49XuR9wKdd8H53kSSE8QiHAWHOU5fhVCkYwcMu2i64ybgCA0MfEbkRo\naWEclw==\n-----END CERTIFICATE-----\n";
const KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDtoOIXmn2FtiV8\nHccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVKUHj4\n+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0aqcZ\nln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfmxAzO\nZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5wReKN\n8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWMzqy/\n71aoLgrjAgMBAAECggEAJ482CdSSpapEzpyCe4/fT0ma3Kk9WIm3MdUzQ8pqEANN\nItADtiuREdhlhxpOZOxqWOkfbSb2alBqo0Bx9yRyBcRoYgXOoe2L3ZHfwZ3AK6Db\ngTTng5AKHUJcqCYTCTrLrgAdZ9ZvXmP2/OqHJyuVUb/Vj6BDckk7X0U7HABiopPq\n0vjCdYp7jaFlac0PID70nmVFo7zFb02CBSvSGr0Y73qDcKbU7gyJ7zMhJxBd7W7D\nZgE1LtYU1PTKpDCbPTtF35Ghncq1ASr6tbS0iAb2R05DHwkz4NxX2hwlHNepmlWU\nUGVb5qqKqdUKiqpX2WhGUy/6JRY5scwpSZvwb1CU0QKBgQD96RBldZQIU0UjAkBV\nvN0cNDOiJ1CRQtC3Zb56q5soZZq8MZ2es0eXggpbuup6jB/K0Db/84ZCBHrSCIhQ\nMJ971xfmQA+4jCa7QkxZgOQIbAx7036p7NsVKzHEeh7GXyrykpmFIJpWmnPTvhN7\nOl9SlHTGCXasEY6nhqVXSx/NCQKBgQDvlYQ2nFPFz6Goo5L33yh3y6R3i5TAERs7\nAPNV+SssR1WOWvAI1MFrz/B8KATuafiLpsGcGXRemhObdHuUvF46eYcNlMRC94bc\nAcQBz3ZCz/1uD65ICHp7jHrC/WfMXNzG2W+F9IdZ+x6dwixLuDSOjr4tILsG+4P2\nWl4y8HC/iwKBgE1xiau4egc0BrFP3XmJGlOg5GK/5QX5QBm/8aIOt0tR+ikOZQnj\nmqFua2RhFWV9WbENYskcaMW4AhIPwivbOLmX+FUlEuZx8NpKtWjTNDoRYpld/5Mq\niAPj4dEQglR08G9+IU8Gi6yAfXWG0wBR5IMWfqtsdYKz9DPKkKGYa0GpAoGAWVwv\nIB9Wr6Ut6rR4ELPPaD8wbNZG+QxoV62XFS4GiFFi++G3PdP9ALViQSy8CiDEb3IX\nLJ3h5ZcaURU1Mti/XJgPY2VlfoTMbCrMbNBwj6L8J5z5qCxhYsuWzjuuB29reU+I\nZTI7ebhMRxMxalyeXb2n+TUIDSaqpaw3DlDX/NkCgYAD237GgkKwz/JrnJ5Gijm+\nxBM2QVxGA+6BLEvKTLQyCVgFb7l5+/2rasvErzoPPjpyg3iBIQvbZV0fzZssRYid\nUpYuH0Vmg08HQ4cNJ4DC9ecqKeUvXIqxrpDzwT9q+Z1FMLUEnU4icmeorKdwRA/6\nCVd9zFt3HqSgPH0ISLZoig==\n-----END PRIVATE KEY-----\n";

const line = (label, value) => console.log(label + ": " + (typeof value === "string" ? value : JSON.stringify(value)));
const wait = (emitter, event) => new Promise((resolve) => emitter.once(event, (...args) => resolve(args)));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const errorInfo = (err) => [err.constructor.name, err.code, err.message];
const attempt = (label, fn) => {
	try {
		const value = fn();
		line(label, value === undefined ? "ok" : value);
	} catch (err) {
		line(label, ["throws", ...errorInfo(err)]);
	}
};

(async () => {
	// A private directory of its own, not fixed names in the shared temp dir.
	const fdDir = fs.mkdtempSync(path.join(os.tmpdir(), "graak-h2-"));
	const fdFile = path.join(fdDir, "fd.txt");
	const server = http2.createSecureServer({ key: KEY, cert: CERT });
	const sessions = [];
	const seen = {};
	server.on("session", (session) => sessions.push(session));
	server.on("stream", (stream, headers) => {
		const url = headers[":path"];
		if (url.startsWith("/priority")) {
			seen[url] = stream.state.weight;
			stream.respond({ ":status": 200 });
			stream.end("p");
		} else if (url === "/fd") {
			const fd = fs.openSync(fdFile, "r");
			stream.respondWithFD(fd, { "content-type": "text/plain" }, { offset: 2, length: 5 });
			stream.on("close", () => fs.closeSync(fd));
		} else if (url === "/fd-all") {
			const fd = fs.openSync(fdFile, "r");
			stream.respondWithFD(fd, { "content-type": "text/plain" });
			stream.on("close", () => fs.closeSync(fd));
		} else if (url === "/file") {
			stream.respondWithFile(fdFile, { "content-type": "text/plain" });
		} else if (url === "/dir") {
			stream.respondWithFile(fdDir, {}, { onError: (err) => { stream.respond({ ":status": 500 }); stream.end(err.code); } });
		} else if (url === "/fifo-offset") {
			stream.on("error", (err) => line("fifo offset error", errorInfo(err)));
			stream.respondWithFD(0, {}, { offset: 1 });
		} else {
			stream.respond({ ":status": 404 });
			stream.end();
		}
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	fs.writeFileSync(fdFile, "0123456789abcdef");
	const client = http2.connect("https://127.0.0.1:" + server.address().port, { ca: CERT });
	client.on("error", (err) => line("client error", errorInfo(err)));
	await wait(client, "connect");
	line("originSet initial", [Array.isArray(client.originSet), client.originSet && client.originSet.length]);
	const get = async (headers, options) => {
		const req = client.request(headers, options);
		const chunks = [];
		req.on("data", (c) => chunks.push(c));
		req.on("error", (err) => chunks.push(Buffer.from("ERR " + err.code)));
		const info = {};
		req.on("response", (h) => (info.status = h[":status"]));
		await wait(req, "close");
		return { status: info.status, body: Buffer.concat(chunks).toString(), stream: req };
	};

	/* ---- priority */
	const heavy = await get({ ":path": "/priority-heavy" }, { weight: 200 });
	const light = await get({ ":path": "/priority-light" }, { weight: 3, exclusive: true, parent: 0 });
	const plain = await get({ ":path": "/priority-default" });
	line("priority received", [seen["/priority-heavy"], seen["/priority-light"], seen["/priority-default"]]);
	line("priority status", [heavy.status, light.status, plain.status]);
	const req = client.request({ ":path": "/priority-later" });
	req.resume();
	line("priority state before", [req.state.weight, req.state.sumDependencyWeight]);
	req.priority({ weight: 100 });
	line("priority state after", [req.state.weight]);
	await wait(req, "close");
	attempt("priority bad weight", () => {
		const r = client.request({ ":path": "/priority-x" }, { weight: 999 });
		r.resume();
		return typeof r.id;
	});
	attempt("priority self dependency", () => {
		const r = client.request({ ":path": "/priority-self" });
		r.resume();
		r.priority({ parent: r.id });
	});
	attempt("priority bad weight call", () => {
		const r = client.request({ ":path": "/priority-bad" });
		r.resume();
		r.priority({ weight: 0 });
	});
	await sleep(50);

	/* ---- origin and altsvc */
	const origins = wait(client, "origin");
	const alt1 = wait(client, "altsvc");
	sessions[0].origin("https://a.example", new URL("https://b.example:8443/path"), { origin: "https://c.example" });
	sessions[0].altsvc('h2=":8000"', "https://example.org");
	const [got] = await origins;
	line("origin event", got);
	line("originSet", client.originSet.slice(1));
	line("altsvc origin", await alt1);
	attempt("altsvc stream zero", () => sessions[0].altsvc('h2="alt.example:443"; ma=60', 0));
	await sleep(30);
	attempt("origin invalid", () => sessions[0].origin("not a url"));
	attempt("origin non-http", () => sessions[0].origin("ftp://example.com"));
	attempt("origin bad type", () => sessions[0].origin(5));
	attempt("altsvc bad char", () => sessions[0].altsvc("h2=\"x\"\n", "https://example.org"));
	attempt("altsvc bad origin", () => sessions[0].altsvc("h2=\"x\"", "nope"));
	attempt("altsvc bad type", () => sessions[0].altsvc(5, "https://example.org"));
	line("server-only methods", [typeof client.origin, typeof client.altsvc, typeof sessions[0].origin, typeof sessions[0].altsvc, typeof sessions[0].request]);

	/* ---- respondWithFD and respondWithFile */
	const fd = await get({ ":path": "/fd" });
	line("respondWithFD range", [fd.status, fd.body]);
	const fdAll = await get({ ":path": "/fd-all" });
	line("respondWithFD whole", [fdAll.status, fdAll.body]);
	const file = await get({ ":path": "/file" });
	line("respondWithFile", [file.status, file.body]);
	const dir = await get({ ":path": "/dir" });
	line("respondWithFile directory", [dir.status, dir.body]);

	client.close();
	await wait(client, "close");
	await new Promise((resolve) => server.close(resolve));
	fs.rmSync(fdDir, { recursive: true, force: true });
})().catch((err) => {
	console.log("FAILED", err && err.stack);
	process.exit(1);
});
