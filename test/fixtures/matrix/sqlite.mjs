// node:sqlite: a database file, prepared statements, named parameters, aggregates and NULL.
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "graak-matrix-sqlite-"));
const db = new DatabaseSync(join(dir, "data.db"));
db.exec("CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT NOT NULL, price REAL)");
const insert = db.prepare("INSERT INTO items (name, price) VALUES (?, ?)");
for (const [name, price] of [["apple", 1.25], ["pear", 2], ["plum", null]]) insert.run(name, price);
console.log(JSON.stringify(db.prepare("SELECT id, name, price FROM items ORDER BY id").all()));
console.log(db.prepare("SELECT count(*) AS n, sum(price) AS total FROM items").get().n);
console.log(db.prepare("SELECT name FROM items WHERE price > :min").get({ min: 1.5 }).name);
db.close();
rmSync(dir, { recursive: true, force: true });
console.log("closed");
