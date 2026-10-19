"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BinaryInspector = void 0;
const node_fs_1 = require("node:fs");
const structures_1 = require("../structures");
const ELF_MACHINES = {
    3: "x86",
    62: "x64",
    40: "armv7",
    183: "arm64",
};
const PE_MACHINES = {
    332: "x86",
    34404: "x64",
    452: "armv7",
    43620: "arm64",
};
const MACHO_CPUS = {
    7: "x86",
    16777223: "x64",
    12: "armv7",
    16777228: "arm64",
};
const HEADER_BYTES = 4096;
class BinaryInspector {
    static readHeader(filePath, bytes = HEADER_BYTES) {
        const fd = (0, node_fs_1.openSync)(filePath, "r");
        try {
            const buf = Buffer.alloc(bytes);
            const read = (0, node_fs_1.readSync)(fd, buf, 0, bytes, 0);
            return buf.subarray(0, read);
        }
        finally {
            (0, node_fs_1.closeSync)(fd);
        }
    }
    /**
     * Identifies ELF, PE and Mach-O executables (and native `.node` addons) from their headers.
     */
    static inspect(input) {
        const buf = typeof input === "string" ? BinaryInspector.readHeader(input) : input;
        return BinaryInspector.inspectElf(buf) ?? BinaryInspector.inspectPe(buf) ?? BinaryInspector.inspectMachO(buf);
    }
    /**
     * Whether a binary can execute on the given target.
     */
    static matchesTarget(info, target) {
        const meta = (0, structures_1.getTargetMetadata)(target);
        if (!meta)
            return false;
        const family = (format) => format.replace(/32|64|plus/g, "");
        if (family(info.format) !== family(meta.binaryFormat))
            return false;
        if (info.arch !== meta.arch)
            return false;
        if (info.format.startsWith("elf")) {
            if ((meta.os === "freebsd") !== (info.elfAbi === "freebsd"))
                return false;
            // iSH ships Alpine (musl); glibc-linked binaries cannot load there
            if (meta.os === "ios-ish" && info.interpreter && !info.interpreter.includes("musl")) {
                return false;
            }
        }
        return true;
    }
    static inspectElf(buf) {
        if (buf.length < 52 || buf.readUInt32BE(0) !== 0x7f454c46)
            return null;
        const is64 = buf[4] === 2;
        const le = buf[5] !== 2;
        const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
        const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
        const info = {
            format: is64 ? "elf64" : "elf32",
            arch: ELF_MACHINES[u16(18)] ?? "unknown",
            bits: is64 ? 64 : 32,
            elfAbi: buf[7] === 9 ? "freebsd" : "sysv",
            interpreter: null,
        };
        // Walk program headers looking for PT_INTERP (only when inside the read window)
        const phoff = is64 ? Number(le ? buf.readBigUInt64LE(32) : buf.readBigUInt64BE(32)) : u32(28);
        const phentsize = u16(is64 ? 54 : 42);
        const phnum = u16(is64 ? 56 : 44);
        for (let i = 0; i < phnum; i++) {
            const at = phoff + i * phentsize;
            if (at + phentsize > buf.length)
                break;
            if (u32(at) !== 3)
                continue;
            const offset = is64 ? Number(le ? buf.readBigUInt64LE(at + 8) : buf.readBigUInt64BE(at + 8)) : u32(at + 4);
            const size = is64 ? Number(le ? buf.readBigUInt64LE(at + 32) : buf.readBigUInt64BE(at + 32)) : u32(at + 16);
            if (offset + size <= buf.length) {
                // Trailing NULs trimmed by a loop: a /\0+$/ regex is quadratic on a long run of NULs.
                let end = offset + size;
                while (end > offset && buf[end - 1] === 0)
                    end--;
                info.interpreter = buf.toString("latin1", offset, end);
            }
            break;
        }
        return info;
    }
    static inspectPe(buf) {
        if (buf.length < 64 || buf[0] !== 0x4d || buf[1] !== 0x5a)
            return null;
        const peOffset = buf.readUInt32LE(0x3c);
        if (peOffset + 26 > buf.length || buf.readUInt32BE(peOffset) !== 0x50450000) {
            return null;
        }
        const machine = buf.readUInt16LE(peOffset + 4);
        const magic = buf.readUInt16LE(peOffset + 24);
        const is64 = magic === 0x20b;
        return {
            format: is64 ? "pe32plus" : "pe32",
            arch: PE_MACHINES[machine] ?? "unknown",
            bits: is64 ? 64 : 32,
        };
    }
    static inspectMachO(buf) {
        if (buf.length < 8)
            return null;
        const magicLE = buf.readUInt32LE(0);
        if (magicLE === 0xfeedfacf || magicLE === 0xfeedface) {
            const cpu = buf.readUInt32LE(4);
            return {
                format: "macho",
                arch: MACHO_CPUS[cpu] ?? "unknown",
                bits: magicLE === 0xfeedfacf ? 64 : 32,
            };
        }
        return null;
    }
}
exports.BinaryInspector = BinaryInspector;
//# sourceMappingURL=BinaryInspector.js.map