/* Differential corpus: tls options and socket details (ca, servername, ALPN, client certificates, versions, passphrase, checkServerIdentity). */
const tls = require("tls");
const crypto = require("crypto");
const CERT = "-----BEGIN CERTIFICATE-----\nMIIEIDCCAwigAwIBAgIUZXc4wsQFghqudo40aBMYULbyJB4wDQYJKoZIhvcNAQEL\nBQAwaDELMAkGA1UEBhMCQlIxEjAQBgNVBAgMCVNhbyBQYXVsbzEOMAwGA1UEBwwF\nU2FtcGExEzARBgNVBAoMCkdyYWFrIFRlc3QxCzAJBgNVBAsMAlFBMRMwEQYDVQQD\nDApncmFhay50ZXN0MCAXDTI2MDkyNDE5Mzc1NFoYDzIxMjYwODMxMTkzNzU0WjBo\nMQswCQYDVQQGEwJCUjESMBAGA1UECAwJU2FvIFBhdWxvMQ4wDAYDVQQHDAVTYW1w\nYTETMBEGA1UECgwKR3JhYWsgVGVzdDELMAkGA1UECwwCUUExEzARBgNVBAMMCmdy\nYWFrLnRlc3QwggEiMA0GCSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDtoOIXmn2F\ntiV8HccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVK\nUHj4+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0\naqcZln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfm\nxAzOZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5w\nReKN8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWM\nzqy/71aoLgrjAgMBAAGjgb8wgbwwHQYDVR0OBBYEFEZlPe5AwdbrsbjhyH68QL43\n6kY3MB8GA1UdIwQYMBaAFEZlPe5AwdbrsbjhyH68QL436kY3MEoGA1UdEQRDMEGC\nCmdyYWFrLnRlc3SCDCouZ3JhYWsudGVzdIcEfwAAAYcQAAAAAAAAAAAAAAAAAAAA\nAYENcWFAZ3JhYWsudGVzdDAdBgNVHSUEFjAUBggrBgEFBQcDAQYIKwYBBQUHAwIw\nDwYDVR0TAQH/BAUwAwEB/zANBgkqhkiG9w0BAQsFAAOCAQEAj+ojoizcAeBUG1NQ\nh0ARl4TDShVe+s0NKbQr6LBFbhjfi+1qKXcrVxpgObSBPwe2obLdNixBAHilCC/9\nM4bnicqu2YDaQV47lhP/15gG4t/5Yffz1frWPBZ2GNaBIIuSEp+DHSrYVfl6liNx\nNf09JRV8RUclEq9PN5/8HuN79seDOJN4JUsl4wxACBGjkMHwI2/meT/i6PH9YmLE\n/XNkW2BoorJ4t5OyxCtKVUmr1UIZpV6oAkdctz+FVVZi5ascYyu8cp/Hnm4D5Ctj\n1o47DVvLN49XuR9wKdd8H53kSSE8QiHAWHOU5fhVCkYwcMu2i64ybgCA0MfEbkRo\naWEclw==\n-----END CERTIFICATE-----\n";
const KEY = "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDtoOIXmn2FtiV8\nHccsANl50rPNkghBDSw0EWufDg0uX5aGMbGCa155yAANAsPH+KmA9BiUwVVKUHj4\n+ne0IIhks7DXs33Qx2xoCIJqo94WeKmtbpZKPsg1ql6+c3B6Vlpq6av7bbj0aqcZ\nln3qljpc3cP3aHahlseIsSF7EosuBIqpWHlFpmnMk4nX/KMekc24otyFRJfmxAzO\nZtaf3B8E4mgMEiVRrhzx0W4HfxhxnjAkgGhuUln8XUjeUYHvZ3uErQcC6T5wReKN\n8DNxOMFfy35n5UC4e03nFDbGH/G9eTwfqwGukLKmaYnrjBoZHcNjX0/7aGWMzqy/\n71aoLgrjAgMBAAECggEAJ482CdSSpapEzpyCe4/fT0ma3Kk9WIm3MdUzQ8pqEANN\nItADtiuREdhlhxpOZOxqWOkfbSb2alBqo0Bx9yRyBcRoYgXOoe2L3ZHfwZ3AK6Db\ngTTng5AKHUJcqCYTCTrLrgAdZ9ZvXmP2/OqHJyuVUb/Vj6BDckk7X0U7HABiopPq\n0vjCdYp7jaFlac0PID70nmVFo7zFb02CBSvSGr0Y73qDcKbU7gyJ7zMhJxBd7W7D\nZgE1LtYU1PTKpDCbPTtF35Ghncq1ASr6tbS0iAb2R05DHwkz4NxX2hwlHNepmlWU\nUGVb5qqKqdUKiqpX2WhGUy/6JRY5scwpSZvwb1CU0QKBgQD96RBldZQIU0UjAkBV\nvN0cNDOiJ1CRQtC3Zb56q5soZZq8MZ2es0eXggpbuup6jB/K0Db/84ZCBHrSCIhQ\nMJ971xfmQA+4jCa7QkxZgOQIbAx7036p7NsVKzHEeh7GXyrykpmFIJpWmnPTvhN7\nOl9SlHTGCXasEY6nhqVXSx/NCQKBgQDvlYQ2nFPFz6Goo5L33yh3y6R3i5TAERs7\nAPNV+SssR1WOWvAI1MFrz/B8KATuafiLpsGcGXRemhObdHuUvF46eYcNlMRC94bc\nAcQBz3ZCz/1uD65ICHp7jHrC/WfMXNzG2W+F9IdZ+x6dwixLuDSOjr4tILsG+4P2\nWl4y8HC/iwKBgE1xiau4egc0BrFP3XmJGlOg5GK/5QX5QBm/8aIOt0tR+ikOZQnj\nmqFua2RhFWV9WbENYskcaMW4AhIPwivbOLmX+FUlEuZx8NpKtWjTNDoRYpld/5Mq\niAPj4dEQglR08G9+IU8Gi6yAfXWG0wBR5IMWfqtsdYKz9DPKkKGYa0GpAoGAWVwv\nIB9Wr6Ut6rR4ELPPaD8wbNZG+QxoV62XFS4GiFFi++G3PdP9ALViQSy8CiDEb3IX\nLJ3h5ZcaURU1Mti/XJgPY2VlfoTMbCrMbNBwj6L8J5z5qCxhYsuWzjuuB29reU+I\nZTI7ebhMRxMxalyeXb2n+TUIDSaqpaw3DlDX/NkCgYAD237GgkKwz/JrnJ5Gijm+\nxBM2QVxGA+6BLEvKTLQyCVgFb7l5+/2rasvErzoPPjpyg3iBIQvbZV0fzZssRYid\nUpYuH0Vmg08HQ4cNJ4DC9ecqKeUvXIqxrpDzwT9q+Z1FMLUEnU4icmeorKdwRA/6\nCVd9zFt3HqSgPH0ISLZoig==\n-----END PRIVATE KEY-----\n";
const KEY_ENC = "-----BEGIN ENCRYPTED PRIVATE KEY-----\nMIIFNTBfBgkqhkiG9w0BBQ0wUjAxBgkqhkiG9w0BBQwwJAQQalKzxxfceqCbElVX\nZ6o39gICCAAwDAYIKoZIhvcNAgkFADAdBglghkgBZQMEASoEECAFIW7Y+u3t8lAL\nYZYiMB4EggTQ7yfZn0WKvjgnHQzm4edpkEYVmzYftq0QJQZkG3DP0Nb3iqUEIQIf\njwwcxA2AITVcC6xTPWPmHw/9xDuv/iXJNBwxGXOdXyWJcv2EErWBu6onPANToWg9\nhYP/D/do7gvD1DpeqV4YpKOgUpdaUGz+6RdJVevNmjre6yG2BNTtWelw9f1eDg8x\nuSrdE0z3JfNRuKzautpwm83OR5f+ZeP7lmk9ehVZA6fiH7jjCSCMqiCPWE5bu53v\nPPEqU8xIpIV1emj0b0QU/0YManNG8AKJAeDbeg/1Ob8+fgw3+U4zX4AkKq1L64Ia\nWTt2lGnbkAjO+D36y7QxGYk90bs6X7wJa7tZGaxNtftQmx/pBINFUMeFnWB7N0ax\nWqhaRLt4Ndy0HsVQpTvbfzF0Co8wAKKa08WOln7RhJcdkwmENJc8c0cfr6txIZkq\nVbOM0qmt7ZTqzb2u05fpB8joEW3fIt0b30xjfH6EwKqyQ9UAdzM9IPgpse5rfN+T\nbOb78jFd9Uf9Qhn4NQ9jxooCcMOTjA02JU7P8bxeVAqt+h0OFVY6GAYidt7sM3w7\nLkhfp+xIEzhtousxQ57sAdrEVgP9UOpHgi7p5axVqh1D+smy+zKOhD/pPCj863Zc\npwyerzELqburIletg2lTtU9oI2ZCSFS8GTfVKvWGZ51MjagWieaImoDjRC2eFxbY\nO5PrC6P28IQEP8qiBIl0/t2nmgHO6x5RUh9qfJ2vGyl+qvLZsjVyiFvTTNRVdsHI\nSB2qT9xNAiE+PX6+Ur6ikIVnTrGFtGmQ/JzJ0lQXUEueEHjhYpfwXgMA5+eEeCjx\nO1pmz86gjIE5mh2xjx2fdfRrwa5/QjKnJCuZKFm0X7rw+fZt6duqI+uTyNAJkKx1\nZqBWt4JprCmELvBw1qg5eT0UsRFcSmIShsHAAnWKl8p3dAQXL2mHmTLcuetB6l28\nKEnrvMV5PudmVvdZiqzprb4upTN44IPuqX8bGDT29MkqSEjsTEK+M1CUiwBT7hU8\nOLPPE7y195m8HS3th01Jp3D03hIbp+Fdvz/rstpPfLwri348qmNhZN7WRehOZJ4s\nJrJ9oqgeyFwAJQx63Vo7Q+f6Ap1jhKi2+MErQAfJm1iVBq3Nz9UHUE/gUof7QxZK\nLiQR9lk7qHtb28ELFKR3S4N1jp8C65Eie0ncsTbU6Zi7shVieaCJmDYEYyAu1aHw\nZdF0vDs9haIZEdEsfHMHHVgRwe3EUdLn/dHAcvQOc8K3miuqdjACGW1WIpzU5/OW\nOD2gvPOYhlxNwYZu1ZgQ2G889GBEJmTZhlAanok3eBauJm5E2q+VpC53AFTnP9Zj\negs2ndvuwzdtJdsZk2v0+7gkRtEZO0MuIdhlDC/g8nFsUkxwO45T5O+Wk46SB+iR\nJAk9QJanFte465YvFOiwCKIMtc0l2tCr08ixklfCQ//OqeOZABUuZmzcWUX4X/D5\nAm7VecZQdVEKsN3O/C8zqmBNBt9K1iEEDX1VsqzlwqhRAgTC92qI1tzgjm0g+W6V\n3F7ma0IjuZWTJPerW0DmULS1ZQWq29pZP0Y26pxATdUrNwM06nLBotxdkVPtPN+a\nCJwMr9KNHwjrmOTjw++Mc6Y2jjS/+5lgMa/TnlNiRFZVTjpeHvmIAHM=\n-----END ENCRYPTED PRIVATE KEY-----\n";
const OTHER_CERT = "-----BEGIN CERTIFICATE-----\nMIIBwjCCAWegAwIBAgIUfk44CV50hN6mjlR9J44XK7dqU+wwCgYIKoZIzj0EAwIw\nKDEWMBQGA1UEAwwNZWMuZ3JhYWsudGVzdDEOMAwGA1UECgwFR3JhYWswIBcNMjYw\nOTI0MTkzNzU0WhgPMjEyNjA4MzExOTM3NTRaMCgxFjAUBgNVBAMMDWVjLmdyYWFr\nLnRlc3QxDjAMBgNVBAoMBUdyYWFrMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE\nDuUo0qWaMjmOsTzI2dCvXr4NOQnb2foC4ilhVNLygdU7NK2w8zLHapIyQCbUmWS8\nS8EgJEH+cM2ikeArqnzqq6NtMGswHQYDVR0OBBYEFMamGe91TnC1di3ritwY1ckS\n+WjXMB8GA1UdIwQYMBaAFMamGe91TnC1di3ritwY1ckS+WjXMA8GA1UdEwEB/wQF\nMAMBAf8wGAYDVR0RBBEwD4INZWMuZ3JhYWsudGVzdDAKBggqhkjOPQQDAgNJADBG\nAiEAjFwuNth1XtKvD0g+cAUQJ8tw7vWOUFyYaH8L+nN2ynECIQCJPKtCj4vpchGI\nyh+tG01eHhNnp9Kn9wjwzxhffA6K4A==\n-----END CERTIFICATE-----\n";

const line = (label, value) => console.log(label + ": " + (typeof value === "string" ? value : JSON.stringify(value)));
const wait = (emitter, event) => new Promise((resolve) => emitter.once(event, (...args) => resolve(args)));

/* One server, one client: reports what each side saw. Every socket is closed before the next step. */
async function exchange(label, serverOptions, clientOptions) {
	const server = tls.createServer(serverOptions);
	const serverSeen = new Promise((resolve) => {
		server.once("secureConnection", (socket) => {
			const cert = socket.getPeerCertificate();
			resolve({ authorized: socket.authorized, alpn: socket.alpnProtocol, peerCN: cert && cert.subject ? cert.subject.CN : null, encrypted: socket.encrypted });
			socket.on("error", () => {});
			socket.end();
		});
		server.once("tlsClientError", () => resolve("tlsClientError"));
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const port = server.address().port;
	const client = tls.connect({ host: "127.0.0.1", port, ...clientOptions });
	const outcome = await new Promise((resolve) => {
		client.once("secureConnect", () => {
			const cipher = client.getCipher();
			resolve({
				authorized: client.authorized,
				authorizationError: client.authorizationError === undefined ? null : client.authorizationError,
				alpn: client.alpnProtocol,
				protocol: client.getProtocol(),
				cipherShape: [typeof cipher.name, cipher.standardName.startsWith("TLS_"), cipher.version],
				encrypted: client.encrypted,
			});
		});
		client.once("error", (err) => resolve({ error: err.code }));
	});
	const seen = await Promise.race([serverSeen, new Promise((resolve) => setTimeout(() => resolve("no server event"), 400))]);
	client.destroy();
	await new Promise((resolve) => server.close(resolve));
	// A client that gives up leaves the server's view to a race, so only a completed handshake reports both sides.
	line(label, outcome.error ? { client: outcome } : { client: outcome, server: seen });
}

(async () => {
	await exchange("trusted ca", { key: KEY, cert: CERT }, { ca: CERT, servername: "graak.test" });
	await exchange("untrusted self-signed", { key: KEY, cert: CERT }, { servername: "graak.test" });
	await exchange("hostname mismatch", { key: KEY, cert: CERT }, { ca: CERT, servername: "other.test" });
	await exchange("ip in altnames", { key: KEY, cert: CERT }, { ca: CERT });
	await exchange("alpn negotiated", { key: KEY, cert: CERT, ALPNProtocols: ["h2", "http/1.1"] }, { ca: CERT, servername: "graak.test", ALPNProtocols: ["http/1.1"] });
	await exchange("alpn client preference h2", { key: KEY, cert: CERT, ALPNProtocols: ["http/1.1", "h2"] }, { ca: CERT, servername: "graak.test", ALPNProtocols: ["h2", "http/1.1"] });
	await exchange("alpn none offered", { key: KEY, cert: CERT, ALPNProtocols: ["h2"] }, { ca: CERT, servername: "graak.test" });
	await exchange("alpn buffer form", { key: KEY, cert: CERT, ALPNProtocols: [Buffer.from("h2")].map(String) }, { ca: CERT, servername: "graak.test", ALPNProtocols: Buffer.from("\x02h2") });
	await exchange("server max TLSv1.2", { key: KEY, cert: CERT, maxVersion: "TLSv1.2" }, { ca: CERT, servername: "graak.test" });
	await exchange("client max TLSv1.2", { key: KEY, cert: CERT }, { ca: CERT, servername: "graak.test", maxVersion: "TLSv1.2" });
	await exchange("client min TLSv1.3 vs server 1.2", { key: KEY, cert: CERT, maxVersion: "TLSv1.2" }, { ca: CERT, servername: "graak.test", minVersion: "TLSv1.3" });
	await exchange("passphrase key", { key: KEY_ENC, passphrase: "hunter2", cert: CERT }, { ca: CERT, servername: "graak.test" });
	await exchange("key object form", { key: [{ pem: KEY }], cert: [CERT] }, { ca: [CERT], servername: "graak.test" });
	await exchange("mutual tls ok", { key: KEY, cert: CERT, requestCert: true, ca: CERT }, { ca: CERT, servername: "graak.test", cert: CERT, key: KEY });
	await exchange("mutual tls missing client cert", { key: KEY, cert: CERT, requestCert: true, rejectUnauthorized: true, ca: CERT }, { ca: CERT, servername: "graak.test" });
	await exchange("wrong ca", { key: KEY, cert: CERT }, { ca: OTHER_CERT, servername: "graak.test" });
	await exchange("custom checkServerIdentity error", { key: KEY, cert: CERT }, { ca: CERT, servername: "graak.test", checkServerIdentity: () => Object.assign(new Error("nope"), { code: "MY_CODE" }) });
	await exchange("custom checkServerIdentity accepts mismatch", { key: KEY, cert: CERT }, { ca: CERT, servername: "other.test", checkServerIdentity: () => undefined });
	await exchange("secureContext", { key: KEY, cert: CERT }, { secureContext: tls.createSecureContext({ ca: CERT }), servername: "graak.test" });

	// Cipher suites, session resumption and renegotiation.
	{
		const server = tls.createServer({ key: KEY, cert: CERT }, (socket) => {
			socket.on("data", (d) => socket.write("echo:" + d));
			socket.on("error", () => {});
		});
		await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
		const port = server.address().port;
		const conn = (options) =>
			new Promise((resolve) => {
				const c = tls.connect({ host: "127.0.0.1", port, ca: CERT, servername: "graak.test", ...options });
				c.once("secureConnect", () => resolve(c));
				c.on("error", (err) => resolve(err.code || err.message));
			});
		for (const ciphers of ["ECDHE-RSA-AES128-GCM-SHA256", "ECDHE-RSA-AES256-GCM-SHA384:!aNULL", "AES128-GCM-SHA256", "ECDHE-RSA-AES256-SHA384", "ECDHE-RSA-CHACHA20-POLY1305"]) {
			const c = await conn({ ciphers, maxVersion: "TLSv1.2" });
			line("ciphers " + ciphers, typeof c === "string" ? c : [c.getProtocol(), c.getCipher()]);
			if (typeof c !== "string") c.destroy();
		}
		try {
			tls.connect({ host: "127.0.0.1", port, ciphers: "nonsense", maxVersion: "TLSv1.2" }).on("error", () => {});
			line("ciphers nonsense", "accepted");
		} catch (err) {
			line("ciphers nonsense", ["throws", err.code, err.message]);
		}
		const only13 = await conn({ ciphers: "TLS_AES_128_GCM_SHA256" });
		line("ciphers tls 1.3 only", [only13.getProtocol(), only13.getCipher()]);
		only13.destroy();
		const listed = tls.getCiphers();
		line("getCiphers", [Array.isArray(listed), listed.includes("ecdhe-rsa-aes128-gcm-sha256"), listed.every((n) => n === n.toLowerCase()), listed.includes("aes128-gcm-sha256")]);
		for (const maxVersion of ["TLSv1.2", "TLSv1.3"]) {
			const first = await conn({ maxVersion });
			const session = await new Promise((resolve) => {
				first.once("session", resolve);
				first.on("data", () => {});
				first.write("hi");
				setTimeout(() => resolve(first.getSession()), 500);
			});
			line(maxVersion + " session", [first.isSessionReused(), Buffer.isBuffer(session), session.length > 0]);
			first.destroy();
			const second = await conn({ maxVersion, session });
			line(maxVersion + " resumed", [second.isSessionReused(), second.getProtocol()]);
			second.destroy();
			const fresh = await conn({ maxVersion });
			line(maxVersion + " fresh", [fresh.isSessionReused()]);
			fresh.destroy();
		}
		const renegotiating = await conn({ maxVersion: "TLSv1.2" });
		const outcome = await new Promise((resolve) => {
			const started = renegotiating.renegotiate({ rejectUnauthorized: true }, (err) => resolve([started, err ? err.code || err.message : null]));
		});
		line("renegotiate 1.2", outcome);
		renegotiating.on("data", () => {});
		renegotiating.write("after");
		line("after renegotiation", await new Promise((resolve) => renegotiating.once("data", (d) => resolve(String(d)))));
		renegotiating.destroy();
		const modern = await conn({});
		const outcome13 = await new Promise((resolve) => {
			try {
				const started = modern.renegotiate({}, (err) => resolve(["callback", err ? err.code : null]));
				if (started === false) resolve(["false"]);
			} catch (err) {
				resolve(["throws", err.code]);
			}
		});
		line("renegotiate 1.3", outcome13);
		modern.destroy();
		await new Promise((resolve) => server.close(resolve));
	}

	// getPeerCertificate
	const server = tls.createServer({ key: KEY, cert: CERT }, (socket) => socket.end());
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const client = tls.connect({ host: "127.0.0.1", port: server.address().port, ca: CERT, servername: "graak.test" });
	await wait(client, "secureConnect");
	const peer = client.getPeerCertificate();
	const x509 = new crypto.X509Certificate(CERT);
	line("peer certificate", [peer.subject.CN, peer.subject.O, peer.issuer.CN, peer.subjectaltname, peer.fingerprint256 === x509.fingerprint256, peer.raw.equals(x509.raw), peer.valid_from === x509.validFrom, peer.serialNumber === x509.serialNumber, peer.bits, peer.exponent, Object.keys(peer)]);
	const detailed = client.getPeerCertificate(true);
	line("peer certificate detailed", [detailed.issuerCertificate === detailed, typeof detailed.issuerCertificate.fingerprint]);
	line("peer x509", client.getPeerX509Certificate().fingerprint256 === x509.fingerprint256);
	line("socket misc", [client.isSessionReused(), client.encrypted, client.authorized, client.servername === undefined || typeof client.servername === "string"]);
	client.destroy();
	await new Promise((resolve) => server.close(resolve));

	// checkServerIdentity
	const cert = x509.toLegacyObject();
	const cases = ["graak.test", "a.graak.test", "a.b.graak.test", "other.test", "127.0.0.1", "10.0.0.1"];
	line("checkServerIdentity", cases.map((name) => {
		const err = tls.checkServerIdentity(name, cert);
		return err ? [err.code, err.message, err.host, err.reason] : null;
	}));
	line("checkServerIdentity cn fallback", ["a.test", "b.test"].map((name) => {
		const err = tls.checkServerIdentity(name, { subject: { CN: "a.test" } });
		return err ? [err.code, err.message] : null;
	}));

	// module shape
	const roots = tls.rootCertificates;
	line("rootCertificates", [Array.isArray(roots), Object.isFrozen(roots), roots.length > 50, roots[0].startsWith("-----BEGIN CERTIFICATE-----"), roots[0].trim().endsWith("-----END CERTIFICATE-----"), roots.every((pem) => typeof pem === "string")]);
	line("tls constants", [tls.DEFAULT_MIN_VERSION, tls.DEFAULT_MAX_VERSION, typeof tls.DEFAULT_CIPHERS, Array.isArray(tls.getCiphers()), typeof tls.createSecureContext]);
	try {
		tls.createServer({ pfx: Buffer.alloc(1) });
		line("pfx", "accepted");
	} catch (err) {
		line("pfx", "throws");
	}
})();
