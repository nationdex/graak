// The smaller members of Node's API surface. Must print exactly what Node.js prints.
const out = [];
const say = (...a) => out.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? `${v}n` : v instanceof Uint8Array ? `u8[${[...v]}]` : v)))).join(" "));
const events = require("events");
const path = require("path");
const fs = require("fs");
const os = require("os");
const util = require("util");

(async () => {
  // events
  const ee = new events.EventEmitter();
  const iterator = events.on(ee, "tick");
  setTimeout(() => { ee.emit("tick", 1, 2); ee.emit("tick", 3); ee.emit("done"); }, 5);
  const seen = [];
  const closing = events.on(ee, "tick", { close: ["done"] });
  for await (const args of closing) seen.push(args);
  say("events.on", seen);
  await iterator.return();
  const once = events.once(ee, "later");
  ee.emit("later", "a", "b");
  say("events.once", await once);
  ee.on("x", function first() {});
  say("getEventListeners", events.getEventListeners(ee, "x").length, events.getMaxListeners(ee), typeof events.captureRejectionSymbol, events.usingDomains);
  const ac = new AbortController();
  let aborted = false;
  const disposable = events.addAbortListener(ac.signal, () => { aborted = true; });
  ac.abort();
  say("addAbortListener", aborted, typeof disposable[Symbol.dispose]);
  events.setMaxListeners(20, ee);
  say("setMaxListeners", ee.getMaxListeners(), events.listenerCount(ee, "x"));

  // timers
  const tp = require("timers/promises");
  let ticks = 0;
  for await (const v of tp.setInterval(5, "v")) { if (++ticks === 3) { say("setInterval", v, ticks); break; } }
  say("scheduler", typeof tp.scheduler.wait, require("timers").promises === tp);

  // path
  say("matchesGlob", path.matchesGlob("/foo/bar/baz.js", "/foo/**/*.js"), path.matchesGlob("a.txt", "*.js"), path.matchesGlob("src/a/b.ts", "src/**/*.{ts,tsx}"), path.matchesGlob("x.js", "?.js"));
  say("toNamespacedPath", path.toNamespacedPath("/a/b") === "/a/b", path.win32.toNamespacedPath("C:\\a\\b"));

  // fs
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "graak-extras-"));
  fs.mkdirSync(path.join(dir, "src/deep"), { recursive: true });
  for (const f of ["a.js", "b.ts", "src/c.js", "src/deep/d.js", "src/deep/e.txt"]) fs.writeFileSync(path.join(dir, f), f);
  say("globSync", fs.globSync("**/*.js", { cwd: dir }).sort(), fs.globSync(["*.ts", "src/*.js"], { cwd: dir }).sort());
  const globbed = [];
  for await (const f of fs.promises.glob("src/**", { cwd: dir })) globbed.push(f);
  say("promises.glob", globbed.sort());
  const fd = fs.openSync(path.join(dir, "v.bin"), "w+");
  say("writevSync", fs.writevSync(fd, [Buffer.from("ab"), Buffer.from("cde")]));
  const one = Buffer.alloc(2);
  const two = Buffer.alloc(3);
  say("readvSync", fs.readvSync(fd, [one, two], 0), one.toString(), two.toString());
  fs.closeSync(fd);
  say("openAsBlob", await (await fs.openAsBlob(path.join(dir, "a.js"))).text());
  fs.rmSync(dir, { recursive: true, force: true });

  // process
  say("getBuiltinModule", process.getBuiltinModule("node:path") === path, process.getBuiltinModule("nope"), typeof process.availableMemory());
  const envDir = fs.mkdtempSync(path.join(os.tmpdir(), "graak-env-"));
  const envFile = path.join(envDir, ".env");
  fs.writeFileSync(envFile, 'GRAAK_A=1\nGRAAK_B="two words"\n# comment\nexport GRAAK_C=3 # trailing\nGRAAK_D=\'q\'\n');
  process.loadEnvFile(envFile);
  say("loadEnvFile", process.env.GRAAK_A, process.env.GRAAK_B, process.env.GRAAK_C, process.env.GRAAK_D);
  fs.rmSync(envDir, { recursive: true, force: true });
  say("process misc", typeof process.ppid, typeof process.finalization.register, process.sourceMapsEnabled);

  // util
  const mime = new util.MIMEType('text/html; charset="utf-8"; q=0.5');
  say("MIMEType", mime.type, mime.subtype, mime.essence, mime.params.get("charset"), mime.params.get("q"), String(mime), mime.params.has("nope"));
  try { new util.MIMEType("nonsense"); } catch (e) { say("MIMEType bad", e.code); }
  say("util misc", typeof util.getCallSites, typeof util.debug, typeof util.getSystemErrorMessage);

  // buffer
  const buffer = require("buffer");
  say("transcode", buffer.transcode(Buffer.from("héllo", "utf8"), "utf8", "latin1").toString("latin1"), buffer.Blob === Blob, buffer.File === File);

  // message channels
  const { MessageChannel, BroadcastChannel, receiveMessageOnPort, setEnvironmentData, getEnvironmentData } = require("worker_threads");
  const mc = new MessageChannel();
  const got = [];
  mc.port1.on("message", (m) => got.push(m));
  mc.port2.postMessage({ a: [1, 2, new Date(0)], m: new Map([[1, 2]]) });
  mc.port2.postMessage("second");
  await new Promise((r) => setTimeout(r, 10));
  say("MessageChannel", got.map((m) => (typeof m === "string" ? m : { a: m.a.slice(0, 2), date: m.a[2] instanceof Date, map: [...m.m] })));
  const mc2 = new MessageChannel();
  mc2.port1.postMessage("sync");
  say("receiveMessageOnPort", receiveMessageOnPort(mc2.port2), receiveMessageOnPort(mc2.port2));
  say("global channel", MessageChannel === globalThis.MessageChannel, typeof MessagePort, BroadcastChannel === globalThis.BroadcastChannel);
  const a = new BroadcastChannel("graak");
  const b = new BroadcastChannel("graak");
  const heard = new Promise((resolve) => { b.onmessage = (e) => resolve(e.data); });
  a.postMessage({ hello: "world" });
  say("BroadcastChannel", await heard);
  a.close(); b.close();
  setEnvironmentData("k", "v");
  say("environmentData", getEnvironmentData("k"), getEnvironmentData("nope"));

  // events and navigator
  const custom = new CustomEvent("hello", { detail: { n: 1 } });
  say("CustomEvent", custom.type, custom.detail, custom instanceof Event);
  say("navigator", typeof navigator.hardwareConcurrency, typeof navigator.userAgent, typeof navigator.language, Array.isArray(navigator.languages), typeof navigator.platform);

  // performance
  const marks = [];
  const observer = new PerformanceObserver((list) => { for (const e of list.getEntries()) marks.push(`${e.entryType}:${e.name}`); });
  observer.observe({ entryTypes: ["mark", "measure"] });
  performance.mark("start");
  performance.mark("end");
  const measure = performance.measure("span", "start", "end");
  await new Promise((r) => setTimeout(r, 10));
  observer.disconnect();
  say("performance", marks, measure.entryType, measure.duration >= 0, performance.getEntriesByName("start").length, performance.getEntriesByType("measure").length);
  performance.clearMarks();
  say("clearMarks", performance.getEntriesByType("mark").length);

  // web streams
  const enc = new TextEncoderStream();
  const w = enc.writable.getWriter();
  w.write("héllo ");
  w.write("wörld");
  w.close();
  const encoded = [];
  for await (const chunk of enc.readable) encoded.push(...chunk);
  say("TextEncoderStream", Buffer.from(encoded).toString());
  const dec = new TextDecoderStream();
  const dw = dec.writable.getWriter();
  const bytes = Buffer.from("héllo wörld");
  dw.write(bytes.subarray(0, 2));
  dw.write(bytes.subarray(2));
  dw.close();
  let decoded = "";
  for await (const chunk of dec.readable) decoded += chunk;
  say("TextDecoderStream", decoded, dec.encoding);
  for (const format of ["gzip", "deflate", "deflate-raw"]) {
    const cs = new CompressionStream(format);
    const cw = cs.writable.getWriter();
    cw.write(new TextEncoder().encode("compress me ".repeat(50)));
    cw.close();
    const packed = new Uint8Array(await new Response(cs.readable).arrayBuffer());
    const ds = new DecompressionStream(format);
    const dsw = ds.writable.getWriter();
    dsw.write(packed);
    dsw.close();
    say("Compression", format, packed.length < 600, await new Response(ds.readable).text() === "compress me ".repeat(50));
  }
  say("stream classes", typeof ReadableStreamDefaultReader, typeof WritableStreamDefaultWriter, new ReadableStream().getReader() instanceof ReadableStreamDefaultReader);

  // net, tls, querystring, stream, readline
  const net = require("net");
  const list = new net.BlockList();
  list.addAddress("1.2.3.4");
  list.addRange("10.0.0.1", "10.0.0.9");
  list.addSubnet("192.168.1.0", 24);
  say("BlockList", list.check("1.2.3.4"), list.check("10.0.0.5"), list.check("10.0.0.10"), list.check("192.168.1.77"), list.check("192.168.2.1"));
  const sa = new net.SocketAddress({ address: "10.1.2.3", port: 80 });
  say("SocketAddress", sa.address, sa.port, sa.family);
  const tls = require("tls");
  say("checkServerIdentity", tls.checkServerIdentity("a.example.com", { subjectaltname: "DNS:*.example.com" }), tls.checkServerIdentity("example.org", { subjectaltname: "DNS:example.com" }).code, typeof tls.getCiphers()[0]);
  say("querystring", require("querystring").encode({ a: [1, 2], b: "x y" }), require("querystring").decode("a=1&a=2&b=x%20y"));
  const { duplexPair } = require("stream");
  const [d1, d2] = duplexPair();
  d1.write("through");
  say("duplexPair", String(d2.read()));
  const readline = require("readline");
  const { PassThrough } = require("stream");
  const input = new PassThrough();
  readline.emitKeypressEvents(input);
  const keys = [];
  input.on("keypress", (str, key) => keys.push([str, key.name, key.ctrl]));
  input.write("a\x1b[A\r\x03");
  await new Promise((r) => setTimeout(r, 10));
  say("keypress", keys);
  say("console", typeof console.Console, typeof console.groupCollapsed, typeof console.clear);
  say("constants", require("constants").ECONNREFUSED, os.constants.errno.EADDRINUSE, require("constants").ENOTEMPTY);
  for (const l of out) console.log(l);
  process.exit(0);
})();
