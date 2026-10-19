"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.writeFileAtomic = writeFileAtomic;
const node_crypto_1 = require("node:crypto");
const node_fs_1 = require("node:fs");
/** Writes `data` to a unique temp name beside `file`, then renames it into place: a reader never sees a partial file. */
function writeFileAtomic(file, data) {
    const tmp = `${file}.${process.pid}.${(0, node_crypto_1.randomBytes)(6).toString("hex")}.tmp`;
    (0, node_fs_1.writeFileSync)(tmp, data);
    (0, node_fs_1.renameSync)(tmp, file);
}
//# sourceMappingURL=AtomicWrite.js.map