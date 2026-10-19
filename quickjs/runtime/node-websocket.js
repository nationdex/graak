/*
 * The WebSocket the host lacks: a client over RFC 6455 framing on the host's own `http` upgrade, with the browser's
 * WebSocket, MessageEvent and CloseEvent. Node.js 22 has a global WebSocket; the Graak engine and older Node.js do not,
 * and packages that speak WebSocket (a database or chat client, discord.js) read it from the global.
 *
 * SocketWebSocket is the framing endpoint the client is built on, and the server side of a WebSocket upgrade.
 *
 * node-compat.js loads this file and installs the globals on the native host.
 */

function createWebSocket({ http, https, crypto, Buffer, CloseEvent: ExistingCloseEvent, MessageEvent: ExistingMessageEvent }) {
	const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

	function encodeFrame(opcode, payload, mask) {
		const len = payload.length;
		const head = [0x80 | opcode];
		const maskBit = mask ? 0x80 : 0;
		if (len < 126) head.push(maskBit | len);
		else if (len < 65536) head.push(maskBit | 126, (len >> 8) & 255, len & 255);
		else {
			head.push(maskBit | 127, 0, 0, 0, 0, (len >>> 24) & 255, (len >>> 16) & 255, (len >>> 8) & 255, len & 255);
		}
		if (!mask) return Buffer.concat([Buffer.from(head), payload]);
		const key = crypto.randomBytes(4);
		const masked = Buffer.allocUnsafe(len);
		for (let i = 0; i < len; i++) masked[i] = payload[i] ^ key[i & 3];
		return Buffer.concat([Buffer.from(head), key, masked]);
	}

	/** Shared WebSocket endpoint over a connected socket; `client` frames are masked, `server` ones are not. */
	class SocketWebSocket extends EventTarget {
		static CONNECTING = 0;
		static OPEN = 1;
		static CLOSING = 2;
		static CLOSED = 3;
		CONNECTING = 0;
		OPEN = 1;
		CLOSING = 2;
		CLOSED = 3;
		#socket = null;
		#client;
		#buffer = Buffer.alloc(0);
		#fragments = [];
		#fragmentOpcode = 0;
		#closeSent = false;
		binaryType = "blob";
		readyState = 0;
		url = "";
		protocol = "";
		extensions = "";
		bufferedAmount = 0;
		onopen = null;
		onmessage = null;
		onclose = null;
		onerror = null;
		constructor(client) {
			super();
			this.#client = client;
		}
		_attach(socket) {
			this.#socket = socket;
			this.readyState = 1;
			socket.on("data", (chunk) => this.#onData(chunk));
			socket.on("close", () => this.#finish(1006, "", false));
			socket.on("error", () => {});
		}
		/** Bytes that arrived with the handshake, handled after "open" so no message precedes it. */
		_feed(head) {
			if (head && head.length) this.#onData(head);
		}
		/** Events are delivered one per task, as in a browser, so a handler set after an await still sees the next one. */
		_emit(type, init) {
			setTimeout(() => {
				const event = type === "message" ? new MessageEvent("message", init) : type === "close" ? new CloseEvent("close", init) : new Event(type);
				const handler = this["on" + type];
				if (typeof handler === "function") handler.call(this, event);
				this.dispatchEvent(event);
			}, 0);
		}
		#onData(chunk) {
			this.#buffer = this.#buffer.length ? Buffer.concat([this.#buffer, chunk]) : chunk;
			for (;;) {
				const b = this.#buffer;
				if (b.length < 2) return;
				const opcode = b[0] & 15;
				const fin = (b[0] & 0x80) !== 0;
				const masked = (b[1] & 0x80) !== 0;
				let len = b[1] & 127;
				let off = 2;
				if (len === 126) {
					if (b.length < 4) return;
					len = b.readUInt16BE(2);
					off = 4;
				} else if (len === 127) {
					if (b.length < 10) return;
					len = b.readUInt32BE(2) * 4294967296 + b.readUInt32BE(6);
					off = 10;
				}
				const total = off + (masked ? 4 : 0) + len;
				if (b.length < total) return;
				let payload = b.subarray(off + (masked ? 4 : 0), total);
				if (masked) {
					const key = b.subarray(off, off + 4);
					const out = Buffer.allocUnsafe(len);
					for (let i = 0; i < len; i++) out[i] = payload[i] ^ key[i & 3];
					payload = out;
				}
				this.#buffer = b.subarray(total);
				this.#frame(opcode, fin, payload);
			}
		}
		#frame(opcode, fin, payload) {
			if (opcode === 0x8) {
				const code = payload.length >= 2 ? payload.readUInt16BE(0) : 1005;
				const reason = payload.length > 2 ? payload.subarray(2).toString("utf8") : "";
				if (!this.#closeSent) this.#sendClose(code === 1005 ? 1000 : code, "");
				this.#finish(code, reason, true);
			} else if (opcode === 0x9) this.#write(0xa, payload);
			else if (opcode === 0xa) return;
			else {
				if (opcode !== 0) {
					this.#fragmentOpcode = opcode;
					this.#fragments = [];
				}
				this.#fragments.push(payload);
				if (!fin) return;
				const whole = Buffer.concat(this.#fragments);
				this.#fragments = [];
				if (this.#fragmentOpcode === 1) this._emit("message", { data: whole.toString("utf8") });
				else {
					const data = this.binaryType === "arraybuffer" ? whole.buffer.slice(whole.byteOffset, whole.byteOffset + whole.length) : new Blob([whole]);
					this._emit("message", { data });
				}
			}
		}
		#write(opcode, payload) {
			if (this.#socket && !this.#socket.destroyed) this.#socket.write(encodeFrame(opcode, payload, this.#client));
		}
		#sendClose(code, reason) {
			this.#closeSent = true;
			const body = Buffer.alloc(2 + Buffer.byteLength(reason));
			body.writeUInt16BE(code, 0);
			body.write(reason, 2);
			this.#write(0x8, body);
		}
		#finish(code, reason, wasClean) {
			if (this.readyState === 3) return;
			this.readyState = 3;
			try {
				this.#socket?.end();
			} catch {}
			this._emit("close", { code, reason, wasClean });
		}
		send(data) {
			// A socket still connecting cannot send; one that is closing or closed drops the data, as browsers do.
			if (this.readyState === 0) throw new DOMException("Failed to execute 'send' on 'WebSocket': Still in CONNECTING state.", "InvalidStateError");
			if (this.readyState !== 1) return;
			if (typeof data === "string") this.#write(0x1, Buffer.from(data));
			else if (data instanceof Blob) data.arrayBuffer().then((ab) => this.#write(0x2, Buffer.from(ab)));
			else if (ArrayBuffer.isView(data)) this.#write(0x2, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
			else this.#write(0x2, Buffer.from(data));
		}
		close(code = 1000, reason = "") {
			if (this.readyState >= 2) return;
			this.readyState = 2;
			this.#sendClose(code, reason);
			setTimeout(() => this.#finish(code, reason, true), 1000).unref?.();
		}
		ping() {}
	}
	class WebSocketClient extends SocketWebSocket {
		constructor(url, protocols) {
			super(true);
			const parsed = new URL(url);
			if (parsed.protocol === "http:") parsed.protocol = "ws:";
			if (parsed.protocol === "https:") parsed.protocol = "wss:";
			if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") throw new DOMException(`The URL's scheme must be either 'ws' or 'wss'. '${parsed.protocol}' is not allowed.`, "SyntaxError");
			this.url = parsed.href;
			const secure = parsed.protocol === "wss:";
			const key = crypto.randomBytes(16).toString("base64");
			const list = protocols === undefined ? [] : Array.isArray(protocols) ? protocols : [protocols];
			const mod = secure ? https : http;
			const req = mod.request({
				host: parsed.hostname,
				port: parsed.port || (secure ? 443 : 80),
				path: `${parsed.pathname}${parsed.search}`,
				headers: {
					Connection: "Upgrade",
					Upgrade: "websocket",
					"Sec-WebSocket-Key": key,
					"Sec-WebSocket-Version": "13",
					...(list.length ? { "Sec-WebSocket-Protocol": list.join(", ") } : {}),
				},
			});
			req.on("upgrade", (res, socket, head) => {
				const expected = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
				if (res.headers["sec-websocket-accept"] !== expected) {
					socket.destroy();
					this._emit("error");
					this._finishFailed();
					return;
				}
				this.protocol = res.headers["sec-websocket-protocol"] ?? "";
				this._attach(socket);
				this._emit("open");
				this._feed(head);
			});
			req.on("response", () => {
				this._emit("error");
				this._finishFailed();
			});
			req.on("error", () => {
				this._emit("error");
				this._finishFailed();
			});
			req.end();
		}
		_finishFailed() {
			if (this.readyState === 3) return;
			this.readyState = 3;
			this._emit("close", { code: 1006, reason: "", wasClean: false });
		}
	}


	const CloseEvent = ExistingCloseEvent ?? class CloseEvent extends Event {
		constructor(type, init = {}) {
			super(type);
			this.code = init.code ?? 0;
			this.reason = init.reason ?? "";
			this.wasClean = init.wasClean ?? false;
		}
	};
	const MessageEvent = ExistingMessageEvent ?? class MessageEvent extends Event {
		constructor(type, init = {}) {
			super(type);
			this.data = init.data;
			this.origin = init.origin ?? "";
			this.lastEventId = init.lastEventId ?? "";
		}
	};
	return { WebSocket: WebSocketClient, CloseEvent, MessageEvent, SocketWebSocket, WebSocketClient, encodeFrame };
}

export { createWebSocket };
