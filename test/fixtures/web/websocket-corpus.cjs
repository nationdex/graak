// The global WebSocket client against a raw RFC 6455 server written here. Must print exactly what Node.js prints.
const http = require("http");
const crypto = require("crypto");
const out = [];
const say = (...a) => out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));

function frame(opcode, payload) {
  const len = payload.length;
  const head = len < 126 ? [0x80 | opcode, len] : [0x80 | opcode, 126, len >> 8, len & 255];
  return Buffer.concat([Buffer.from(head), payload]);
}
function readFrames(buffer, onFrame) {
  for (;;) {
    if (buffer.length < 2) return buffer;
    const opcode = buffer[0] & 15;
    let len = buffer[1] & 127;
    let off = 2;
    if (len === 126) { if (buffer.length < 4) return buffer; len = buffer.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (buffer.length < 10) return buffer; len = Number(buffer.readBigUInt64BE(2)); off = 10; }
    if (buffer.length < off + 4 + len) return buffer;
    const key = buffer.subarray(off, off + 4);
    const data = Buffer.from(buffer.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < len; i++) data[i] ^= key[i & 3];
    onFrame(opcode, data);
    buffer = buffer.subarray(off + 4 + len);
  }
}

const server = http.createServer((req, res) => res.end("plain"));
server.on("upgrade", (req, socket) => {
  const accept = crypto.createHash("sha1").update(req.headers["sec-websocket-key"] + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").digest("base64");
  const protocol = String(req.headers["sec-websocket-protocol"] || "").split(",")[0].trim();
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${protocol ? `Sec-WebSocket-Protocol: ${protocol}\r\n` : ""}\r\n`);
  socket.write(frame(1, Buffer.from("welcome")));
  let pending = Buffer.alloc(0);
  socket.on("data", (chunk) => {
    pending = readFrames(Buffer.concat([pending, chunk]), (opcode, data) => {
      if (opcode === 1) socket.write(frame(1, Buffer.from(`echo:${data}`)));
      else if (opcode === 2) socket.write(frame(2, Buffer.from(`${data.length}`)));
      else if (opcode === 8) { socket.write(frame(8, Buffer.concat([Buffer.from([data[0] ?? 3, data[1] ?? 232]), Buffer.from("bye")]))); socket.end(); }
    });
  });
  socket.on("error", () => {});
});

server.listen(0, "127.0.0.1", () => {
  const port = server.address().port;
  say("globals", typeof WebSocket, typeof MessageEvent, typeof CloseEvent, WebSocket.CONNECTING, WebSocket.OPEN, WebSocket.CLOSING, WebSocket.CLOSED);
  const ws = new WebSocket(`ws://127.0.0.1:${port}/chat`, "graak");
  say("initial", ws.readyState, ws.url.replace(String(port), "PORT"), ws.binaryType);
  ws.binaryType = "arraybuffer";
  const got = [];
  ws.addEventListener("open", () => say("open", ws.readyState, ws.protocol));
  ws.onmessage = (event) => {
    got.push(typeof event.data === "string" ? event.data : `bin:${new Uint8Array(event.data).length}`);
    say("message", event instanceof MessageEvent, got[got.length - 1]);
    if (got.length === 1) { ws.send("hello"); ws.send(new Uint8Array(70000)); }
    if (got.length === 3) ws.close(1000, "done");
  };
  ws.onclose = (event) => {
    say("close", event instanceof CloseEvent, event.code, event.reason, event.wasClean, ws.readyState);
    try { ws.send("late"); } catch (e) { say("send after close", e.name); }
    const bad = new WebSocket("ws://127.0.0.1:1/");
    bad.onerror = () => say("connect error", true);
    bad.onclose = (e) => {
      say("failed close", e.code, e.wasClean);
      server.close();
      for (const l of out) console.log(JSON.stringify(l));
    };
  };
});
