import { type TargetDevice } from "../structures";
export interface CommunityRuntimeEntry {
    target: TargetDevice;
    version: string;
    url: string;
    sha256: string;
    notes?: string;
    addedAt: string;
}
/**
 * User-managed registry of community Node.js runtimes for targets with no official build
 * (Windows 7 / Vista, 32-bit Linux, FreeBSD, iSH). Graak does not ship any entries of
 * its own: it has no way to verify a third-party binary's authenticity ahead of time, so
 * trust is established once, explicitly, by whoever registers an entry — every entry is
 * pinned to an exact SHA-256 and re-verified on every download.
 *
 * Two manifests are consulted: `<project>/.graak/runtimes.json` (project-local, checked
 * into the bot's repo so a team shares the same pinned runtime) and `<cache>/runtimes.json`
 * (global, `--global` on the CLI). Project entries are tried first.
 */
export declare class RuntimeRegistry {
    static list(root?: string): CommunityRuntimeEntry[];
    static find(target: TargetDevice, root?: string): CommunityRuntimeEntry[];
    static add(entry: Omit<CommunityRuntimeEntry, "addedAt">, opts?: {
        global?: boolean;
        root?: string;
    }): void;
    static remove(target: string, version: string, opts?: {
        global?: boolean;
        root?: string;
    }): boolean;
    /**
     * Downloads (once, cached thereafter) and SHA-256-verifies a registered runtime. Refuses
     * to return a binary whose checksum does not match, even though the URL was trusted at
     * registration time — the remote file may have changed since.
     */
    static ensure(entry: CommunityRuntimeEntry): Promise<string>;
    private static isArchive;
    private static extract;
    /** Finds the `node` (or `bin/node`) entry in a gzipped tar archive. */
    private static extractFromTarGz;
    /** Finds the `node.exe` (or `node`) entry in a ZIP archive (stored or deflated). */
    private static extractFromZip;
}
//# sourceMappingURL=RuntimeRegistry.d.ts.map