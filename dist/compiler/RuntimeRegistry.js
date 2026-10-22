"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeRegistry = void 0;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const node_zlib_1 = require("node:zlib");
const structures_1 = require("../structures");
const NodeRuntime_1 = require("./NodeRuntime");
const ProjectCollector_1 = require("./ProjectCollector");
const SHA256_RE = /^[0-9a-f]{64}$/i;
/** A registered version becomes a directory name in the cache: no separators, nothing that starts with a dot. */
const SAFE_VERSION_RE = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/;
/**
 * A manifest is data, often checked into a project by someone else, and its fields end up in a cache path and a download
 * URL. An entry that does not look exactly like one `add()` would have written is refused, not repaired.
 */
function parseEntry(raw, path) {
    const fail = (why) => {
        throw new structures_1.GraakError(`Malformed runtime registry entry in ${path}: ${why}`);
    };
    if (!raw || typeof raw !== "object")
        return fail("not an object");
    const e = raw;
    const target = typeof e.target === "string" ? (0, structures_1.parseTargetDevice)(e.target) : null;
    if (!target)
        return fail(`unknown target '${String(e.target)}'`);
    if (typeof e.version !== "string" || !SAFE_VERSION_RE.test(e.version))
        return fail(`unusable version '${String(e.version)}'`);
    if (typeof e.sha256 !== "string" || !SHA256_RE.test(e.sha256))
        return fail("sha256 is not a 64 character hex digest");
    let url;
    try {
        url = new URL(String(e.url));
    }
    catch {
        return fail("url is not a URL");
    }
    if (url.protocol !== "https:")
        return fail("url must use https://");
    return {
        target,
        version: e.version,
        url: url.href,
        sha256: e.sha256.toLowerCase(),
        notes: typeof e.notes === "string" ? e.notes : undefined,
        addedAt: typeof e.addedAt === "string" ? e.addedAt : "",
    };
}
function projectManifestPath(root) {
    return (0, node_path_1.join)(root, ".graak", "runtimes.json");
}
function globalManifestPath() {
    return (0, node_path_1.join)(NodeRuntime_1.NodeRuntime.cacheDir(), "runtimes.json");
}
function readManifest(path) {
    if (!(0, node_fs_1.existsSync)(path))
        return [];
    let data;
    try {
        data = JSON.parse((0, node_fs_1.readFileSync)(path, "utf-8"));
    }
    catch {
        throw new structures_1.GraakError(`Malformed runtime registry: ${path}`);
    }
    const runtimes = data?.runtimes;
    return Array.isArray(runtimes) ? runtimes.map((entry) => parseEntry(entry, path)) : [];
}
function writeManifest(path, entries) {
    (0, node_fs_1.mkdirSync)((0, node_path_1.dirname)(path), { recursive: true });
    (0, node_fs_1.writeFileSync)(path, `${JSON.stringify({ runtimes: entries }, null, "\t")}\n`, "utf-8");
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
class RuntimeRegistry {
    static list(root = process.cwd()) {
        return [...readManifest(projectManifestPath(root)), ...readManifest(globalManifestPath())];
    }
    static find(target, root = process.cwd()) {
        return RuntimeRegistry.list(root)
            .filter((e) => e.target === target)
            .sort((a, b) => (0, ProjectCollector_1.compareVersions)(b.version, a.version));
    }
    static add(entry, opts = {}) {
        const target = (0, structures_1.parseTargetDevice)(entry.target);
        if (!target)
            throw new structures_1.GraakError(`Unknown target '${entry.target}'`);
        if (!SHA256_RE.test(entry.sha256)) {
            throw new structures_1.GraakError("--sha256 must be a 64 character hex SHA-256 digest of the exact file at --url; " +
                "Graak never downloads a community runtime without one");
        }
        if (!/^https:\/\//i.test(entry.url)) {
            throw new structures_1.GraakError("Runtime URLs must use https://");
        }
        const path = opts.global ? globalManifestPath() : projectManifestPath(opts.root ?? process.cwd());
        const entries = readManifest(path).filter((e) => !(e.target === target && e.version === entry.version));
        entries.push({
            ...entry,
            target,
            sha256: entry.sha256.toLowerCase(),
            addedAt: new Date().toISOString(),
        });
        writeManifest(path, entries);
    }
    static remove(target, version, opts = {}) {
        const path = opts.global ? globalManifestPath() : projectManifestPath(opts.root ?? process.cwd());
        const entries = readManifest(path);
        const next = entries.filter((e) => !(e.target === target && e.version === version));
        if (next.length === entries.length)
            return false;
        writeManifest(path, next);
        return true;
    }
    /**
     * Downloads (once, cached thereafter) and SHA-256-verifies a registered runtime. Refuses
     * to return a binary whose checksum does not match, even though the URL was trusted at
     * registration time — the remote file may have changed since.
     */
    static async ensure(entry) {
        const isWindows = entry.target.startsWith("win-");
        const dir = (0, node_path_1.join)(NodeRuntime_1.NodeRuntime.cacheDir(), "community", entry.target, entry.version);
        const binary = (0, node_path_1.join)(dir, isWindows ? "node.exe" : "node");
        if ((0, node_fs_1.existsSync)(binary))
            return binary;
        const res = await fetch(entry.url);
        if (!res.ok)
            throw new structures_1.RuntimeError(`Download failed (${res.status}) for ${entry.url}`);
        const download = Buffer.from(await res.arrayBuffer());
        const actual = (0, node_crypto_1.createHash)("sha256").update(download).digest("hex");
        if (actual !== entry.sha256.toLowerCase()) {
            throw new structures_1.RuntimeError(`Checksum mismatch for ${entry.url}: expected ${entry.sha256}, got ${actual}. ` +
                "Refusing to use this binary; verify the URL and re-register it with the correct --sha256.");
        }
        const content = RuntimeRegistry.extract(download, entry.url);
        (0, node_fs_1.mkdirSync)(dir, { recursive: true });
        const tmp = `${binary}.${process.pid}.tmp`;
        (0, node_fs_1.writeFileSync)(tmp, content);
        if (!isWindows)
            (0, node_fs_1.chmodSync)(tmp, 0o755);
        (0, node_fs_1.renameSync)(tmp, binary);
        return binary;
    }
    static extract(download, url) {
        const lower = url.toLowerCase();
        if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz"))
            return RuntimeRegistry.extractFromTarGz(download);
        if (lower.endsWith(".zip"))
            return RuntimeRegistry.extractFromZip(download);
        return download;
    }
    /** Finds the `node` (or `bin/node`) entry in a gzipped tar archive. */
    static extractFromTarGz(archive) {
        const tar = (0, node_zlib_1.gunzipSync)(archive);
        const candidates = [];
        let offset = 0;
        let longName = null;
        while (offset + 512 <= tar.length) {
            const header = tar.subarray(offset, offset + 512);
            if (header.every((b) => b === 0))
                break;
            const field = (start, len) => header.toString("utf-8", start, start + len).replace(/\0.*$/s, "");
            const size = Number.parseInt(field(124, 12).trim() || "0", 8);
            const type = field(156, 1);
            const prefix = field(345, 155);
            let name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
            longName = null;
            const dataStart = offset + 512;
            const data = tar.subarray(dataStart, dataStart + size);
            offset = dataStart + Math.ceil(size / 512) * 512;
            if (type === "L") {
                longName = data.toString("utf-8").replace(/\0.*$/s, "");
                continue;
            }
            if (type === "x") {
                const path = /\d+ path=([^\n]*)\n/.exec(data.toString("utf-8"));
                if (path)
                    longName = path[1];
                continue;
            }
            name = name.replace(/^\.\//, "");
            if ((type === "0" || type === "") && /(^|\/)node(\.exe)?$/.test(name)) {
                candidates.push({ name, data: Buffer.from(data) });
            }
        }
        const best = candidates.sort((a, b) => a.name.length - b.name.length)[0];
        if (!best)
            throw new structures_1.RuntimeError("No 'node' executable found in the downloaded .tar.gz archive");
        return best.data;
    }
    /** Finds the `node.exe` (or `node`) entry in a ZIP archive (stored or deflated). */
    static extractFromZip(archive) {
        let eocd = -1;
        for (let i = archive.length - 22; i >= 0; i--) {
            if (archive.readUInt32LE(i) === 0x06054b50) {
                eocd = i;
                break;
            }
        }
        if (eocd === -1)
            throw new structures_1.RuntimeError("Not a valid ZIP archive");
        const entryCount = archive.readUInt16LE(eocd + 10);
        let cdOffset = archive.readUInt32LE(eocd + 16);
        const candidates = [];
        for (let i = 0; i < entryCount; i++) {
            if (cdOffset + 46 > archive.length || archive.readUInt32LE(cdOffset) !== 0x02014b50)
                break;
            const method = archive.readUInt16LE(cdOffset + 10);
            const compSize = archive.readUInt32LE(cdOffset + 20);
            const nameLen = archive.readUInt16LE(cdOffset + 28);
            const extraLen = archive.readUInt16LE(cdOffset + 30);
            const commentLen = archive.readUInt16LE(cdOffset + 32);
            const localOffset = archive.readUInt32LE(cdOffset + 42);
            const name = archive.toString("utf-8", cdOffset + 46, cdOffset + 46 + nameLen);
            cdOffset += 46 + nameLen + extraLen + commentLen;
            if (!/(^|[/\\])node(\.exe)?$/i.test(name))
                continue;
            const lfNameLen = archive.readUInt16LE(localOffset + 26);
            const lfExtraLen = archive.readUInt16LE(localOffset + 28);
            const dataStart = localOffset + 30 + lfNameLen + lfExtraLen;
            const raw = archive.subarray(dataStart, dataStart + compSize);
            const data = method === 0 ? Buffer.from(raw) : method === 8 ? (0, node_zlib_1.inflateRawSync)(raw) : null;
            if (data)
                candidates.push({ name, data });
        }
        const best = candidates.sort((a, b) => a.name.length - b.name.length)[0];
        if (!best)
            throw new structures_1.RuntimeError("No 'node'/'node.exe' executable found in the downloaded .zip archive");
        return best.data;
    }
}
exports.RuntimeRegistry = RuntimeRegistry;
//# sourceMappingURL=RuntimeRegistry.js.map