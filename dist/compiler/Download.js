"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadToFile = downloadToFile;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_stream_1 = require("node:stream");
const promises_1 = require("node:stream/promises");
const structures_1 = require("../structures");
/**
 * Downloads `url` into `file` and returns the SHA-256 of what was written.
 *
 * The body is streamed: hashed and counted as it arrives, written to a private temporary file beside `file`, and moved
 * into place only once it is complete and (when a checksum is given) matches. A response is never held whole in memory,
 * a half-finished or oversized or wrong download is never left at `file`, and nobody can see `file` until it is verified.
 */
async function downloadToFile(url, file, options) {
    const response = await fetch(url);
    if (!response.ok || !response.body) {
        throw new structures_1.RuntimeError(`Download failed (${response.status}) for ${url}`);
    }
    const declared = Number(response.headers.get("content-length") ?? 0);
    if (declared > options.maxBytes) {
        throw new structures_1.RuntimeError(`${url} is ${declared} bytes, over the ${options.maxBytes} byte limit`);
    }
    const hash = (0, node_crypto_1.createHash)("sha256");
    let received = 0;
    const tap = new node_stream_1.Transform({
        transform(chunk, _encoding, done) {
            received += chunk.length;
            if (received > options.maxBytes) {
                done(new structures_1.RuntimeError(`${url} is larger than the ${options.maxBytes} byte limit`));
                return;
            }
            hash.update(chunk);
            done(null, chunk);
        },
    });
    const partial = `${file}.${process.pid}.${(0, node_crypto_1.randomBytes)(6).toString("hex")}.part`;
    try {
        // "wx": never write through a file or link that is already there.
        await (0, promises_1.pipeline)(node_stream_1.Readable.fromWeb(response.body), tap, (0, node_fs_1.createWriteStream)(partial, { flags: "wx", mode: 0o600 }));
        const actual = hash.digest("hex");
        if (options.sha256 !== undefined && actual !== options.sha256.toLowerCase()) {
            throw new structures_1.RuntimeError(`Checksum mismatch for ${url}: expected ${options.sha256}, got ${actual}`);
        }
        (0, node_fs_1.renameSync)(partial, file);
        return actual;
    }
    catch (error) {
        (0, node_fs_1.rmSync)(partial, { force: true });
        throw error;
    }
}
//# sourceMappingURL=Download.js.map