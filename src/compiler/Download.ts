import { createHash, randomBytes } from "node:crypto";
import { createWriteStream, renameSync, rmSync } from "node:fs";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { RuntimeError } from "../structures";

export interface DownloadOptions {
	/** Largest body accepted. The transfer stops, and nothing is kept, the moment it is exceeded. */
	maxBytes: number;
	/** The SHA-256 the body must have. A body that differs is deleted and the download fails. */
	sha256?: string;
}

/**
 * Downloads `url` into `file` and returns the SHA-256 of what was written.
 *
 * The body is streamed: hashed and counted as it arrives, written to a private temporary file beside `file`, and moved
 * into place only once it is complete and (when a checksum is given) matches. A response is never held whole in memory,
 * a half-finished or oversized or wrong download is never left at `file`, and nobody can see `file` until it is verified.
 */
export async function downloadToFile(url: string, file: string, options: DownloadOptions): Promise<string> {
	const response = await fetch(url);
	if (!response.ok || !response.body) {
		throw new RuntimeError(`Download failed (${response.status}) for ${url}`);
	}
	const declared = Number(response.headers.get("content-length") ?? 0);
	if (declared > options.maxBytes) {
		throw new RuntimeError(`${url} is ${declared} bytes, over the ${options.maxBytes} byte limit`);
	}

	const hash = createHash("sha256");
	let received = 0;
	const tap = new Transform({
		transform(chunk: Buffer, _encoding, done) {
			received += chunk.length;
			if (received > options.maxBytes) {
				done(new RuntimeError(`${url} is larger than the ${options.maxBytes} byte limit`));
				return;
			}
			hash.update(chunk);
			done(null, chunk);
		},
	});

	const partial = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.part`;
	try {
		// "wx": never write through a file or link that is already there.
		await pipeline(
			Readable.fromWeb(response.body as unknown as WebReadableStream),
			tap,
			createWriteStream(partial, { flags: "wx", mode: 0o600 })
		);
		const actual = hash.digest("hex");
		if (options.sha256 !== undefined && actual !== options.sha256.toLowerCase()) {
			throw new RuntimeError(`Checksum mismatch for ${url}: expected ${options.sha256}, got ${actual}`);
		}
		renameSync(partial, file);
		return actual;
	} catch (error) {
		rmSync(partial, { force: true });
		throw error;
	}
}
