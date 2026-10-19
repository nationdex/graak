import { randomBytes } from "node:crypto";
import { renameSync, writeFileSync } from "node:fs";

/** Writes `data` to a unique temp name beside `file`, then renames it into place: a reader never sees a partial file. */
export function writeFileAtomic(file: string, data: string | Uint8Array): void {
	const tmp = `${file}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, file);
}
