// A server and a client on the loopback interface: a POST with a body, a query string, and a response read back.
import { createServer, request } from "node:http";

const server = createServer((req, res) => {
	let body = "";
	req.setEncoding("utf8");
	req.on("data", (chunk) => (body += chunk));
	req.on("end", () => {
		res.setHeader("content-type", "text/plain; charset=utf-8");
		res.end(`${req.method} ${req.url} ${body}`);
	});
});

server.listen(0, "127.0.0.1", () => {
	const { port } = server.address();
	const req = request({ host: "127.0.0.1", port, method: "POST", path: "/echo?x=1" }, (res) => {
		let data = "";
		res.setEncoding("utf8");
		res.on("data", (chunk) => (data += chunk));
		res.on("end", () => {
			console.log(res.statusCode, res.headers["content-type"], JSON.stringify(data));
			server.close(() => console.log("server closed"));
		});
	});
	req.end("payload");
});
