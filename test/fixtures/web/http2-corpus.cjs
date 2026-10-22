/* Differential corpus: http2 (sessions, streams, flow control, trailers, push, compat API, errors, settings, ping, ALPN). */
const http2 = require("http2");
const https = require("https");
const crypto = require("crypto");
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
/* A request on a dead session returns a stream that fails on the next tick instead of throwing. */
const attemptStream = (label, fn) =>
	new Promise((resolve) => {
		try {
			const stream = fn();
			stream.on("error", (err) => {
				line(label, ["error event", ...errorInfo(err)]);
				resolve();
			});
			setTimeout(resolve, 200);
		} catch (err) {
			line(label, ["throws", ...errorInfo(err)]);
			resolve();
		}
	});
const plain = (headers, drop = []) => {
	const out = {};
	for (const key of Object.keys(headers).sort()) if (!drop.includes(key)) out[key] = headers[key];
	return out;
};
const DROP = ["date"];
let serverSessionInfo = null;

async function listen(server) {
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	return server.address().port;
}
const SECURE = { key: KEY, cert: CERT };
async function withServer(makeServer, secure, run) {
	const server = secure ? http2.createSecureServer({ ...SECURE, allowHTTP1: false }) : http2.createServer();
	serverSessionInfo = null;
	server.on("session", (session) => {
		session.once("remoteSettings", (remote) => setTimeout(() => (serverSessionInfo = [session.localSettings, remote, session.type]), 20));
	});
	makeServer(server);
	const port = await listen(server);
	const client = http2.connect((secure ? "https" : "http") + "://127.0.0.1:" + port, secure ? { ca: CERT } : undefined);
	client.on("error", (err) => line("client error", errorInfo(err)));
	try {
		await run(client, server, port);
	} finally {
		client.close();
		// A rejected request can leave a half-made stream behind in some implementations; do not wait for it forever.
		await Promise.race([wait(client, "close"), sleep(400)]);
		client.destroy();
		await new Promise((resolve) => server.close(resolve));
	}
}
async function get(client, headers, options) {
	const req = client.request(headers, options);
	const chunks = [];
	const info = {};
	req.on("response", (h, flags) => {
		info.headers = h;
		info.flags = flags;
	});
	req.on("data", (c) => chunks.push(c));
	const closed = wait(req, "close");
	await wait(req, "end");
	await closed;
	info.body = Buffer.concat(chunks);
	info.stream = req;
	return info;
}

(async () => {
	for (const secure of [false, true]) {
		const tag = secure ? "tls " : "h2c ";
		/* ---- basic, headers and body */
		await withServer((server) => {
			server.on("stream", (stream, headers, flags) => {
				const path = headers[":path"];
				if (path === "/echo") {
					const chunks = [];
					stream.on("data", (c) => chunks.push(c));
					stream.on("end", () => {
						const body = Buffer.concat(chunks);
						stream.respond({ ":status": 200, "content-type": "application/octet-stream", "x-length": String(body.length), "x-sha": crypto.createHash("sha256").update(body).digest("hex") });
						stream.end(body);
					});
				} else if (path === "/headers") {
					stream.respond({ ":status": 200, "set-cookie": ["a=1", "b=2"], "x-multi": ["one", "two"], "X-Upper": "Value", "x-number": 42 });
					stream.end(JSON.stringify(plain(headers, ["user-agent", ":authority"])));
				} else if (path === "/big") {
					stream.respond({ ":status": 200 });
					const chunk = Buffer.alloc(65536, 0x61);
					let sent = 0;
					const write = () => {
						while (sent < 3 * 1024 * 1024) {
							sent += chunk.length;
							if (!stream.write(chunk)) {
								stream.once("drain", write);
								return;
							}
						}
						stream.end();
					};
					write();
				} else if (path === "/empty") {
					stream.respond({ ":status": 204 }, { endStream: true });
				} else if (path === "/head") {
					stream.respond({ ":status": 200, "content-length": "5" }, { endStream: true });
				} else if (path === "/late") {
					setTimeout(() => {
						stream.respond({ ":status": 201 });
						stream.end("late");
					}, 30);
				} else if (path === "/implicit") {
					stream.end("no respond call");
				} else {
					stream.respond({ ":status": 404 });
					stream.end("nope");
				}
			});
		}, secure, async (client) => {
			const basic = await get(client, { ":path": "/hello" });
			line(tag + "404", [basic.headers[":status"], basic.body.toString(), basic.flags, plain(basic.headers, DROP)]);
			const implicit = await get(client, { ":path": "/implicit" });
			line(tag + "implicit respond", [implicit.headers[":status"], implicit.body.toString()]);
			const late = await get(client, { ":path": "/late" });
			line(tag + "late respond", [late.headers[":status"], late.body.toString()]);
			const empty = await get(client, { ":path": "/empty" });
			line(tag + "204", [empty.headers[":status"], empty.body.length, empty.flags]);
			const head = await get(client, { ":path": "/head", ":method": "HEAD" });
			line(tag + "HEAD", [head.headers[":status"], head.headers["content-length"], head.body.length]);
			const hdr = await get(client, { ":path": "/headers", "x-dup": ["1", "2"], cookie: ["a=b", "c=d"], "X-Mixed-Case": "yes", "x-num": 7, "accept": "*/*" });
			const seen = JSON.parse(hdr.body.toString());
			line(tag + "request headers seen", seen);
			line(tag + "response headers", plain(hdr.headers, DROP));
			line(tag + "response header object", [Object.getPrototypeOf(hdr.headers) === null, Array.isArray(hdr.headers["set-cookie"]), typeof hdr.headers[http2.sensitiveHeaders]]);
			const payload = crypto.randomBytes(200000);
			const post = client.request({ ":path": "/echo", ":method": "POST" });
			const chunks = [];
			post.on("data", (c) => chunks.push(c));
			let rh;
			post.on("response", (h) => (rh = h));
			post.write(payload.subarray(0, 50000));
			post.write(payload.subarray(50000, 120000));
			post.end(payload.subarray(120000));
			await wait(post, "end");
			line(tag + "echo post", [rh[":status"], rh["x-length"], Buffer.concat(chunks).equals(payload), rh["x-sha"] === crypto.createHash("sha256").update(payload).digest("hex")]);
			const big = await get(client, { ":path": "/big" });
			line(tag + "flow control download", [big.body.length, big.body.every((b) => b === 0x61)]);
			const upload = crypto.randomBytes(3 * 1024 * 1024);
			const up = client.request({ ":path": "/echo", ":method": "POST" });
			const back = [];
			up.on("data", (c) => back.push(c));
			up.end(upload);
			await wait(up, "end");
			line(tag + "flow control upload", [Buffer.concat(back).equals(upload)]);
			const many = await Promise.all(Array.from({ length: 30 }, (_, i) => get(client, { ":path": "/hello?i=" + i })));
			line(tag + "concurrent", [many.length, many.every((r) => r.body.toString() === "nope"), many.map((r) => r.stream.id).slice(0, 5)]);
			const req = client.request({ ":path": "/hello" });
			req.resume();
			line(tag + "stream props", [req.id % 2, typeof req.id, req.pending, req.headersSent, req.sentHeaders[":path"], req.sentHeaders[":method"], req.sentHeaders[":scheme"], req.endAfterHeaders, req.destroyed, req.aborted, req.closed]);
			await wait(req, "close");
			line(tag + "stream closed", [req.closed, req.destroyed, req.rstCode, req.endAfterHeaders]);
			line(tag + "session props", [client.type, client.alpnProtocol, client.encrypted, client.destroyed, client.closed, client.connecting, typeof client.socket, typeof client.state.nextStreamID, Object.keys(client.state).sort()]);
			line(tag + "settings objects", [client.localSettings, client.remoteSettings]);
			line(tag + "server view of settings", serverSessionInfo);
		});

		/* ---- trailers, push, informational, settings, ping */
		await withServer((server) => {
			server.on("stream", (stream, headers) => {
				const path = headers[":path"];
				if (path === "/trailers") {
					stream.respond({ ":status": 200, trailer: "x-checksum" }, { waitForTrailers: true });
					stream.on("wantTrailers", () => stream.sendTrailers({ "x-checksum": "abc123", "x-count": 2 }));
					stream.write("part one ");
					stream.end("part two");
				} else if (path === "/client-trailers") {
					const seen = {};
					stream.on("trailers", (t) => (seen.trailers = plain(t)));
					stream.resume();
					stream.on("end", () => {
						stream.respond({ ":status": 200 });
						stream.end(JSON.stringify(seen));
					});
				} else if (path === "/push") {
					stream.pushStream({ ":path": "/pushed.css" }, (err, pushed, pushHeaders) => {
						if (err) throw err;
						pushed.respond({ ":status": 200, "content-type": "text/css" });
						pushed.end("body{}");
					});
					stream.respond({ ":status": 200 });
					stream.end("page");
				} else if (path === "/info") {
					stream.additionalHeaders({ ":status": 103, link: "</style.css>; rel=preload" });
					stream.respond({ ":status": 200 });
					stream.end("done");
				} else if (path === "/reset") {
					stream.on("error", (err) => line(tag + "server stream error", errorInfo(err)));
					stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
				} else if (path === "/cancel-me") {
					stream.on("aborted", () => line(tag + "server saw aborted", [true]));
					stream.on("close", () => line(tag + "server stream close", [stream.rstCode, stream.destroyed]));
					stream.respond({ ":status": 200 });
					stream.write("start");
				} else if (path === "/errors") {
					const outcome = [];
					stream.respond({ ":status": 200 });
					for (const fn of [() => stream.respond({ ":status": 200 }), () => stream.additionalHeaders({ ":status": 103 })]) {
						try {
							fn();
						} catch (e) {
							outcome.push(errorInfo(e));
						}
					}
					stream.end(JSON.stringify(outcome));
				}
			});
		}, secure, async (client, server) => {
			const t = await get(client, { ":path": "/trailers" });
			const tr = await new Promise((resolve) => {
				const req = client.request({ ":path": "/trailers" });
				let trailers;
				req.on("trailers", (h, flags) => (trailers = [plain(h), flags]));
				req.resume();
				req.on("close", () => resolve(trailers));
			});
			line(tag + "trailers", [t.body.toString(), plain(t.headers, DROP), tr]);
			const ct = client.request({ ":path": "/client-trailers", ":method": "POST" }, { waitForTrailers: true });
			ct.on("wantTrailers", () => ct.sendTrailers({ "x-client": "yes" }));
			const ctChunks = [];
			ct.on("data", (c) => ctChunks.push(c));
			ct.end("payload");
			await wait(ct, "end");
			line(tag + "client trailers", Buffer.concat(ctChunks).toString());
			const pushSeen = await new Promise((resolve) => {
				const out = { pushes: [] };
				client.once("stream", (pushed, requestHeaders) => {
					out.promise = plain(requestHeaders, [":authority"]);
					pushed.on("push", (headers, flags) => (out.pushResponse = [plain(headers, DROP), flags]));
					pushed.on("data", (d) => (out.pushBody = String(d)));
					pushed.on("close", () => (out.pushClosed = pushed.rstCode));
				});
				const req = client.request({ ":path": "/push" });
				req.on("response", (h) => (out.status = h[":status"]));
				req.resume();
				req.on("close", () => setTimeout(() => resolve(out), 100));
			});
			line(tag + "push promise", pushSeen);
			const info = await new Promise((resolve) => {
				const req = client.request({ ":path": "/info" });
				const out = {};
				req.on("headers", (h) => (out.informational = plain(h)));
				req.on("response", (h) => (out.status = h[":status"]));
				req.on("data", (d) => (out.body = String(d)));
				req.on("close", () => resolve(out));
			});
			line(tag + "informational", info);
			const rst = await new Promise((resolve) => {
				const req = client.request({ ":path": "/reset" });
				const out = {};
				req.on("error", (err) => (out.error = errorInfo(err)));
				req.on("close", () => {
					out.rstCode = req.rstCode;
					out.destroyed = req.destroyed;
					resolve(out);
				});
				req.resume();
			});
			line(tag + "server reset", rst);
			const cancel = client.request({ ":path": "/cancel-me" });
			cancel.resume();
			await wait(cancel, "data");
			cancel.close(http2.constants.NGHTTP2_CANCEL);
			await wait(cancel, "close");
			line(tag + "client cancel", [cancel.rstCode, cancel.destroyed, cancel.closed]);
			await sleep(50);
			const errs = await get(client, { ":path": "/errors" });
			line(tag + "server-side errors", JSON.parse(errs.body.toString()));
			const settled = await new Promise((resolve) => client.settings({ maxConcurrentStreams: 50, initialWindowSize: 1 << 20 }, (err, settings, duration) => resolve([err, settings, typeof duration])));
			line(tag + "settings ack", settled);
			line(tag + "local settings after", client.localSettings);
			const pinged = await new Promise((resolve) => client.ping((err, duration, payload) => resolve([err, typeof duration, payload.length])));
			line(tag + "ping", pinged);
			const custom = Buffer.from("12345678");
			const echoed = await new Promise((resolve) => client.ping(custom, (err, duration, payload) => resolve([err, payload.toString()])));
			line(tag + "ping payload", echoed);
			attempt(tag + "ping bad length", () => client.ping(Buffer.alloc(3), () => {}));
			attempt(tag + "settings invalid", () => client.settings({ maxFrameSize: 5 }));
			attempt(tag + "settings invalid enablePush", () => client.settings({ enablePush: "yes" }));
			attempt(tag + "request bad header", () => client.request({ ":path": "/", connection: "keep-alive" }));
			attempt(tag + "request bad pseudo", () => client.request({ ":bogus": "x" }));
			attempt(tag + "request te", () => client.request({ ":path": "/", te: "gzip" }));
			attempt(tag + "request bad token", () => client.request({ ":path": "/", "bad name": "x" }));
		});
	}

	/* ---- compat api */
	for (const secure of [false, true]) {
		const tag = "compat " + (secure ? "tls " : "h2c ");
		const server = secure ? http2.createSecureServer({ ...SECURE }) : http2.createServer();
		server.on("request", (req, res) => {
			const seen = { method: req.method, url: req.url, httpVersion: req.httpVersion, major: req.httpVersionMajor, scheme: req.scheme, authority: typeof req.authority, headers: plain(req.headers, ["user-agent", ":authority"]), streamId: req.stream.id % 2, complete: req.complete };
			if (req.url === "/status") {
				res.statusCode = 418;
				res.setHeader("X-A", "1");
				res.setHeader("x-list", ["a", "b"]);
				res.end(JSON.stringify([res.getHeader("x-a"), res.getHeaderNames().sort(), res.hasHeader("X-A"), res.headersSent, res.statusMessage, res.sendDate]));
			} else if (req.url === "/write") {
				res.writeHead(200, { "content-type": "text/plain", "x-w": "1" });
				res.write("one ");
				res.write("two ");
				res.end("three");
			} else if (req.url === "/json") {
				res.setHeader("content-type", "application/json");
				res.end(JSON.stringify(seen));
			} else if (req.url === "/nodate") {
				res.sendDate = false;
				res.end("x");
			} else if (req.url === "/204") {
				res.statusCode = 204;
				res.end();
			} else if (req.url === "/304") {
				res.statusCode = 304;
				res.end();
			} else if (req.url === "/trailers") {
				res.addTrailers({ "x-trailer": "t" });
				res.end("body");
			} else if (req.url === "/echo") {
				const chunks = [];
				req.on("data", (c) => chunks.push(c));
				req.on("end", () => {
					res.setHeader("x-received", String(Buffer.concat(chunks).length));
					res.end(Buffer.concat(chunks));
				});
			} else if (req.url === "/twice") {
				res.end("first");
				let outcome;
				try {
					res.setHeader("x", "y");
					outcome = "set ok";
				} catch (e) {
					outcome = errorInfo(e);
				}
				try {
					res.writeHead(200);
				} catch (e) {
					outcome = [outcome, errorInfo(e)];
				}
				res.on("finish", () => line(tag + "after end", [outcome, res.finished, res.writableEnded]));
			} else if (req.url === "/invalid") {
				try {
					res.statusCode = 99;
				} catch (e) {
					line(tag + "invalid status", errorInfo(e));
				}
				try {
					res.setHeader("connection", "close");
				} catch (e) {
					line(tag + "connection header", errorInfo(e));
				}
				res.end("ok");
			} else {
				res.end("default");
			}
		});
		const port = await listen(server);
		const client = http2.connect((secure ? "https" : "http") + "://127.0.0.1:" + port, secure ? { ca: CERT } : undefined);
		for (const path of ["/status", "/write", "/json", "/nodate", "/204", "/304", "/trailers", "/twice", "/invalid"]) {
			const r = await get(client, { ":path": path, "x-req": "1" });
			line(tag + path, [r.headers[":status"], plain(r.headers, path === "/nodate" ? [] : DROP), typeof r.headers.date, r.body.toString(), r.flags]);
		}
		const echo = client.request({ ":path": "/echo", ":method": "POST" });
		const back = [];
		echo.on("data", (c) => back.push(c));
		echo.end("compat request body");
		const eh = await wait(echo, "response");
		await wait(echo, "end");
		line(tag + "echo", [eh[0][":status"], eh[0]["x-received"], Buffer.concat(back).toString()]);
		const jr = await get(client, { ":path": "/json", "x-custom": "v", cookie: ["a=1", "b=2"], ":method": "GET" });
		line(tag + "request object", JSON.parse(jr.body.toString()));
		const trailerSeen = await new Promise((resolve) => {
			const req = client.request({ ":path": "/trailers" });
			let trailers;
			req.on("trailers", (h) => (trailers = plain(h)));
			req.resume();
			req.on("close", () => resolve(trailers));
		});
		line(tag + "response trailers", trailerSeen);
		client.close();
		await wait(client, "close");
		await new Promise((resolve) => server.close(resolve));
	}

	/* ---- session lifecycle, goaway, errors */
	{
		const server = http2.createServer();
		const sessions = [];
		server.on("session", (s) => sessions.push(s));
		server.on("stream", (stream) => {
			stream.respond({ ":status": 200 });
			stream.end("ok");
		});
		const port = await listen(server);
		const client = http2.connect("http://127.0.0.1:" + port);
		const [connectedSession] = await wait(client, "connect");
		line("connect event", [connectedSession === client, client.connecting]);
		const remote = await new Promise((resolve) => (client.remoteSettings && Object.keys(client.remoteSettings).length ? resolve(client.remoteSettings) : client.once("remoteSettings", resolve)));
		line("remote settings", remote);
		line("default settings", http2.getDefaultSettings());
		const packed = http2.getPackedSettings({ enablePush: false, maxConcurrentStreams: 10, initialWindowSize: 65535 });
		line("packed settings", [packed.toString("hex"), http2.getUnpackedSettings(packed)]);
		attempt("unpack bad", () => http2.getUnpackedSettings(Buffer.alloc(5)));
		const r = await get(client, { ":path": "/" });
		line("before goaway", r.body.toString());
		const goaway = wait(client, "goaway");
		sessions[0].goaway(http2.constants.NGHTTP2_NO_ERROR);
		const [code, lastStreamId] = await goaway;
		line("goaway event", [code, lastStreamId]);
		// The server keeps its end of the socket open, so 'close' is not reliably delivered; the state is what matters.
		await sleep(100);
		line("after goaway", [client.destroyed, client.closed]);
		await attemptStream("request after close", () => client.request({ ":path": "/" }));
		client.destroy();
		sessions[0].destroy();
		await new Promise((resolve) => server.close(resolve));
	}
	{
		const server = http2.createServer();
		server.on("stream", (stream) => {
			stream.respond({ ":status": 200 });
			stream.end("x");
		});
		const port = await listen(server);
		const client = http2.connect("http://127.0.0.1:" + port);
		await wait(client, "connect");
		const req = client.request({ ":path": "/" });
		req.resume();
		await wait(req, "close");
		client.destroy();
		await wait(client, "close");
		await attemptStream("request after destroy", () => client.request({ ":path": "/" }));
		attempt("ping after destroy", () => client.ping(() => {}));
		await new Promise((resolve) => server.close(resolve));
	}
	{
		const refused = http2.connect("http://127.0.0.1:1");
		const [err] = await wait(refused, "error");
		line("connect refused", [err.code]);
	}

	/* ---- allowHTTP1 and ALPN */
	{
		const server = http2.createSecureServer({ ...SECURE, allowHTTP1: true }, (req, res) => {
			res.setHeader("content-type", "application/json");
			res.end(JSON.stringify([req.httpVersion, req.method, req.url]));
		});
		const port = await listen(server);
		const h1 = await new Promise((resolve) => {
			https.get({ host: "127.0.0.1", port, path: "/h1", ca: CERT, servername: "graak.test" }, (res) => {
				const chunks = [];
				res.on("data", (c) => chunks.push(c));
				res.on("end", () => resolve([res.statusCode, Buffer.concat(chunks).toString()]));
			});
		});
		line("http1 fallback", h1);
		const client = http2.connect("https://127.0.0.1:" + port, { ca: CERT });
		const h2 = await get(client, { ":path": "/h2" });
		line("http2 on same port", [h2.headers[":status"], h2.body.toString(), client.alpnProtocol]);
		client.close();
		await wait(client, "close");
		await new Promise((resolve) => server.close(resolve));
	}

	/* ---- module shape */
	line("constants", [http2.constants.HTTP2_HEADER_STATUS, http2.constants.HTTP2_METHOD_GET, http2.constants.HTTP_STATUS_NOT_FOUND, http2.constants.NGHTTP2_CANCEL, Object.keys(http2.constants).length, typeof http2.sensitiveHeaders]);
	line("exports", ["connect", "createServer", "createSecureServer", "getDefaultSettings", "getPackedSettings", "getUnpackedSettings", "Http2ServerRequest", "Http2ServerResponse"].map((name) => typeof http2[name]));
	attempt("connect bad url", () => http2.connect("ftp://example.com"));
})().catch((err) => {
	console.log("FAILED", err && err.stack);
	process.exit(1);
});
