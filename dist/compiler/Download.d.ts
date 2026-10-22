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
export declare function downloadToFile(url: string, file: string, options: DownloadOptions): Promise<string>;
//# sourceMappingURL=Download.d.ts.map