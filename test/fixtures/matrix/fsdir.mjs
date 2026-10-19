// The file system: directories, reads, appends, sizes, renames and removal, in a directory of the program's own.
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "graak-matrix-fs-"));
mkdirSync(join(dir, "sub"));
writeFileSync(join(dir, "b.txt"), "bee");
writeFileSync(join(dir, "a.txt"), "ay");
appendFileSync(join(dir, "a.txt"), "!");
console.log(readdirSync(dir).sort());
console.log(readFileSync(join(dir, "a.txt"), "utf8"), statSync(join(dir, "b.txt")).size, statSync(join(dir, "sub")).isDirectory());
renameSync(join(dir, "b.txt"), join(dir, "c.txt"));
console.log(existsSync(join(dir, "b.txt")), existsSync(join(dir, "c.txt")));
rmSync(dir, { recursive: true, force: true });
console.log("removed", existsSync(dir));
