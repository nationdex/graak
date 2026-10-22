// An https server with a self-signed certificate, and clients that talk to it. Identical under Node.js.
const https = require("https");
const tls = require("tls");
const fs = require("fs");
const path = require("path");

const options = {
	key: fs.readFileSync(path.join(__dirname, "test-key.pem")),
	cert: fs.readFileSync(path.join(__dirname, "test-cert.pem")),
};
// The clients trust this one certificate and check it against the name it was issued for (CN=localhost), so every handshake
// here is verified even though the connection goes to 127.0.0.1. It is written out here, and checked against the file the
// server loads, so what the clients trust is never data they read from disk.
const CA = "-----BEGIN CERTIFICATE-----\nMIIDCzCCAfOgAwIBAgIUFTWL6PRwuugsgGRWjfXkJKQgRuMwDQYJKoZIhvcNAQEL\nBQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MCAXDTI2MDkyMTAxNTc1MloYDzIxMjYw\nODI4MDE1NzUyWjAUMRIwEAYDVQQDDAlsb2NhbGhvc3QwggEiMA0GCSqGSIb3DQEB\nAQUAA4IBDwAwggEKAoIBAQCt6h7vSYgULIzuIcL18IGVcphICQ1LBvDweHnhw1q5\n4o7aUBvZFaYIsxpOoCrvQ5ZxNtDE6KpPKJZKl6gWQZlSwbGLXQ7GEDa3FGjC/EGc\nSW5w4PKejBCo636T4svbwYlBPETxYA5lxZEBa689mRCXDzWS5S8cNqPNsRHcR+sV\nwsN/i8Wc0YzkUKh6xY67QZI5S2Qp6adjEcO43bLy8Zb+iQMc4XsZxx4rmklZDUHY\nR95pbmap1X1VBPDVX9haSKrFpivWMQk5Mr2Y6c0H3f7wbUd8QgG/kbfupIEh6A7R\n9IZkwFk8ne4AdA7xBrqQtKUg7DrNbt8X+B5YIUUpvESrAgMBAAGjUzBRMB0GA1Ud\nDgQWBBRJnQywEqFGGlhOFWvQppLVPF1RtDAfBgNVHSMEGDAWgBRJnQywEqFGGlhO\nFWvQppLVPF1RtDAPBgNVHRMBAf8EBTADAQH/MA0GCSqGSIb3DQEBCwUAA4IBAQCV\nLLKf8f9VfSbCy7xDgwtBE9MThrG/oRD9E8HkIfxgVHjNrWjCPHVVRZYnENXf5LxB\ncPs1/ZmOKkgrABtVUt+IXMf2SYVRD+WT3daoKmWC1gzwh8shVkOcOi3sPy3d1ZH3\nIWGUW5nN9QF/WZbrNBM/mPcS1bD8YmL+AmUaQPwsecklU6FjgjZs5UgkEBPNwvA8\ndV6ilO7a5QWJCCi5RQxEFhPKCs3MvO9OXypQVl3ksNCmSYsJClxsIDSX7vNeu6QM\nb8sieSEaCWFr9lOBUtRpVRusUMxAjLpmtq/ZmpxW52qRSfgqNr9QuaCBvL2n42hw\nzJDUZ9vOgw154jakQW4q\n-----END CERTIFICATE-----\n";
if (options.cert.toString() !== CA) throw new Error("test-cert.pem is not the certificate this test trusts");
const out = [];
const log = (...a) => out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

const server = https.createServer(options, (req, res) => {
	const chunks = [];
	req.on("data", (c) => chunks.push(c));
	req.on("end", () => {
		res.setHeader("Content-Type", "application/json");
		res.end(JSON.stringify({ secure: Boolean(req.socket.encrypted), method: req.method, body: Buffer.concat(chunks).toString(), url: req.url }));
	});
});

server.listen(0, "127.0.0.1", async () => {
	const port = server.address().port;
	const get = (opts, body) =>
		new Promise((resolve, reject) => {
			const req = https.request({ host: "127.0.0.1", port, ca: CA, servername: "localhost", ...opts }, (res) => {
				const chunks = [];
				res.on("data", (c) => chunks.push(c));
				res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
			});
			req.on("error", reject);
			req.end(body);
		});
	try {
		log("get", await get({ path: "/hello" }));
		log("post", await get({ path: "/p", method: "POST" }, "secret payload"));
		const big = "x".repeat(200000);
		const r = await get({ path: "/big", method: "POST" }, big);
		log("big", JSON.parse(r.body).body.length);
		try {
			await get({ path: "/", ca: undefined });
		} catch (e) {
			log("untrusted certificate rejected", Boolean(e.code || e.message));
		}
		// raw TLS socket
		await new Promise((resolve) => {
			const socket = tls.connect({ host: "127.0.0.1", port, ca: CA, servername: "localhost" }, () => {
				socket.write("GET /raw HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n");
			});
			const chunks = [];
			socket.on("data", (c) => chunks.push(c));
			socket.on("close", () => {
				const text = Buffer.concat(chunks).toString();
				log("raw tls", text.split("\r\n")[0], text.includes('"secure":true'));
				resolve();
			});
		});
	} catch (error) {
		log("FAILED", String(error && error.stack));
	}
	server.close(() => {
		console.log(out.join("\n"));
		process.exit(0);
	});
	server.closeAllConnections?.();
});
