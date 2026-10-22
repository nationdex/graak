/** Node.js >= 20.12 is required for SEA assets (`sea.getAsset`). */
export declare const MIN_SEA_NODE_VERSION = "20.12.0";
export declare const SEA_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
export declare class NodeRuntime {
    static cacheDir(): string;
    /** index.json key of an official runtime that runs on this host. */
    static hostFileKey(): string | null;
    static canRunOnHost(target: unknown): boolean;
    /**
     * Reads the Node.js version embedded in a runtime binary. The binary is only read, never run: it may be a file the
     * user pointed at, or one built for another platform, and running it to ask its version is not worth either risk.
     */
    static readVersion(binaryPath: string): string | null;
    /** "absent" | "ready" (fuse unflipped) | "injected" (already a SEA). */
    static seaFuseState(binary: Buffer): "absent" | "ready" | "injected";
    private static fetchBuffer;
    /**
     * Picks the newest official release that ships `fileKey` and satisfies `minNode`.
     * `requested` may be a full version ("22.11.0") or a major ("22").
     */
    static resolveOfficialVersion(fileKey: string, requested?: string | null, minNode?: string | null): Promise<string>;
    /**
     * Downloads (once) and verifies an official Node.js runtime, returning the binary path.
     */
    static ensureOfficial(version: string, fileKey: string): Promise<string>;
    static extractFromTarGz(archive: Buffer, wanted: string): Buffer;
}
//# sourceMappingURL=NodeRuntime.d.ts.map