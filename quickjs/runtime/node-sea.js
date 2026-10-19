/*
 * Single-file executables: the program, its node_modules and this runtime live in the executable's own payload
 * (quickjs/native/fg_sea.c), under a root directory "<exe>.graak" that does not exist on disk. installSea wraps the
 * engine's `os` and `std` modules so that everything built on them (fs, require, the Intl data loader, child_process)
 * reads paths under that root straight from the payload, decompressed on demand, and nothing is unpacked.
 *
 * The payload is the lower layer of an overlay; the disk at the same paths is the upper one. Reads of a payload path
 * come from memory. Writes go to the disk (creating the real directories they need), and a payload file that is
 * written, removed or renamed in this process is from then on read from the disk. Code that needs a real file gets
 * one extracted: a native addon (with the shared libraries in the payload, which it may link against), an SQLite
 * database, a program started as a child process.
 */

const S_IFREG = 0o100000;
const S_IFDIR = 0o040000;
const EBADF = 9;
const EISDIR = 21;
const EEXIST = 17;
const EINVAL = 22;
const EXDEV = 18;
const SEEK_CUR = 1;
const SEEK_END = 2;

// Shared libraries an addon may link against, extracted with the first addon so the loader finds them beside it.
const LIBRARY = /\.(dll|dylib|so(\.\d+)*)$/i;

export function installSea({ os, std, native }) {
	const sea = native.sea;
	const win = os.platform === "win32";
	const root = sea.root;
	const rootKey = win ? root.toLowerCase() : root;
	const shadowed = new Set();
	const files = new Map();
	let nextFd = 0x40000000;
	let times = null;

	/* The canonical form of a path under the root ("<root>/a/b", forward slashes), or null for any other path. */
	function norm(p) {
		if (typeof p !== "string" || p.length < root.length) return null;
		const s = win ? p.replace(/\\/g, "/") : p;
		if ((win ? s.slice(0, root.length).toLowerCase() : s.slice(0, root.length)) !== rootKey) return null;
		if (s.length > root.length && s[root.length] !== "/") return null;
		const parts = [];
		for (const part of s.slice(root.length).split("/")) {
			if (part === "" || part === ".") continue;
			if (part === "..") {
				if (!parts.length) return null;
				parts.pop();
			} else parts.push(part);
		}
		return parts.length ? `${root}/${parts.join("/")}` : root;
	}

	/* [kind (1 file, 2 directory), size, mode] of a payload path the disk has not taken over, else null. */
	function lookup(p) {
		const c = norm(p);
		if (c === null || shadowed.has(c)) return null;
		return sea.stat(c) ?? null;
	}

	function info([kind, size, mode]) {
		// Payload files carry the executable's own times, which change exactly when the program does.
		if (!times) {
			const [self] = os.stat(os.exePath?.()[0] ?? "");
			const now = Date.now();
			times = self ? { atime: self.atime, mtime: self.mtime, ctime: self.ctime } : { atime: now, mtime: now, ctime: now };
		}
		return {
			dev: 0,
			ino: 0,
			mode: kind === 2 ? S_IFDIR | 0o755 : S_IFREG | (mode & 0o777 || 0o644),
			nlink: 1,
			uid: 0,
			gid: 0,
			rdev: 0,
			size,
			blocks: Math.ceil(size / 512),
			...times,
		};
	}

	/* mkdir -p on the disk for a directory under the root, which the payload may have but the disk does not. */
	function makeReal(dir) {
		const c = norm(dir);
		if (c === null) return;
		let current = root.slice(0, root.lastIndexOf("/"));
		for (const part of c.slice(current.length + 1).split("/")) {
			current += `/${part}`;
			const [st] = os.stat(current);
			if (!st) os.mkdir(current, 0o777);
		}
	}
	const parentOf = (p) => p.slice(0, p.lastIndexOf("/"));

	function writeReal(p, bytes, mode) {
		makeReal(parentOf(p));
		const fd = os.open(p, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | (os.O_BINARY ?? 0), mode);
		if (fd < 0) return fd;
		let done = 0;
		while (done < bytes.byteLength) {
			const n = os.write(fd, bytes.buffer, bytes.byteOffset + done, bytes.byteLength - done);
			if (n <= 0) {
				os.close(fd);
				return n || -5;
			}
			done += n;
		}
		os.close(fd);
		return 0;
	}

	/* A real path for a payload file, extracting it; paths the payload does not have are returned as they are. */
	function realFile(p) {
		const v = lookup(p);
		return v && v[0] === 1 ? sea.extract(norm(p)) : p;
	}

	const writeFlags = os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC | os.O_APPEND;
	const vos = { ...os };

	vos.stat = (p) => {
		const v = lookup(p);
		return v ? [info(v), 0] : os.stat(p);
	};
	vos.lstat = (p) => {
		const v = lookup(p);
		return v ? [info(v), 0] : (os.lstat ?? os.stat)(p);
	};
	vos.readdir = (p) => {
		const c = norm(p);
		const listed = c !== null && !shadowed.has(c) ? sea.readdir(c) : undefined;
		if (!listed) return os.readdir(p);
		// Files the program wrote beside its own show up with them; ones it removed do not.
		const [real] = os.readdir(p);
		const names = new Set(listed.filter((name) => !shadowed.has(`${c}/${name}`)));
		for (const name of real ?? []) if (name !== "." && name !== "..") names.add(name);
		return [[...names], 0];
	};
	vos.realpath = (p) => (lookup(p) ? [win ? norm(p).replace(/\//g, "\\") : norm(p), 0] : os.realpath(p));
	vos.readlink = (p) => (lookup(p) ? ["", EINVAL] : os.readlink(p));
	vos.open = (p, flags, mode) => {
		const c = norm(p);
		if (c === null) return os.open(p, flags, mode);
		const v = lookup(c);
		if (v && !(flags & writeFlags)) {
			const fd = nextFd++;
			files.set(fd, v[0] === 2 ? { dir: true } : { data: new Uint8Array(sea.read(c)), pos: 0 });
			return fd;
		}
		if (v && flags & os.O_CREAT && flags & os.O_EXCL) return -EEXIST;
		if (v && v[0] === 1 && !(flags & os.O_TRUNC)) {
			// Opened to modify: the disk gets the payload's copy first.
			const rc = writeReal(p, new Uint8Array(sea.read(c)), v[2] || 0o644);
			if (rc < 0) return rc;
		} else if (flags & os.O_CREAT) {
			makeReal(parentOf(c));
		}
		if (v) shadowed.add(c);
		return os.open(p, flags, mode);
	};
	vos.read = (fd, buffer, offset, length) => {
		const f = files.get(fd);
		if (!f) return os.read(fd, buffer, offset, length);
		if (f.dir) return -EISDIR;
		const n = Math.max(0, Math.min(length, f.data.length - f.pos));
		new Uint8Array(buffer, offset, n).set(f.data.subarray(f.pos, f.pos + n));
		f.pos += n;
		return n;
	};
	vos.seek = (fd, offset, whence) => {
		const f = files.get(fd);
		if (!f) return os.seek(fd, offset, whence);
		if (f.dir) return -EISDIR;
		const base = whence === SEEK_CUR ? f.pos : whence === SEEK_END ? f.data.length : 0;
		const next = base + Number(offset);
		if (next < 0) return -EINVAL;
		f.pos = next;
		return typeof offset === "bigint" ? BigInt(next) : next;
	};
	vos.close = (fd) => (files.delete(fd) ? 0 : os.close(fd));
	vos.write = (fd, ...rest) => (files.has(fd) ? -EBADF : os.write(fd, ...rest));
	vos.isatty = (fd) => (files.has(fd) ? false : os.isatty(fd));
	vos.remove = (p) => {
		const c = norm(p);
		if (c !== null && lookup(c)) {
			shadowed.add(c);
			os.remove(p);
			return 0;
		}
		return os.remove(p);
	};
	vos.rename = (from, to) => {
		const a = norm(from);
		const b = norm(to);
		const v = a !== null ? lookup(a) : null;
		if (b !== null) makeReal(parentOf(b));
		if (v) {
			if (v[0] === 2) return -EXDEV;
			const rc = writeReal(b ?? to, new Uint8Array(sea.read(a)), v[2] || 0o644);
			if (rc < 0) return rc;
			shadowed.add(a);
			os.remove(from);
		} else {
			const rc = os.rename(from, to);
			if (rc < 0) return rc;
		}
		if (b !== null) shadowed.add(b);
		return 0;
	};
	vos.mkdir = (p, mode) => {
		const c = norm(p);
		if (c !== null) {
			if (lookup(c)) return -EEXIST;
			makeReal(parentOf(c));
		}
		return os.mkdir(p, mode);
	};

	/* A child process gets real files: the program to run and any payload file named in its arguments. */
	const wrapExec = (exec) =>
		exec &&
		((args, options) => {
			if (options?.cwd && lookup(options.cwd)) makeReal(options.cwd);
			return exec(Array.isArray(args) ? args.map(realFile) : args, options);
		});
	if (os.exec) vos.exec = wrapExec(os.exec);
	if (native.exec) native.exec = wrapExec(native.exec);

	if (typeof native.dlopen === "function") {
		const dlopen = native.dlopen;
		let libraries = false;
		native.dlopen = (filename, exports) => {
			if (lookup(filename)) {
				if (!libraries) {
					for (const rel of sea.paths()) if (LIBRARY.test(rel)) sea.extract(`${root}/${rel}`);
					libraries = true;
				}
				filename = realFile(filename);
				// LoadLibraryEx finds an addon's own DLLs beside it only when given backslashes.
				if (win) filename = filename.replace(/\//g, "\\");
			}
			return dlopen(filename, exports);
		};
	}
	const sqliteOpen = native.sqliteOpen;
	if (typeof sqliteOpen === "function") {
		native.sqliteOpen = (file, ...rest) => {
			if (norm(file) !== null) {
				if (lookup(file)) file = realFile(file);
				else makeReal(parentOf(norm(file)));
			}
			return sqliteOpen(file, ...rest);
		};
	}

	const vstd = { ...std };
	vstd.loadFile = (p, options) => {
		const v = lookup(p);
		if (!v || v[0] !== 1) return std.loadFile(p, options);
		const data = sea.read(norm(p));
		return options?.binary ? data : native.decodeUtf8(new Uint8Array(data));
	};

	return { os: vos, std: vstd, release: () => sea.release() };
}
