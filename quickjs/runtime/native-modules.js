/*
 * Node-shaped `crypto`, `zlib`, `net` and `tls`, built on the native host.
 *
 * These are the four modules `node-compat.js` cannot implement, because the engine alone has no
 * sockets, no compression and no secure randomness. `graak-c` (`quickjs/native/`) supplies
 * those as `globalThis.__graak_native`; this file is the thin part that gives them the
 * shapes Node libraries expect, so discord.js sees `tls.connect()` rather than an integer socket
 * id.
 *
 * Nothing here invents behaviour. Where the native side has no answer -- ciphers, signing, the
 * Diffie-Hellman surface -- the export throws and names what is missing, rather than returning
 * something that looks like a result.
 */

import * as os from "qjs:os";

const native = globalThis.__graak_native;

/* node-compat.js installs Node-shaped timers; run bare under the host (the selftest), the engine's own are used. */
const startTimer = (fn, ms) => (globalThis.setTimeout ?? os.setTimeout)(fn, ms);
const stopTimer = (handle) => (globalThis.clearTimeout ?? os.clearTimeout)(handle);

/*
 * The native host's socket calls are synchronous and return their value directly. Wrapping every
 * call through this means the code below is written once against promises, so a call site never
 * has to know or care whether the value it got back was already resolved.
 */
const settled = (value) => (value && typeof value.then === "function" ? value : Promise.resolve(value));
if (!native) {
	throw new Error(
		"native-modules.js requires the Graak native host. Run it under `graak-c`, " +
			"not a bare `qjs` -- a standalone engine has no sockets to expose."
	);
}

const toBytes = (value, encoding = "utf8") => {
	if (value == null) return new Uint8Array(0);
	if (typeof value === "string") {
		if (encoding === "hex") {
			const out = new Uint8Array(value.length >> 1);
			for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(value.substr(i * 2, 2), 16);
			return out;
		}
		// TextEncoder when a JavaScript layer has installed it, otherwise the host's own
		// UTF-8 conversion -- this file must work with or without node-compat.js loaded.
		return typeof TextEncoder === "function" ? new TextEncoder().encode(value) : native.encodeUtf8(value);
	}
	if (value instanceof Uint8Array) return value;
	if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
	if (value instanceof ArrayBuffer) return new Uint8Array(value);
	throw new TypeError("expected a string, Buffer or TypedArray");
};

const toHex = (bytes) => {
	let out = "";
	for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
	return out;
};

const toBase64 = (bytes) => {
	const table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
	let out = "";
	for (let i = 0; i < bytes.length; i += 3) {
		const triple = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
		out += table[(triple >> 18) & 63] + table[(triple >> 12) & 63];
		out += i + 1 < bytes.length ? table[(triple >> 6) & 63] : "=";
		out += i + 2 < bytes.length ? table[triple & 63] : "=";
	}
	return out;
};

function digestOut(bytes, encoding) {
	if (!encoding || encoding === "buffer") return typeof Buffer !== "undefined" ? Buffer.from(bytes) : bytes;
	if (encoding === "hex") return toHex(bytes);
	if (encoding === "base64") return toBase64(bytes);
	throw new TypeError(`Unsupported digest encoding '${encoding}'`);
}

/* -------------------------------------------------------------------- crypto */

/* ---------------------------------------------------------------------- zlib */

const asBuffer = (bytes) => (typeof Buffer !== "undefined" ? Buffer.from(bytes) : bytes);

function callbackify(fn) {
	return (data, optionsOrCallback, maybeCallback) => {
		const callback = typeof optionsOrCallback === "function" ? optionsOrCallback : maybeCallback;
		try {
			const result = fn(data);
			if (callback) queueMicrotask(() => callback(null, result));
			return result;
		} catch (err) {
			if (callback) {
				queueMicrotask(() => callback(err));
				return undefined;
			}
			throw err;
		}
	};
}

/* ---------------------------------------------------------------------- zlib */

let crcTable = null;
function crc32Of(bytes, previous = 0) {
	if (!crcTable) {
		crcTable = new Uint32Array(256);
		for (let n = 0; n < 256; n++) {
			let c = n;
			for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
			crcTable[n] = c >>> 0;
		}
	}
	let crc = ~previous >>> 0;
	for (let i = 0; i < bytes.length; i++) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
	return ~crc >>> 0;
}

/* The native calls throw engine errors; programs branch on zlib's own codes. */
function zlibError(err) {
	const error = err instanceof Error ? err : new Error(String(err));
	if (error.code) return error;
	const text = String(error.message);
	if (/unexpected end|truncated|buf/i.test(text)) {
		error.code = "Z_BUF_ERROR";
		error.errno = -5;
		error.message = "unexpected end of file";
	} else if (!error.code) {
		error.code = "Z_DATA_ERROR";
		error.errno = -3;
		if (/inflate/i.test(text) || /failed/i.test(text)) error.message = /gzip|header/i.test(text) ? "incorrect header check" : "invalid stored block lengths";
	}
	return error;
}
const receivedText = (value) => {
	if (value === null || value === undefined) return `Received ${value}`;
	if (typeof value === "function") return `Received function ${value.name}`;
	if (typeof value === "object") return `Received an instance of ${value.constructor?.name ?? "Object"}`;
	return `Received type ${typeof value} (${typeof value === "bigint" ? `${value}n` : String(value)})`;
};
const checkBuffer = (data) => {
	if (typeof data === "string" || data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return;
	throw Object.assign(
		new TypeError(`The "buffer" argument must be of type string or an instance of Buffer, TypedArray, DataView, or ArrayBuffer. ${receivedText(data)}`),
		{ code: "ERR_INVALID_ARG_TYPE" }
	);
};
const guarded = (fn) => (data, options) => {
	checkBuffer(data);
	try {
		return asBuffer(fn(toBytes(data), options));
	} catch (err) {
		throw zlibError(err);
	}
};

function gzipBytes(bytes) {
	const body = native.deflate(bytes, true);
	const out = new Uint8Array(body.length + 18);
	out.set([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3], 0);
	out.set(body, 10);
	const view = new DataView(out.buffer);
	view.setUint32(10 + body.length, crc32Of(bytes), true);
	view.setUint32(14 + body.length, bytes.length >>> 0, true);
	return out;
}

/* gzip = header, raw deflate, CRC-32 and length. The host inflates raw deflate; the framing is checked here. */
function gunzipBytes(bytes) {
	const bad = (message, code = "Z_DATA_ERROR", errno = -3) => Object.assign(new Error(message), { code, errno });
	if (bytes.length < 18 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw bad("incorrect header check");
	if (bytes[2] !== 8) throw bad("unknown compression method");
	const flags = bytes[3];
	let pos = 10;
	if (flags & 4) pos += 2 + (bytes[pos] | (bytes[pos + 1] << 8));
	if (flags & 8) while (pos < bytes.length && bytes[pos++] !== 0);
	if (flags & 16) while (pos < bytes.length && bytes[pos++] !== 0);
	if (flags & 2) pos += 2;
	if (pos > bytes.length - 8) throw bad("unexpected end of file", "Z_BUF_ERROR", -5);
	const body = native.inflate(bytes.subarray(pos, bytes.length - 8), true);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(bytes.length - 8, true) !== crc32Of(body)) throw bad("incorrect data check");
	if (view.getUint32(bytes.length - 4, true) !== body.length >>> 0) throw bad("incorrect length check");
	return body;
}

const isGzip = (bytes) => bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;

const zlib = {
	inflateSync: guarded((data) => native.inflate(data, false)),
	deflateSync: guarded((data) => native.deflate(data, false)),
	inflateRawSync: guarded((data) => native.inflate(data, true)),
	deflateRawSync: guarded((data) => native.deflate(data, true)),
	gzipSync: guarded(gzipBytes),
	gunzipSync: guarded((data) => gunzipBytes(data)),
	unzipSync: guarded((data) => (isGzip(data) ? gunzipBytes(data) : native.inflate(data, false))),
	crc32: (data, value = 0) => crc32Of(toBytes(data), value),
	constants: {
		Z_NO_FLUSH: 0, Z_PARTIAL_FLUSH: 1, Z_SYNC_FLUSH: 2, Z_FULL_FLUSH: 3, Z_FINISH: 4, Z_BLOCK: 5,
		Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_MEM_ERROR: -4,
		Z_BUF_ERROR: -5, Z_VERSION_ERROR: -6, Z_NO_COMPRESSION: 0, Z_BEST_SPEED: 1, Z_BEST_COMPRESSION: 9,
		Z_DEFAULT_COMPRESSION: -1, Z_FILTERED: 1, Z_HUFFMAN_ONLY: 2, Z_RLE: 3, Z_FIXED: 4, Z_DEFAULT_STRATEGY: 0,
		Z_MIN_WINDOWBITS: 8, Z_MAX_WINDOWBITS: 15, Z_DEFAULT_WINDOWBITS: 15, Z_MIN_CHUNK: 64, Z_MAX_CHUNK: Infinity,
		Z_DEFAULT_CHUNK: 16384, Z_MIN_MEMLEVEL: 1, Z_MAX_MEMLEVEL: 9, Z_DEFAULT_MEMLEVEL: 8, Z_MIN_LEVEL: -1,
		Z_MAX_LEVEL: 9, Z_DEFAULT_LEVEL: -1,
	},
};
zlib.codes = { Z_OK: 0, Z_STREAM_END: 1, Z_NEED_DICT: 2, Z_ERRNO: -1, Z_STREAM_ERROR: -2, Z_DATA_ERROR: -3, Z_MEM_ERROR: -4, Z_BUF_ERROR: -5, Z_VERSION_ERROR: -6 };
Object.assign(zlib, zlib.constants);

/* Brotli: the encoder and decoder are compiled into the host. Options are Node's: { params, maxOutputLength }. */
const BROTLI_CONSTANTS = {"BROTLI_DECODE":8,"BROTLI_ENCODE":9,"BROTLI_OPERATION_PROCESS":0,"BROTLI_OPERATION_FLUSH":1,"BROTLI_OPERATION_FINISH":2,"BROTLI_OPERATION_EMIT_METADATA":3,"BROTLI_PARAM_MODE":0,"BROTLI_MODE_GENERIC":0,"BROTLI_MODE_TEXT":1,"BROTLI_MODE_FONT":2,"BROTLI_DEFAULT_MODE":0,"BROTLI_PARAM_QUALITY":1,"BROTLI_MIN_QUALITY":0,"BROTLI_MAX_QUALITY":11,"BROTLI_DEFAULT_QUALITY":11,"BROTLI_PARAM_LGWIN":2,"BROTLI_MIN_WINDOW_BITS":10,"BROTLI_MAX_WINDOW_BITS":24,"BROTLI_LARGE_MAX_WINDOW_BITS":30,"BROTLI_DEFAULT_WINDOW":22,"BROTLI_PARAM_LGBLOCK":3,"BROTLI_MIN_INPUT_BLOCK_BITS":16,"BROTLI_MAX_INPUT_BLOCK_BITS":24,"BROTLI_PARAM_DISABLE_LITERAL_CONTEXT_MODELING":4,"BROTLI_PARAM_SIZE_HINT":5,"BROTLI_PARAM_LARGE_WINDOW":6,"BROTLI_PARAM_NPOSTFIX":7,"BROTLI_PARAM_NDIRECT":8,"BROTLI_DECODER_RESULT_ERROR":0,"BROTLI_DECODER_RESULT_SUCCESS":1,"BROTLI_DECODER_RESULT_NEEDS_MORE_INPUT":2,"BROTLI_DECODER_RESULT_NEEDS_MORE_OUTPUT":3,"BROTLI_DECODER_PARAM_DISABLE_RING_BUFFER_REALLOCATION":0,"BROTLI_DECODER_PARAM_LARGE_WINDOW":1,"BROTLI_DECODER_NO_ERROR":0,"BROTLI_DECODER_SUCCESS":1,"BROTLI_DECODER_NEEDS_MORE_INPUT":2,"BROTLI_DECODER_NEEDS_MORE_OUTPUT":3,"BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_NIBBLE":-1,"BROTLI_DECODER_ERROR_FORMAT_RESERVED":-2,"BROTLI_DECODER_ERROR_FORMAT_EXUBERANT_META_NIBBLE":-3,"BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_ALPHABET":-4,"BROTLI_DECODER_ERROR_FORMAT_SIMPLE_HUFFMAN_SAME":-5,"BROTLI_DECODER_ERROR_FORMAT_CL_SPACE":-6,"BROTLI_DECODER_ERROR_FORMAT_HUFFMAN_SPACE":-7,"BROTLI_DECODER_ERROR_FORMAT_CONTEXT_MAP_REPEAT":-8,"BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_1":-9,"BROTLI_DECODER_ERROR_FORMAT_BLOCK_LENGTH_2":-10,"BROTLI_DECODER_ERROR_FORMAT_TRANSFORM":-11,"BROTLI_DECODER_ERROR_FORMAT_DICTIONARY":-12,"BROTLI_DECODER_ERROR_FORMAT_WINDOW_BITS":-13,"BROTLI_DECODER_ERROR_FORMAT_PADDING_1":-14,"BROTLI_DECODER_ERROR_FORMAT_PADDING_2":-15,"BROTLI_DECODER_ERROR_FORMAT_DISTANCE":-16,"BROTLI_DECODER_ERROR_DICTIONARY_NOT_SET":-19,"BROTLI_DECODER_ERROR_INVALID_ARGUMENTS":-20,"BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MODES":-21,"BROTLI_DECODER_ERROR_ALLOC_TREE_GROUPS":-22,"BROTLI_DECODER_ERROR_ALLOC_CONTEXT_MAP":-25,"BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_1":-26,"BROTLI_DECODER_ERROR_ALLOC_RING_BUFFER_2":-27,"BROTLI_DECODER_ERROR_ALLOC_BLOCK_TYPE_TREES":-30,"BROTLI_DECODER_ERROR_UNREACHABLE":-31};
Object.assign(zlib.constants, BROTLI_CONSTANTS);
const brotliParam = (options, param, fallback) => {
	const value = options?.params?.[param];
	return value === undefined ? fallback : Number(value);
};
const brotliCompressBytes = (bytes, options) =>
	native.brotliCompress(
		bytes,
		brotliParam(options, zlib.constants.BROTLI_PARAM_QUALITY, zlib.constants.BROTLI_DEFAULT_QUALITY),
		brotliParam(options, zlib.constants.BROTLI_PARAM_LGWIN, zlib.constants.BROTLI_DEFAULT_WINDOW),
		brotliParam(options, zlib.constants.BROTLI_PARAM_MODE, zlib.constants.BROTLI_DEFAULT_MODE)
	);
const brotliDecompressBytes = (bytes, options) => {
	try {
		return native.brotliDecompress(bytes, options?.maxOutputLength);
	} catch (err) {
		if (err.code === "ERR_BUFFER_TOO_LARGE") {
			err.message = `Cannot create a Buffer larger than ${options.maxOutputLength} bytes`;
			Object.setPrototypeOf(err, RangeError.prototype);
		}
		throw err;
	}
};
zlib.brotliCompressSync = guarded(brotliCompressBytes);
zlib.brotliDecompressSync = guarded(brotliDecompressBytes);

/* Zstandard: compiled into the host. Options are Node's: { params, pledgedSrcSize, maxOutputLength }. */
const ZSTD_CONSTANTS = {"ZSTD_DECOMPRESS": 11, "ZSTD_COMPRESS": 10, "ZSTD_e_continue": 0, "ZSTD_e_flush": 1, "ZSTD_e_end": 2, "ZSTD_fast": 1, "ZSTD_dfast": 2, "ZSTD_greedy": 3, "ZSTD_lazy": 4, "ZSTD_lazy2": 5, "ZSTD_btlazy2": 6, "ZSTD_btopt": 7, "ZSTD_btultra": 8, "ZSTD_btultra2": 9, "ZSTD_c_compressionLevel": 100, "ZSTD_c_windowLog": 101, "ZSTD_c_hashLog": 102, "ZSTD_c_chainLog": 103, "ZSTD_c_searchLog": 104, "ZSTD_c_minMatch": 105, "ZSTD_c_targetLength": 106, "ZSTD_c_strategy": 107, "ZSTD_c_enableLongDistanceMatching": 160, "ZSTD_c_ldmHashLog": 161, "ZSTD_c_ldmMinMatch": 162, "ZSTD_c_ldmBucketSizeLog": 163, "ZSTD_c_ldmHashRateLog": 164, "ZSTD_c_contentSizeFlag": 200, "ZSTD_c_checksumFlag": 201, "ZSTD_c_dictIDFlag": 202, "ZSTD_c_nbWorkers": 400, "ZSTD_c_jobSize": 401, "ZSTD_c_overlapLog": 402, "ZSTD_d_windowLogMax": 100, "ZSTD_CLEVEL_DEFAULT": 3, "ZSTD_error_no_error": 0, "ZSTD_error_GENERIC": 1, "ZSTD_error_prefix_unknown": 10, "ZSTD_error_version_unsupported": 12, "ZSTD_error_frameParameter_unsupported": 14, "ZSTD_error_frameParameter_windowTooLarge": 16, "ZSTD_error_corruption_detected": 20, "ZSTD_error_checksum_wrong": 22, "ZSTD_error_literals_headerWrong": 24, "ZSTD_error_dictionary_corrupted": 30, "ZSTD_error_dictionary_wrong": 32, "ZSTD_error_dictionaryCreation_failed": 34, "ZSTD_error_parameter_unsupported": 40, "ZSTD_error_parameter_combination_unsupported": 41, "ZSTD_error_parameter_outOfBound": 42, "ZSTD_error_tableLog_tooLarge": 44, "ZSTD_error_maxSymbolValue_tooLarge": 46, "ZSTD_error_maxSymbolValue_tooSmall": 48, "ZSTD_error_stabilityCondition_notRespected": 50, "ZSTD_error_stage_wrong": 60, "ZSTD_error_init_missing": 62, "ZSTD_error_memory_allocation": 64, "ZSTD_error_workSpace_tooSmall": 66, "ZSTD_error_dstSize_tooSmall": 70, "ZSTD_error_srcSize_wrong": 72, "ZSTD_error_dstBuffer_null": 74, "ZSTD_error_noForwardProgress_destFull": 80, "ZSTD_error_noForwardProgress_inputEmpty": 82};
Object.assign(zlib.constants, ZSTD_CONSTANTS);
const ZSTD_ERROR_NAMES = {};
for (const [name, value] of Object.entries(ZSTD_CONSTANTS)) if (name.startsWith("ZSTD_error_")) ZSTD_ERROR_NAMES[value] = name;
const zstdParams = (options, decompress) => {
	const pairs = [];
	const params = options?.params;
	if (params === undefined) return pairs;
	if (params === null || typeof params !== "object") {
		throw Object.assign(new TypeError('The "options.params" property must be of type object.'), { code: "ERR_INVALID_ARG_TYPE" });
	}
	const valid = new Set(Object.entries(ZSTD_CONSTANTS).filter(([name]) => /^ZSTD_[cd]_/.test(name)).map(([, value]) => value));
	for (const key of Object.keys(params)) {
		const id = Number(key);
		if (!valid.has(id)) {
			throw Object.assign(new RangeError(`${key} is not a valid zstd parameter`), { code: "ERR_ZSTD_INVALID_PARAM" });
		}
		pairs.push([id, Number(params[key])]);
	}
	return pairs;
};
const zstdWrap = (err) => {
	if (err && err.code === "ZSTD_error" && ZSTD_ERROR_NAMES[err.errno]) err.code = ZSTD_ERROR_NAMES[err.errno];
	return err;
};
const zstdCompressBytes = (bytes, options) => native.zstdCompress(bytes, zstdParams(options), options?.pledgedSrcSize);
const zstdDecompressBytes = (bytes, options) => {
	try {
		return native.zstdDecompress(bytes, options?.maxOutputLength, options?.params?.[ZSTD_CONSTANTS.ZSTD_d_windowLogMax]);
	} catch (err) {
		if (err.code === "ERR_BUFFER_TOO_LARGE") {
			err.message = `Cannot create a Buffer larger than ${options.maxOutputLength} bytes`;
			Object.setPrototypeOf(err, RangeError.prototype);
		}
		throw zstdWrap(err);
	}
};
zlib.zstdCompressSync = guarded((bytes, options) => {
	try {
		return zstdCompressBytes(bytes, options);
	} catch (err) {
		throw zstdWrap(err);
	}
});
zlib.zstdDecompressSync = guarded(zstdDecompressBytes);

for (const name of ["inflate", "deflate", "inflateRaw", "deflateRaw", "gzip", "gunzip", "unzip", "brotliCompress", "brotliDecompress", "zstdCompress", "zstdDecompress"]) {
	const sync = zlib[`${name}Sync`];
	zlib[name] = (data, options, callback) => {
		if (typeof options === "function") callback = options;
		if (typeof callback !== "function") {
			throw Object.assign(new TypeError('The "callback" argument must be of type function.'), { code: "ERR_INVALID_ARG_TYPE" });
		}
		let result;
		let error = null;
		try {
			result = sync(data, typeof options === "object" ? options : undefined);
		} catch (err) {
			error = err;
		}
		queueMicrotask(() => (error ? callback(error) : callback(null, result)));
	};
}

/*
 * The stream forms (createGzip, createGunzip, ...). Each buffers what is written and transforms it as one piece
 * when the stream ends: correct output, but a whole message is held in memory rather than streamed through.
 */
zlib.attachStreams = (Transform) => {
	const make = (name, syncName) => {
		function Codec(options) {
			if (!(this instanceof Codec)) return new Codec(options);
			Transform.call(this, options);
			this._chunks = [];
			this._codecOptions = options;
			this.bytesWritten = 0;
		}
		Object.setPrototypeOf(Codec.prototype, Transform.prototype);
		Object.setPrototypeOf(Codec, Transform);
		Codec.prototype._transform = function (chunk, encoding, callback) {
			this._chunks.push(chunk);
			this.bytesWritten += chunk.length;
			callback();
		};
		Codec.prototype._flush = function (callback) {
			let output;
			try {
				output = zlib[syncName](Buffer.concat(this._chunks), this._codecOptions);
			} catch (err) {
				callback(err);
				return;
			}
			this._chunks = [];
			this.push(output);
			callback();
		};
		Codec.prototype.close = function (callback) {
			if (callback) this.once("close", callback);
			this.destroy();
		};
		Codec.prototype.flush = function (kind, callback) {
			if (typeof kind === "function") callback = kind;
			if (callback) queueMicrotask(callback);
		};
		Codec.prototype.params = function (level, strategy, callback) {
			if (callback) queueMicrotask(callback);
		};
		Codec.prototype.reset = function () {};
		Object.defineProperty(Codec, "name", { value: name });
		return Codec;
	};
	const kinds = { ZstdCompress: "zstdCompressSync", ZstdDecompress: "zstdDecompressSync", BrotliCompress: "brotliCompressSync", BrotliDecompress: "brotliDecompressSync", Deflate: "deflateSync", Inflate: "inflateSync", DeflateRaw: "deflateRawSync", InflateRaw: "inflateRawSync", Gzip: "gzipSync", Gunzip: "gunzipSync", Unzip: "unzipSync" };
	for (const [name, syncName] of Object.entries(kinds)) {
		const Codec = make(name, syncName);
		zlib[name] = Codec;
		zlib[`create${name}`] = (options) => new Codec(options);
	}
};

/* ----------------------------------------------------------------- net / tls */

/*
 * Sockets are non-blocking on the native side. One poller serves every open socket and listener from the
 * JavaScript thread: it asks the host which ids are ready, waiting at most POLL_MS inside the host (so an
 * idle process costs almost nothing while a ready socket is served at once), then calls each id's handler.
 * It stops by itself when nothing is being watched, so it never keeps a finished program alive.
 */
const POLL_MS = 4;
const watchers = new Map();
const writeWatchers = new Map();
let pollTimer = null;

function pollTick() {
	pollTimer = null;
	if (!watchers.size && !writeWatchers.size) return;
	let readable = [];
	let writable = [];
	try {
		[readable, writable] = native.poll([...watchers.keys()], POLL_MS, [...writeWatchers.keys()]);
	} catch {
		// A closed id: the handlers below find out when they try to use it.
		readable = [...watchers.keys()];
		writable = [...writeWatchers.keys()];
	}
	const run = (fn) => {
		if (!fn) return;
		try {
			fn();
		} catch (error) {
			// One handler's failure must not stop the poller serving every other socket.
			if (typeof globalThis.__graak_reportUncaught === "function") globalThis.__graak_reportUncaught(error);
			else throw error;
		}
	};
	for (const id of writable) run(writeWatchers.get(id));
	for (const id of readable) run(watchers.get(id));
	if (watchers.size || writeWatchers.size) pollTimer = startTimer(pollTick, 0);
}

function ensurePolling() {
	if (!pollTimer) pollTimer = startTimer(pollTick, 0);
}

function watch(id, fn) {
	watchers.set(id, fn);
	ensurePolling();
}

function unwatch(id) {
	watchers.delete(id);
}

/* Writability, watched only while a socket has bytes it could not send yet. */
function watchWrite(id, fn) {
	writeWatchers.set(id, fn);
	ensurePolling();
}

function unwatchWrite(id) {
	writeWatchers.delete(id);
}

const toError = (err) => (err instanceof Error ? err : new Error(String(err)));

/* ------------------------------------------------------------- TLS options */

let cryptoTools = () => undefined;
const nodeBuffer = () => globalThis.Buffer;
const pemText = (value) => {
	if (Array.isArray(value)) return value.map(pemText).join("\n");
	if (typeof value === "string") return value;
	if (value && typeof value === "object" && value.pem !== undefined) return pemText(value.pem);
	return nodeBuffer().from(toBytes(value)).toString("utf8");
};
const keyText = (options) => {
	let key = options.key;
	if (Array.isArray(key)) key = key[0];
	const passphrase = key && typeof key === "object" && key.passphrase !== undefined ? key.passphrase : options.passphrase;
	if (key && typeof key === "object" && key.pem !== undefined) key = key.pem;
	return { key: key === undefined ? undefined : pemText(key), passphrase: passphrase === undefined ? undefined : String(passphrase) };
};
const alpnNames = (value) => {
	if (value === undefined || value === null) return undefined;
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.join("\n");
	const bytes = toBytes(value);
	const names = [];
	for (let i = 0; i < bytes.length; ) {
		const length = bytes[i++];
		names.push(nodeBuffer().from(bytes.subarray(i, i + length)).toString("latin1"));
		i += length;
	}
	return names.join("\n");
};
const tlsVersion = (name, which) => {
	if (name === undefined) return 0;
	const known = { TLSv1: 10, "TLSv1.1": 11, "TLSv1.2": 12, "TLSv1.3": 13 };
	if (!(name in known)) {
		throw Object.assign(new TypeError(`The argument 'options.${which}' is invalid. Received '${name}'`), { code: "ERR_TLS_INVALID_PROTOCOL_VERSION" });
	}
	const code = known[name];
	if (which === "maxVersion" && code < 12) {
		throw Object.assign(new Error(`${name} is not available in the Graak native host: the TLS library supports TLSv1.2 and TLSv1.3`), { code: "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM" });
	}
	return which === "minVersion" && code < 12 ? 12 : code;
};
/* What the host's tls layer takes: strings for the PEM material, plain numbers and flags for the rest. */
function tlsOptions(options) {
	const o = { ...(options.secureContext?._options ?? {}), ...options };
	if (o.pfx !== undefined) {
		const tools = cryptoTools();
		if (!tools?.pfx) throw Object.assign(new Error("tls option 'pfx' needs the crypto module"), { code: "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM" });
		const opened = tools.pfx(o.pfx, o.passphrase);
		o.key = opened.key;
		o.cert = opened.cert;
		o.passphrase = undefined;
	}
	const { key, passphrase } = keyText(o);
	return {
		servername: typeof o.servername === "string" && o.servername && !/^[0-9.]+$|:/.test(o.servername) ? o.servername : undefined,
		ca: o.ca === undefined ? undefined : pemText(o.ca),
		cert: o.cert === undefined ? undefined : pemText(o.cert),
		key,
		passphrase,
		alpn: alpnNames(o.ALPNProtocols),
		minVersion: tlsVersion(o.minVersion, "minVersion"),
		maxVersion: tlsVersion(o.maxVersion, "maxVersion"),
		requestCert: Boolean(o.requestCert),
		rejectUnauthorized: o.rejectUnauthorized === undefined ? undefined : Boolean(o.rejectUnauthorized),
		deferred: typeof o.checkServerIdentity === "function",
		ciphers: o.ciphers === undefined ? undefined : cipherListFor(o.ciphers),
	};
}
/* ---- cipher suites: OpenSSL's names on the outside, mbedTLS's inside */
const TLS13_DEFAULT = ["TLS_AES_256_GCM_SHA384", "TLS_CHACHA20_POLY1305_SHA256", "TLS_AES_128_GCM_SHA256"];
let cipherTable = null;
const opensslCipherName = (mbed) => {
	const standard = mbed.replace(/^TLS1-3-/, "TLS_").replace(/-/g, "_");
	if (mbed.startsWith("TLS1-3-")) return { name: standard, tls13: true, standard };
	const m = /^TLS_(?:(ECDHE|DHE|RSA)_(?:(RSA|ECDSA)_)?)WITH_(.+)$/.exec(standard);
	if (!m || /PSK|ECJPAKE|CAMELLIA|ARIA|NULL/.test(standard)) return null;
	const [, kx, auth, rest] = m;
	let cipher = rest;
	const hashMatch = /_(SHA\d*)$/.exec(cipher);
	const hash = hashMatch ? hashMatch[1] : "";
	if (hashMatch) cipher = cipher.slice(0, -hashMatch[0].length);
	let body;
	if (cipher === "CHACHA20_POLY1305") body = "CHACHA20-POLY1305";
	else {
		const am = /^AES_(128|256)_(GCM|CBC|CCM|CCM_8)$/.exec(cipher);
		if (!am) return null;
		const mode = am[2].replace("_", "-");
		body = mode === "CBC" ? `AES${am[1]}` : `AES${am[1]}-${mode}`;
		if (mode === "CBC" && hash && hash !== "SHA") body += `-${hash}`;
		else if (mode === "CBC") body += "-SHA";
		else if (hash) body += `-${hash}`;
	}
	if (cipher === "CHACHA20_POLY1305" && hash) body += "";
	const name = kx === "RSA" ? body : `${kx}-${auth}-${body}`;
	return { name, tls13: false, standard };
};
function cipherTableOf() {
	if (!cipherTable) {
		cipherTable = new Map();
		for (const mbed of native.tlsCiphers()) {
			const info = opensslCipherName(mbed);
			if (info) cipherTable.set(info.name, { ...info, mbed });
		}
	}
	return cipherTable;
}
/* Node's `ciphers` string ("ECDHE-RSA-AES128-GCM-SHA256:!aNULL", TLS_ names for 1.3) -> mbedTLS names joined by newlines. */
function cipherListFor(text) {
	const table = cipherTableOf();
	const tls12 = [...table.values()].filter((c) => !c.tls13);
	const tls13 = [...table.values()].filter((c) => c.tls13);
	const chosen12 = [];
	const chosen13 = [];
	let sawTls13 = false;
	const expand = (token) => {
		const upper = token.toUpperCase();
		if (upper === "DEFAULT" || upper === "ALL" || upper === "HIGH" || upper === "COMPLEMENTOFDEFAULT" || upper === "@STRENGTH" || upper === "@SECLEVEL=0") {
			return upper.startsWith("@") ? [] : tls12;
		}
		if (table.has(token)) return [table.get(token)];
		if (token.startsWith("TLS_")) return tls13.filter((c) => c.name === token);
		// A part of a name: "ECDHE", "AES128", "GCM", "RSA"
		return tls12.filter((c) => token.split("+").every((part) => c.name.split("-").includes(part)));
	};
	for (const raw of String(text).split(/[:,\s]+/).filter(Boolean)) {
		const remove = raw[0] === "!" || raw[0] === "-";
		const token = raw[0] === "!" || raw[0] === "-" || raw[0] === "+" ? raw.slice(1) : raw;
		const found = expand(token);
		if (remove) {
			for (const c of found) {
				const list = c.tls13 ? chosen13 : chosen12;
				const at = list.indexOf(c);
				if (at >= 0) list.splice(at, 1);
			}
			if (token.startsWith("TLS_")) sawTls13 = true;
			continue;
		}
		for (const c of found) {
			if (c.tls13) {
				sawTls13 = true;
				if (!chosen13.includes(c)) chosen13.push(c);
			} else if (!chosen12.includes(c)) chosen12.push(c);
		}
	}
	if (!chosen12.length && !sawTls13) throw Object.assign(new Error("error:0A0000B9:SSL routines::no cipher match"), { code: "ERR_SSL_NO_CIPHER_MATCH" });
	const final13 = sawTls13 ? chosen13 : TLS13_DEFAULT.map((name) => table.get(name)).filter(Boolean);
	const all = [...final13, ...chosen12];
	if (!all.length) throw Object.assign(new Error("error:0A0000B9:SSL routines::no cipher match"), { code: "ERR_SSL_NO_CIPHER_MATCH" });
	return all.map((c) => c.mbed).join("\n");
}

/* mbedTLS names cipher suites TLS-ECDHE-RSA-WITH-AES-128-GCM-SHA256; Node reports the OpenSSL name for TLS 1.2. */
function cipherNames(mbed, version) {
	const info = opensslCipherName(mbed);
	if (!info) {
		const standard = mbed.replace(/^TLS1-3-/, "TLS_").replace(/-/g, "_");
		return { name: standard, standardName: standard };
	}
	return { name: version === "TLSv1.3" ? info.standard : info.name, standardName: info.standard };
}
const authorizationCode = (flags, peer) => {
	if (!flags) return undefined;
	if (flags & 0x01) return "CERT_HAS_EXPIRED";
	if (flags & 0x200) return "CERT_NOT_YET_VALID";
	if (flags & 0x02) return "CERT_REVOKED";
	if (flags & 0x04) return "ERR_TLS_CERT_ALTNAME_INVALID";
	if (flags & 0x08) return peer && peer.length === 1 ? "DEPTH_ZERO_SELF_SIGNED_CERT" : "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
	return "UNABLE_TO_VERIFY_LEAF_SIGNATURE";
};
let rootCertificatesCache = null;
const rootCertificateList = () => {
	if (!rootCertificatesCache) {
		const blocks = String(native.caBundle()).match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
		rootCertificatesCache = Object.freeze(blocks);
	}
	return rootCertificatesCache;
};

/* The native errors are mbedTLS strings; give them the codes Node programs branch on. */
function withCode(err, host, port) {
	const error = toError(err);
	const text = String(error.message);
	if (!error.code) {
		if (text.includes("-0x0052")) error.code = "ENOTFOUND";
		else if (text.includes("-0x0044")) error.code = "ECONNREFUSED";
		else if (text.includes("-0x0050") || text.includes("-0x004E")) error.code = "ECONNRESET";
	}
	if (error.code === "ECONNREFUSED" && host !== undefined) {
		error.syscall = "connect";
		error.address = host;
		error.port = port;
		error.message = `connect ECONNREFUSED ${host}:${port}`;
	} else if (error.code === "ENOTFOUND" && host !== undefined) {
		error.syscall = "getaddrinfo";
		error.hostname = host;
		error.message = `getaddrinfo ENOTFOUND ${host}`;
	}
	return error;
}

/*
 * A Socket that is a real Duplex stream, as Node's is: 'data' and 'end' come from push(), backpressure from the
 * stream's own high-water marks (the poller stops reading when push() says the reader is behind, and starts again on
 * the next _read()), writes are queued until the host takes them, and end() half-closes the connection. Libraries
 * that treat a socket as a stream -- undici reads it with `socket.read()` -- see one.
 */

/* ------------------------------------------------ unix-domain sockets */

/*
 * Real AF_UNIX sockets where the system has them (every POSIX system, Windows 10 and later). Older Windows has
 * none, so there a "unix socket" is a loopback TCP listener and the socket path is an ordinary file that names its
 * port: programs written against this host reach each other the same way, though a program that is not one of
 * them cannot connect to it.
 */
const EMULATION_MARK = "graak-unix-socket 127.0.0.1 ";
let unixFs = null;

function unixListen(path, backlog) {
	try {
		return native.listenUnix(path, backlog);
	} catch (err) {
		if (err?.code !== "EAFNOSUPPORT" || !unixFs) throw err;
		if (unixFs.existsSync(path)) throw Object.assign(new Error(`listen EADDRINUSE: address already in use ${path}`), { code: "EADDRINUSE", syscall: "listen", address: path });
		const id = native.listen("127.0.0.1", 0, backlog);
		unixFs.writeFileSync(path, `${EMULATION_MARK}${native.address(id, false)[1]}`);
		return id;
	}
}

function unixConnect(path) {
	try {
		return native.connectUnix(path);
	} catch (err) {
		if (err?.code !== "EAFNOSUPPORT" || !unixFs) throw err;
		let text = "";
		try {
			text = String(unixFs.readFileSync(path, "utf8"));
		} catch {
			throw Object.assign(new Error(`connect ENOENT ${path}`), { code: "ENOENT", syscall: "connect", address: path });
		}
		if (!text.startsWith(EMULATION_MARK)) throw Object.assign(new Error(`connect ECONNREFUSED ${path}`), { code: "ECONNREFUSED", syscall: "connect", address: path });
		const id = native.connectStart("127.0.0.1", Number(text.slice(EMULATION_MARK.length)), false, false);
		for (let i = 0; i < 5000 && !native.connectStatus(id); i++) native.poll([id], 2, [id]);
		return id;
	}
}

function unixRemove(path) {
	try {
		unixFs?.unlinkSync(path);
	} catch {
		// Already gone.
	}
}

function createSocketClass(Duplex) {
	return class Socket extends Duplex {
		constructor(options = {}) {
			super({
				allowHalfOpen: Boolean(options.allowHalfOpen),
				readableHighWaterMark: options.readableHighWaterMark ?? 65536,
				writableHighWaterMark: options.writableHighWaterMark ?? 16384,
				emitClose: true,
				autoDestroy: true,
			});
			this.id = null;
			this.connecting = false;
			this.bytesRead = 0;
			this.bytesWritten = 0;
			this._queue = []; // { bytes, offset, callback } the socket could not take yet
			this._timeout = 0;
			this._timer = null;
			this._tls = false;
			this._readPaused = false;
			this._pendingWrite = null;
			this._addr = null;
			this._peer = null;
			if (options.handle !== undefined) this._adopt(options.handle);
		}

		/* Takes over a socket id the host already opened (an accepted connection, or one that finished connecting). */
		_adopt(id, tls = false) {
			this.id = id;
			this._tls = tls;
			this._readPaused = false;
			watch(id, () => this._readReady());
		}

		get readyState() {
			if (this.connecting) return "opening";
			if (this.destroyed) return "closed";
			return this.readable && this.writable ? "open" : this.readable ? "readOnly" : "writeOnly";
		}
		get pending() {
			return this.id === null;
		}
		get encrypted() {
			return this._tls;
		}
		get authorized() {
			const info = this._tlsDetails();
			return this._tls && info !== null && this._verifyFlags(info) === 0;
		}
		/* A caller-supplied checkServerIdentity that accepted the name also settles the host-name flag. */
		_verifyFlags(info) {
			return this._nameChecked ? info.verify & ~0x04 : info.verify;
		}
		get authorizationError() {
			const info = this._tlsDetails();
			return info && this._verifyFlags(info) ? authorizationCode(this._verifyFlags(info), info.peer) : undefined;
		}
		get alpnProtocol() {
			if (!this._tls) return undefined;
			return this._tlsDetails()?.alpn ?? false;
		}
		_tlsDetails() {
			if (!this._tls || this.id === null) return this._tlsInfo ?? null;
			if (!this._tlsInfo) {
				try {
					this._tlsInfo = native.tlsInfo(this.id);
				} catch {
					this._tlsInfo = null;
				}
			}
			return this._tlsInfo ?? null;
		}
		getProtocol() {
			return this._tls ? (this._tlsDetails()?.version ?? null) : null;
		}
		getCipher() {
			const info = this._tlsDetails();
			if (!info) return null;
			return { ...cipherNames(info.cipher, info.version), version: info.version };
		}
		getPeerCertificate(detailed) {
			const info = this._tlsDetails();
			const tools = cryptoTools();
			if (!info || !info.peer.length || !tools) return {};
			const build = (index) => {
				const cert = tools.legacyCertificate(native.x509Info(info.peer[index]), true);
				if (detailed && index + 1 < info.peer.length) cert.issuerCertificate = build(index + 1);
				else if (detailed) cert.issuerCertificate = cert;
				return cert;
			};
			return detailed ? build(0) : tools.legacyCertificate(native.x509Info(info.peer[0]), true);
		}
		getPeerX509Certificate() {
			const info = this._tlsDetails();
			const X509 = cryptoTools()?.X509Certificate;
			return info?.peer.length && X509 ? new X509(info.peer[0]) : undefined;
		}
		getX509Certificate() {
			return undefined;
		}
		/* The session, as opaque bytes for another connection's `session` option (Node hands out DER; this is the host's own format). */
		getSession() {
			if (!this._tls || this.id === null) return undefined;
			try {
				const bytes = native.tlsSession(this.id);
				return bytes ? Buffer.from(bytes) : undefined;
			} catch {
				return undefined;
			}
		}
		getTLSTicket() {
			return this.getSession();
		}
		isSessionReused() {
			if (!this._tls || this.id === null) return false;
			try {
				return Boolean(native.tlsInfo(this.id)?.reused);
			} catch {
				return false;
			}
		}
		/* 'session' is emitted when the server's session (TLS 1.2) or ticket (TLS 1.3) is available; tickets can arrive after the handshake. */
		_offerSession() {
			if (this.destroyed || !this._tls || this.id === null || this.listenerCount("session") === 0) return;
			const bytes = this.getSession();
			if (!bytes) return;
			if (this._lastSession && this._lastSession.equals(bytes)) return;
			this._lastSession = bytes;
			this.emit("session", bytes);
		}
		setSession() {}
		getEphemeralKeyInfo() {
			return {};
		}
		getFinished() {
			return undefined;
		}
		getPeerFinished() {
			return undefined;
		}
		setSession() {}
		setServername() {}
		setMaxSendFragment() {
			return true;
		}
		enableTrace() {}
		disableRenegotiation() {}
		/* Client-initiated renegotiation (TLS 1.2 only; 1.3 removed it): true when it was started, the callback says how it ended. */
		renegotiate(options, callback) {
			if (typeof options === "function") {
				callback = options;
				options = undefined;
			}
			const notify = (err) => {
				if (typeof callback === "function") queueMicrotask(() => callback(err ?? null));
			};
			if (!this._tls || this.id === null || this.destroyed) {
				const err = Object.assign(new Error("Attempt to renegotiate TLS session failed"), { code: "ERR_TLS_RENEGOTIATE" });
				if (typeof callback === "function") notify(err);
				else throw err;
				return false;
			}
			if (this._renegotiating) return true;
			let done;
			try {
				done = native.tlsRenegotiate(this.id);
			} catch (err) {
				if (typeof callback === "function") notify(err);
				else throw err;
				return false;
			}
			if (done) {
				notify(null);
				return true;
			}
			this._renegotiating = (err) => notify(err);
			return true;
		}
		_stepRenegotiate() {
			const finish = this._renegotiating;
			let done;
			try {
				done = native.tlsRenegotiate(this.id);
			} catch (err) {
				this._renegotiating = null;
				finish(err);
				return;
			}
			if (done) {
				this._renegotiating = null;
				finish(null);
			}
		}
		get bufferSize() {
			return this.writableLength;
		}
		_address(peer) {
			if (this.id === null) return null;
			try {
				return native.address(this.id, peer);
			} catch {
				return null;
			}
		}
		get remoteAddress() {
			return (this._peer ??= this._address(true))?.[0];
		}
		get remotePort() {
			return (this._peer ??= this._address(true))?.[1];
		}
		get remoteFamily() {
			return (this._peer ??= this._address(true))?.[2];
		}
		get localAddress() {
			return (this._addr ??= this._address(false))?.[0];
		}
		get localPort() {
			return (this._addr ??= this._address(false))?.[1];
		}
		get localFamily() {
			return (this._addr ??= this._address(false))?.[2];
		}
		address() {
			const a = this._address(false);
			return a ? { address: a[0], family: a[2], port: a[1] } : {};
		}
		get remoteAddress() {
			if (this._unixPath) return undefined;
			return (this._peer ??= this._address(true))?.[0];
		}

		connect(options, port, listener) {
			if (typeof options !== "object" || options === null) {
				// connect(port[, host][, listener])
				const host = typeof port === "string" ? port : undefined;
				listener = typeof port === "function" ? port : listener;
				options = { port: options, host };
			} else if (typeof port === "function") {
				listener = port;
			}
			let { host = "localhost", port: portNumber, tls = false } = options;
			// NODE_TLS_REJECT_UNAUTHORIZED=0 turns verification off for the whole process, as in Node.
			const rejectUnauthorized = options.rejectUnauthorized ?? globalThis.process?.env?.NODE_TLS_REJECT_UNAUTHORIZED !== "0";
			if (options.path) return this._connectUnix(options.path, listener);
			let tlsCfg;
			try {
				tlsCfg = tls ? tlsOptions(options) : undefined;
			} catch (err) {
				queueMicrotask(() => this.destroy(err));
				return this;
			}
			if (listener) this.once(tls ? "secureConnect" : "connect", listener);
			this.connecting = true;
			this._tls = tls;
			// Node's order: the caller attaches listeners on the returned socket before anything is emitted.
			queueMicrotask(() => {
				if (this.destroyed) return;
				const fail = (err) => {
					this.connecting = false;
					if (this.id !== null) {
						unwatch(this.id);
						unwatchWrite(this.id);
					}
					this.destroy(withCode(err, host, portNumber));
				};
				let id;
				try {
					id = native.connectStart(host, Number(portNumber), tls, tls && rejectUnauthorized === false, tlsCfg, tls && options.session ? toBytes(options.session) : undefined);
				} catch (err) {
					fail(err);
					return;
				}
				this.id = id;
				// The connection and the TLS handshake finish in the background; the poller says when to look.
				const startedAt = Date.now();
				const step = () => {
					if (this.destroyed) return;
					let done;
					try {
						done = native.connectStatus(id);
					} catch (err) {
						fail(err);
						return;
					}
					if (!done) {
						if (Date.now() - startedAt > 60000) fail(Object.assign(new Error(`connect ETIMEDOUT ${host}:${portNumber}`), { code: "ETIMEDOUT" }));
						return;
					}
					unwatch(id);
					unwatchWrite(id);
					this._adopt(id, tls);
					this.connecting = false;
					if (tls && tlsCfg.deferred) {
						// The caller supplied checkServerIdentity: the host verified the chain and left the name to it.
						const cert = this.getPeerCertificate();
						const failure = rejectUnauthorized === false ? undefined : options.checkServerIdentity(options.servername || host, cert);
						if (failure) {
							this.destroy(failure);
							return;
						}
						this._nameChecked = true;
					}
					this.emit("connect");
					if (tls) this.emit("secureConnect");
					this.emit("ready");
					if (tls) queueMicrotask(() => this._offerSession());
					const pending = this._pendingWrite;
					this._pendingWrite = null;
					if (pending) this._writeNow(pending.chunk, pending.callback);
				};
				watch(id, step);
				watchWrite(id, step);
				step();
			});
			return this;
		}

		/* A local (unix-domain) connection: the host connects at once, so this only has to announce it. */
		_connectUnix(path, listener) {
			if (listener) this.once("connect", listener);
			this.connecting = true;
			this._unixPath = path;
			queueMicrotask(() => {
				if (this.destroyed) return;
				let id;
				try {
					id = unixConnect(path);
				} catch (err) {
					this.connecting = false;
					this.destroy(toError(err));
					return;
				}
				this._adopt(id);
				this.connecting = false;
				this.emit("connect");
				this.emit("ready");
				const pending = this._pendingWrite;
				this._pendingWrite = null;
				if (pending) this._writeNow(pending.chunk, pending.callback);
			});
			return this;
		}

		/* A read the reader is ready for: the poller found data (or EOF) waiting. */
		_readReady() {
			if (this._renegotiating) this._stepRenegotiate();
			while (!this.destroyed && !this._readPaused && this.id !== null) {
				let chunk;
				try {
					chunk = native.read(this.id);
				} catch (err) {
					this.destroy(withCode(err));
					return;
				}
				if (chunk === null) {
					if (this._tls) this._offerSession();
					return;
				}
				if (chunk.length === 0) {
					unwatch(this.id);
					this.push(null);
					return;
				}
				this.bytesRead += chunk.length;
				this._resetTimer();
				const wantMore = this.push(typeof Buffer !== "undefined" ? Buffer.from(chunk) : chunk);
				if (!wantMore) {
					// The reader is behind: stop asking the host until it reads again.
					this._readPaused = true;
					unwatch(this.id);
					return;
				}
			}
		}

		_read() {
			if (this._readPaused && this.id !== null && !this.destroyed) {
				this._readPaused = false;
				watch(this.id, () => this._readReady());
			}
		}

		/* Bytes go to the host as it accepts them; the callback fires once this chunk has all been taken. */
		_write(chunk, encoding, callback) {
			if (this.id === null) {
				// Still connecting: held until it finishes.
				this._pendingWrite = { chunk, callback };
				return;
			}
			this._writeNow(chunk, callback);
		}

		_writeNow(chunk, callback) {
			this._queue.push({ bytes: chunk, offset: 0, callback });
			this._flush();
		}

		_flush() {
			while (this._queue.length && !this.destroyed && this.id !== null) {
				const item = this._queue[0];
				let sent;
				try {
					sent = native.send(this.id, item.bytes, item.offset);
				} catch (err) {
					const error = withCode(err);
					this._queue = [];
					item.callback(error);
					return;
				}
				if (sent === 0) {
					watchWrite(this.id, () => this._flush());
					return;
				}
				item.offset += sent;
				this.bytesWritten += sent;
				this._resetTimer();
				if (item.offset >= item.bytes.length) {
					this._queue.shift();
					item.callback();
				}
			}
			if (this.id !== null) unwatchWrite(this.id);
		}

		_final(callback) {
			const finish = () => {
				if (this.id !== null && !this.destroyed) {
					try {
						native.shutdown(this.id);
					} catch {
						// The peer is gone already; the read side notices.
					}
				}
				callback();
			};
			if (this._pendingWrite || this.connecting) {
				// Ending before the connection is up: shut down once it is.
				this.once("connect", finish);
				this.once("error", () => callback());
			} else finish();
			if (!this.allowHalfOpen && !this.destroyed) {
				// Do not linger on a peer that never closes its side.
				const t = startTimer(() => this.destroy(), 5000);
				this.once("close", () => stopTimer(t));
			}
		}

		_destroy(err, callback) {
			if (this._timer) stopTimer(this._timer);
			const id = this.id;
			this.id = null;
			const pending = this._queue;
			this._queue = [];
			if (id !== null) {
				unwatch(id);
				unwatchWrite(id);
				try {
					native.close(id);
				} catch {
					// Already closed.
				}
			}
			const stalled = this._pendingWrite;
			this._pendingWrite = null;
			for (const item of stalled ? [...pending, stalled] : pending) item.callback?.(err ?? new Error("Socket closed"));
			callback(err);
		}

		destroySoon() {
			if (this.writable) this.end();
			else this.destroy();
		}

		_resetTimer() {
			if (!this._timeout) return;
			if (this._timer) stopTimer(this._timer);
			this._timer = startTimer(() => {
				this._timer = null;
				this.emit("timeout");
			}, this._timeout);
		}
		setTimeout(ms, callback) {
			this._timeout = ms;
			if (callback) this.once("timeout", callback);
			if (this._timer) stopTimer(this._timer);
			this._timer = null;
			if (ms) this._resetTimer();
			return this;
		}
		setNoDelay() {
			// The native side already disables Nagle; accepted so callers do not have to branch.
			return this;
		}
		setKeepAlive() {
			return this;
		}
		ref() {
			return this;
		}
		unref() {
			return this;
		}
	};
}

function createServerClass(EventEmitter, Socket, tlsServer) {
	return class Server extends EventEmitter {
		constructor(options, listener) {
			super();
			if (typeof options === "function") {
				listener = options;
				options = {};
			}
			this._options = options ?? {};
			this._tls = tlsServer ? tlsOptions(this._options) : undefined;
			this.id = null;
			this.listening = false;
			this._connections = new Set();
			this.maxConnections = undefined;
			if (listener) this.on(tlsServer ? "secureConnection" : "connection", listener);
		}

		listen(...args) {
			let callback = typeof args[args.length - 1] === "function" ? args.pop() : undefined;
			let options = args[0];
			// listen(path[, backlog][, callback]): a string that is not a number is a unix-domain socket path.
			if (typeof options === "string" && Number.isNaN(Number(options))) options = { path: options, backlog: typeof args[1] === "number" ? args[1] : undefined };
			if (typeof options !== "object" || options === null) {
				const [port, second, third] = args;
				options = { port };
				if (typeof second === "string") options.host = second;
				else if (typeof second === "number") options.backlog = second;
				if (typeof third === "number") options.backlog = third;
				if (typeof second === "string" && typeof third === "number") options.backlog = third;
			}
			if (callback) this.once("listening", callback);
			if (options.path) {
				try {
					this.id = unixListen(options.path, options.backlog ?? 511);
				} catch (err) {
					const error = toError(err);
					queueMicrotask(() => this.emit("error", error));
					return this;
				}
				this._unixPath = options.path;
				this.listening = true;
				watch(this.id, () => this._accept());
				queueMicrotask(() => this.emit("listening"));
				return this;
			}
			const port = options.port === undefined || options.port === null ? 0 : Number(options.port);
			try {
				this.id = native.listen(
					options.host ?? null,
					port,
					options.backlog ?? 511,
					tlsServer ? this._tls.cert : undefined,
					tlsServer ? this._tls.key : undefined,
					tlsServer ? this._tls : undefined
				);
			} catch (err) {
				const error = toError(err);
				if (/-0x0046|-0x004[0-9A-F]/i.test(String(error.message))) error.code = "EADDRINUSE";
				queueMicrotask(() => this.emit("error", error));
				return this;
			}
			this.listening = true;
			watch(this.id, () => this._accept());
			queueMicrotask(() => this.emit("listening"));
			return this;
		}

		_accept() {
			for (;;) {
				let sid;
				try {
					sid = native.accept(this.id);
				} catch (err) {
					this.emit("error", toError(err));
					return;
				}
				if (sid === null) return;
				const socket = new Socket();
				if (this.maxConnections !== undefined && this._connections.size >= this.maxConnections) {
					native.close(sid);
					continue;
				}
				if (tlsServer) {
					this._handshake(sid, socket);
					continue;
				}
				socket._adopt(sid, false);
				this._track(socket);
				this.emit("connection", socket);
			}
		}

		_track(socket) {
			this._connections.add(socket);
			socket.once("close", () => {
				this._connections.delete(socket);
				this._maybeClosed();
			});
		}

		/* A TLS connection is announced once its handshake is done, as Node does, so ALPN and the client certificate are known. */
		_handshake(sid, socket) {
			const startedAt = Date.now();
			const timeout = this._options.handshakeTimeout ?? 120000;
			const abort = (err) => {
				unwatch(sid);
				try {
					native.close(sid);
				} catch {}
				socket.id = null;
				this.emit("tlsClientError", err, socket);
			};
			const step = () => {
				let done;
				try {
					done = native.connectStatus(sid);
				} catch (err) {
					abort(withCode(err));
					return;
				}
				if (!done) {
					if (Date.now() - startedAt > timeout) abort(Object.assign(new Error("TLS handshake timeout"), { code: "ERR_TLS_HANDSHAKE_TIMEOUT" }));
					return;
				}
				unwatch(sid);
				socket._adopt(sid, true);
				this._track(socket);
				this.emit("connection", socket);
				this.emit("secureConnection", socket);
			};
			watch(sid, step);
			step();
		}

		address() {
			if (this.id === null) return null;
			if (this._unixPath) return this._unixPath;
			const a = native.address(this.id, false);
			return a ? { port: a[1], family: a[2], address: a[0] } : null;
		}

		_maybeClosed() {
			if (this._closing && !this._connections.size && !this._closedEmitted) {
				this._closedEmitted = true;
				queueMicrotask(() => this.emit("close"));
			}
		}

		close(callback) {
			if (callback) this.once("close", callback);
			if (this.id !== null) {
				unwatch(this.id);
				try {
					native.close(this.id);
				} catch {
					// Already closed.
				}
				this.id = null;
			}
			if (this._unixPath) {
				unixRemove(this._unixPath);
				this._unixPath = null;
			}
			this.listening = false;
			this._closing = true;
			this._maybeClosed();
			return this;
		}

		closeAllConnections() {
			for (const socket of [...this._connections]) socket.destroy();
		}
		getConnections(callback) {
			queueMicrotask(() => callback(null, this._connections.size));
			return this;
		}
		ref() {
			return this;
		}
		unref() {
			return this;
		}
	};
}


/* ------------------------------------------------ dgram */

function createDgram(EventEmitter) {
	class Socket extends EventEmitter {
		constructor(options, listener) {
			super();
			const type = typeof options === "string" ? options : options?.type;
			if (type !== "udp4" && type !== "udp6") {
				throw Object.assign(new TypeError(`Bad socket type specified. Valid types are: udp4, udp6`), { code: "ERR_SOCKET_BAD_TYPE" });
			}
			this.type = type;
			this._options = typeof options === "object" ? options : {};
			this.id = null;
			this._bound = false;
			this._binding = false;
			this._closed = false;
			this._sends = [];
			this._connected = null;
			if (listener) this.on("message", listener);
		}

		_family() {
			return this.type === "udp6" ? "IPv6" : "IPv4";
		}

		bind(port, address, callback) {
			if (this._bound || this._binding) throw Object.assign(new Error("Socket is already bound"), { code: "ERR_SOCKET_ALREADY_BOUND" });
			if (typeof port === "object" && port !== null) {
				callback = typeof address === "function" ? address : callback;
				address = port.address;
				port = port.port;
			} else if (typeof port === "function") {
				callback = port;
				port = 0;
				address = undefined;
			} else if (typeof address === "function") {
				callback = address;
				address = undefined;
			}
			if (callback) this.once("listening", callback);
			this._binding = true;
			const host = address ?? (this.type === "udp6" ? "::" : "0.0.0.0");
			try {
				this.id = native.udpBind(host, Number(port ?? 0));
			} catch (err) {
				this._binding = false;
				const error = toError(err);
				queueMicrotask(() => this.emit("error", error));
				return this;
			}
			this._binding = false;
			this._bound = true;
			watch(this.id, () => this._receive());
			queueMicrotask(() => this.emit("listening"));
			return this;
		}

		_receive() {
			while (this.id !== null) {
				let got;
				try {
					got = native.udpRecv(this.id, this._options.recvBufferSize ? 65535 : 65535);
				} catch (err) {
					this.emit("error", toError(err));
					return;
				}
				if (got === null) return;
				const [bytes, address, port, family] = got;
				this.emit("message", typeof Buffer !== "undefined" ? Buffer.from(bytes) : bytes, { address, family, port, size: bytes.length });
			}
		}

		send(msg, offset, length, port, address, callback) {
			if (this._closed) throw Object.assign(new Error("Not running"), { code: "ERR_SOCKET_DGRAM_NOT_RUNNING" });
			if (Array.isArray(msg)) msg = typeof Buffer !== "undefined" ? Buffer.concat(msg.map((m) => Buffer.from(m))) : msg;
			const bytes = toBytes(msg);
			// send(msg, port[, address][, callback]) and send(msg, offset, length, port[, address][, callback])
			if (typeof offset === "number" && typeof length !== "number" || typeof length === "function" || typeof length === "string" || length === undefined) {
				callback = typeof port === "function" ? port : typeof address === "function" ? address : callback;
				if (typeof length === "function") callback = length;
				const dest = typeof length === "string" ? length : typeof port === "string" ? port : typeof address === "string" ? address : undefined;
				port = offset ?? this._connected?.port;
				address = dest ?? this._connected?.address;
				offset = 0;
				length = bytes.length;
			} else if (typeof address === "function") {
				callback = address;
				address = undefined;
			}
			address = address ?? this._connected?.address ?? (this.type === "udp6" ? "::1" : "127.0.0.1");
			port = port ?? this._connected?.port;
			if (!this._bound && !this._binding) this.bind(0);
			const job = { bytes, offset, length, port: Number(port), address, callback };
			this._sends.push(job);
			this._flush();
		}

		_flush() {
			while (this._sends.length && this.id !== null) {
				const job = this._sends[0];
				let sent;
				try {
					sent = native.udpSend(this.id, job.bytes, job.offset, job.length, job.address, job.port);
				} catch (err) {
					this._sends.shift();
					const error = toError(err);
					if (job.callback) job.callback(error);
					else this.emit("error", error);
					continue;
				}
				if (sent < 0) {
					watchWrite(this.id, () => this._flush());
					return;
				}
				this._sends.shift();
				if (job.callback) queueMicrotask(() => job.callback(null, sent));
			}
			if (this.id !== null) unwatchWrite(this.id);
		}

		connect(port, address, callback) {
			if (typeof address === "function") {
				callback = address;
				address = undefined;
			}
			this._connected = { port: Number(port), address: address ?? (this.type === "udp6" ? "::1" : "127.0.0.1") };
			if (!this._bound) this.bind(0);
			if (callback) this.once("connect", callback);
			queueMicrotask(() => this.emit("connect"));
		}
		disconnect() {
			this._connected = null;
		}
		remoteAddress() {
			if (!this._connected) throw Object.assign(new Error("Not connected"), { code: "ERR_SOCKET_DGRAM_NOT_CONNECTED" });
			return { address: this._connected.address, family: this._family(), port: this._connected.port };
		}

		address() {
			if (this.id === null) throw Object.assign(new Error("getsockname EBADF"), { code: "EBADF" });
			const a = native.address(this.id, false);
			return { address: a[0], family: a[2], port: a[1] };
		}

		close(callback) {
			if (this._closed) return this;
			this._closed = true;
			if (callback) this.once("close", callback);
			if (this.id !== null) {
				unwatch(this.id);
				unwatchWrite(this.id);
				try {
					native.close(this.id);
				} catch {
					// Already closed.
				}
				this.id = null;
			}
			queueMicrotask(() => this.emit("close"));
			return this;
		}

		_option(name, value, extra) {
			if (this.id === null) throw Object.assign(new Error(`${name} EBADF`), { code: "EBADF" });
			native.udpOption(this.id, name, value, extra);
		}
		setBroadcast(flag) {
			this._option("broadcast", flag ? 1 : 0);
		}
		setTTL(ttl) {
			this._option("ttl", ttl);
			return ttl;
		}
		setMulticastTTL(ttl) {
			this._option("multicastTtl", ttl);
			return ttl;
		}
		setMulticastLoopback(flag) {
			this._option("multicastLoopback", flag ? 1 : 0);
			return flag;
		}
		addMembership(group, iface) {
			this._option("addMembership", group, iface);
		}
		dropMembership(group, iface) {
			this._option("dropMembership", group, iface);
		}
		setRecvBufferSize(size) {
			this._option("recvBufferSize", size);
		}
		setSendBufferSize(size) {
			this._option("sendBufferSize", size);
		}
		getRecvBufferSize() {
			return 212992;
		}
		getSendBufferSize() {
			return 212992;
		}
		ref() {
			return this;
		}
		unref() {
			return this;
		}
		[Symbol.asyncDispose]() {
			return new Promise((resolve) => this.close(resolve));
		}
	}

	return { createSocket: (options, listener) => new Socket(options, listener), Socket };
}

function createNetModules(EventEmitter, Duplex, options = {}) {
	unixFs = options.fs ?? unixFs;
	cryptoTools = options.cryptoTools ?? cryptoTools;
	const Socket = createSocketClass(Duplex);
	const Server = createServerClass(EventEmitter, Socket, false);
	const TlsServer = createServerClass(EventEmitter, Socket, true);

	const connect = (...args) => {
		// net.connect(path[, listener])
		if (typeof args[0] === "string" && Number.isNaN(Number(args[0]))) args[0] = { path: args[0] };
		const socket = new Socket();
		// Returned synchronously, like Node: callers attach listeners before it is connected.
		socket.connect(...args);
		return socket;
	};

	const isIPv4 = (value) => /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/.test(value);
	// The grammar of Node.js's own isIPv6 (lib/internal/net.js): eight groups, one "::" and an optional dotted IPv4 tail,
	// then an optional zone id. Written out rather than approximated by a character class, so what it accepts is what Node accepts.
	const v4Seg = "(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])";
	const v4Str = `(?:${v4Seg}\\.){3}${v4Seg}`;
	const v6Seg = "(?:[0-9a-fA-F]{1,4})";
	const IPv6Reg = new RegExp(
		"^(?:" +
			`(?:${v6Seg}:){7}(?:${v6Seg}|:)|` +
			`(?:${v6Seg}:){6}(?:${v4Str}|:${v6Seg}|:)|` +
			`(?:${v6Seg}:){5}(?::${v4Str}|(?::${v6Seg}){1,2}|:)|` +
			`(?:${v6Seg}:){4}(?:(?::${v6Seg}){0,1}:${v4Str}|(?::${v6Seg}){1,3}|:)|` +
			`(?:${v6Seg}:){3}(?:(?::${v6Seg}){0,2}:${v4Str}|(?::${v6Seg}){1,4}|:)|` +
			`(?:${v6Seg}:){2}(?:(?::${v6Seg}){0,3}:${v4Str}|(?::${v6Seg}){1,5}|:)|` +
			`(?:${v6Seg}:){1}(?:(?::${v6Seg}){0,4}:${v4Str}|(?::${v6Seg}){1,6}|:)|` +
			`(?::(?:(?::${v6Seg}){0,5}:${v4Str}|(?::${v6Seg}){1,7}|:))` +
			")(?:%[0-9a-zA-Z-.:]{1,})?$"
	);
	const isIPv6 = (value) => typeof value === "string" && IPv6Reg.test(value);
	const net = {
		Socket,
		Server,
		connect,
		createConnection: connect,
		createServer: (options, listener) => new Server(options, listener),
		isIP: (value) => (isIPv4(String(value)) ? 4 : isIPv6(String(value)) ? 6 : 0),
		isIPv4: (value) => isIPv4(String(value)),
		isIPv6: (value) => isIPv6(String(value)),
		setDefaultAutoSelectFamily() {},
		getDefaultAutoSelectFamily: () => false,
	};

	const tls = {
		Server: TlsServer,
		TLSSocket: Socket,
		connect(options, port, listener) {
			// Options that cannot work are refused here, where the caller can catch it, as Node's secure context does.
			if (options && typeof options === "object") tlsOptions(options);
			if (typeof options !== "object" || options === null) {
				// connect(port[, host][, options][, listener])
				const host = typeof port === "string" ? port : undefined;
				return connect({ port: options, host: host ?? "localhost", tls: true }, undefined, listener);
			}
			return connect({ ...options, host: options.host ?? options.servername ?? "localhost", tls: true }, port, listener);
		},
		createServer(options, listener) {
			if (typeof options === "function") {
				listener = options;
				options = {};
			}
			const merged = { ...(options?.secureContext?._options ?? {}), ...options };
			if ((!merged.key || !merged.cert) && merged.pfx === undefined) {
				throw new TypeError("tls.createServer needs { key, cert } as PEM strings or Buffers, or a pfx");
			}
			return new TlsServer(options, listener);
		},
		createSecureContext(options = {}) {
			tlsOptions(options);
			return { context: {}, _options: { ...options } };
		},
		checkServerIdentity: (hostname, cert) => cryptoTools()?.checkServerIdentity(hostname, cert),
		getCiphers: () => [...cipherTableOf().keys()].map((name) => name.toLowerCase()).sort(),
		// Certificates are verified against the CA bundle compiled into the host, which is exactly
		// why this works on an old machine whose own certificate store is years stale.
		get rootCertificates() {
			return rootCertificateList();
		},
		DEFAULT_ECDH_CURVE: "auto",
		DEFAULT_CIPHERS: "TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-AES256-GCM-SHA384:DHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-SHA256:DHE-RSA-AES128-SHA256:ECDHE-RSA-AES256-SHA384:DHE-RSA-AES256-SHA384:ECDHE-RSA-AES256-SHA256:DHE-RSA-AES256-SHA256:HIGH:!aNULL:!eNULL:!EXPORT:!DES:!RC4:!MD5:!PSK:!SRP:!CAMELLIA",
		DEFAULT_MIN_VERSION: "TLSv1.2",
		DEFAULT_MAX_VERSION: "TLSv1.3",
	};

	return { net, tls, dgram: createDgram(EventEmitter) };
}

export { zlib, createNetModules, createSocketClass, toBytes };
