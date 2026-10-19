"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppTrimmer = void 0;
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const BinaryInspector_1 = require("./BinaryInspector");
const JS_FILE = /\.(js|cjs|mjs)$/;
const NATIVE_FILE = /\.(node|dll|so|dylib)$|\.so\.\d+(\.\d+)*$/;
const BUILD_INPUT = /\.(c|cc|cpp|cxx|h|hh|hpp|hxx|gyp|gypi|o|obj|a|lib|pdb|exp|ilk|tlog|mk|cmake)$|^(binding\.gyp|Makefile|CMakeLists\.txt|config\.gypi)$/i;
const LICENSE_FILE = /^(licen[cs]e|copying|notice|authors)([.-].*)?$/i;
/** Directories that hold a package's own tests, examples and docs, which the package itself never loads. */
const NEVER_LOADED_DIRS = new Set([
    "test",
    "tests",
    "__tests__",
    "__mocks__",
    "example",
    "examples",
    "benchmark",
    "benchmarks",
    ".github",
    ".vscode",
    ".idea",
    "coverage",
]);
/**
 * A `require(` or `import(` call, or esbuild's `__require(` (what an ES module bundle calls require through). Its
 * argument decides whether the graph can follow it.
 */
const CALL = /(^|[^.\w$])(?:__)?(require|import)\s*\(/g;
const LITERAL_ARG = /\s*(['"`])((?:(?!\1)[^\\\n$]|\\.)*)\1\s*\)/y;
const RESOLVE_CALL = /\brequire\s*\.\s*resolve\s*\(\s*(?:(['"`])((?:(?!\1)[^\\\n$]|\\.)*)\1\s*[,)])?/g;
/** `import x from "y"` / `export * from "y"` / `import "y"`, for a file the build could not convert. */
const STATIC_IMPORT = /(?:^|[\n;}])[ \t]*(?:import|export)\b[^'"`;]*?\bfrom\s*(['"])([^'"\n]+)\1|(?:^|[\n;])[ \t]*import\s*(['"])([^'"\n]+)\3/g;
/** Index of the first non-space character at or after `i`. A plain scan: no regex backtracking over long runs of spaces. */
function skipSpaces(code, i) {
    let at = i;
    while (at < code.length && /\s/.test(code[at]))
        at++;
    return at;
}
/** Whether a `{` follows `pos` after optional spaces and an optional `)`: the shape of a method declaration. */
function opensMethodBody(code, pos) {
    let at = skipSpaces(code, pos);
    if (code[at] === ")")
        at = skipSpaces(code, at + 1);
    return code[at] === "{";
}
/** `require` handed around as a value, or a loader built from it: the names it loads cannot be read. */
const OPAQUE_LOADER = /\bcreateRequire\b|\bmodule\s*\.\s*require\b|\brequire\s*\.\s*main\s*\.\s*require\b|[=,(:?]\s*require\s*[,;)}\n]|\bprocess\s*\.\s*dlopen\b/;
/** Code that reads its own package's files by path. */
const OWN_FILES = /\b__dirname\b|\b__filename\b|\b__fgMetaUrl\b|\bimport\s*\.\s*meta\b/;
function packageRootOf(path) {
    const at = path.lastIndexOf("node_modules/");
    if (at < 0)
        return "";
    const rest = path.slice(at + "node_modules/".length).split("/");
    const length = rest[0]?.startsWith("@") ? 2 : 1;
    if (rest.length <= length)
        return "";
    return path.slice(0, at + "node_modules/".length) + rest.slice(0, length).join("/");
}
function splitSpecifier(specifier) {
    const parts = specifier.split("/");
    const length = specifier.startsWith("@") ? 2 : 1;
    return {
        name: parts.slice(0, length).join("/"),
        sub: parts.length > length ? `./${parts.slice(length).join("/")}` : ".",
    };
}
/** The host's `pickCondition`: conditions in the package's order, "import" only as a last resort. */
function pickCondition(exports, allowImport) {
    if (!exports)
        return null;
    if (typeof exports === "string")
        return exports;
    if (Array.isArray(exports)) {
        for (const candidate of exports) {
            const resolved = pickCondition(candidate, allowImport);
            if (resolved)
                return resolved;
        }
        return null;
    }
    if (typeof exports !== "object")
        return null;
    const map = exports;
    const root = Object.hasOwn(map, ".") ? map["."] : map;
    if (typeof root === "string")
        return root;
    if (!root || typeof root !== "object")
        return null;
    if (Array.isArray(root))
        return pickCondition(root, allowImport);
    for (const condition of Object.keys(root)) {
        if (condition.startsWith("."))
            continue;
        const active = condition === "require" ||
            condition === "node" ||
            condition === "node-addons" ||
            condition === "module-sync" ||
            condition === "default" ||
            (allowImport && condition === "import");
        if (!active)
            continue;
        const resolved = pickCondition(root[condition], allowImport);
        if (resolved)
            return resolved;
    }
    return null;
}
function resolveExports(exports) {
    return pickCondition(exports, false) ?? pickCondition(exports, true);
}
/** The host's `matchExports`: an exact subpath, then the longest `./dir/*` pattern. */
function matchExports(exports, sub) {
    if (typeof exports === "string" || Array.isArray(exports))
        return sub === "." ? resolveExports(exports) : null;
    if (!exports || typeof exports !== "object")
        return null;
    const map = exports;
    const keys = Object.keys(map);
    if (!keys.some((key) => key.startsWith(".")))
        return sub === "." ? resolveExports(map) : null;
    if (Object.hasOwn(map, sub))
        return resolveExports(map[sub]);
    let best = null;
    for (const key of keys) {
        const star = key.indexOf("*");
        if (star < 0)
            continue;
        const prefix = key.slice(0, star);
        const suffix = key.slice(star + 1);
        if (sub.length >= key.length - 1 && sub.startsWith(prefix) && sub.endsWith(suffix)) {
            if (!best || prefix.length > best.prefix.length)
                best = { key, prefix, suffix };
        }
    }
    if (!best)
        return null;
    const target = resolveExports(map[best.key]);
    const middle = sub.slice(best.prefix.length, sub.length - best.suffix.length);
    return target ? target.replaceAll("*", middle) : null;
}
const SOURCE_EXTENSION_MAP = {
    ".ts": ".js",
    ".tsx": ".js",
    ".jsx": ".js",
    ".mts": ".mjs",
    ".cts": ".cjs",
};
class AppTrimmer {
    /**
     * Whether a file inside an installed package is one no program loads: type declarations, source maps (added back
     * when something reads them), documentation, and the package's own tests, examples and editor settings.
     */
    static isNeverLoaded(path, packageRoot) {
        const inside = path.slice(packageRoot.length + 1);
        const name = node_path_1.posix.basename(inside);
        if (/\.d\.[cm]?ts$/.test(name) || name.endsWith(".map"))
            return true;
        if (/\.(md|markdown|mdx)$/i.test(name) && !LICENSE_FILE.test(name))
            return true;
        // What an addon was compiled from and with: sources, headers, object files, build scripts, debug symbols.
        if (BUILD_INPUT.test(name))
            return true;
        const dirs = inside.split("/").slice(0, -1);
        // A package nested under this one is a package of its own, judged by its own files.
        return dirs.some((dir) => NEVER_LOADED_DIRS.has(dir.toLowerCase()));
    }
    static trim(entries, options) {
        const byPath = new Map();
        const dirs = new Set([""]);
        for (const entry of entries) {
            byPath.set(entry.path, entry);
            for (let dir = node_path_1.posix.dirname(entry.path); dir !== "." && !dirs.has(dir); dir = node_path_1.posix.dirname(dir))
                dirs.add(dir);
        }
        // Windows and macOS find `./Helper` for helper.js, so a spelling that differs only in case still counts as reaching it.
        const folded = new Map();
        for (const path of [...byPath.keys(), ...dirs])
            if (!folded.has(path.toLowerCase()))
                folded.set(path.toLowerCase(), path);
        const isFile = (path) => byPath.has(path);
        const isDir = (path) => dirs.has(path);
        const actual = (path) => {
            if (byPath.has(path) || dirs.has(path))
                return path;
            return folded.get(path.toLowerCase()) ?? null;
        };
        const textCache = new Map();
        const text = (path) => {
            let value = textCache.get(path);
            if (value === undefined) {
                const entry = byPath.get(path);
                if (!entry)
                    return "";
                try {
                    value = (typeof entry.source === "string" ? (0, node_fs_1.readFileSync)(entry.source) : entry.source).toString("utf-8");
                }
                catch {
                    value = "";
                }
                textCache.set(path, value);
            }
            return value;
        };
        const manifests = new Map();
        const manifest = (dir) => {
            if (manifests.has(dir))
                return manifests.get(dir) ?? null;
            let value = null;
            const file = dir ? `${dir}/package.json` : "package.json";
            if (isFile(file)) {
                try {
                    value = JSON.parse(text(file));
                }
                catch {
                    value = null;
                }
            }
            manifests.set(dir, value);
            return value;
        };
        const resolvePackage = (spelled) => {
            for (const candidate of [
                spelled,
                `${spelled}.js`,
                `${spelled}.cjs`,
                `${spelled}.mjs`,
                `${spelled}.json`,
                `${spelled}.node`,
            ]) {
                const found = actual(candidate);
                if (found && isFile(found))
                    return found;
            }
            const mapped = /\.(tsx?|jsx|mts|cts)$/.exec(spelled);
            if (mapped) {
                const alternative = actual(spelled.slice(0, -mapped[0].length) + SOURCE_EXTENSION_MAP[`.${mapped[1]}`]);
                if (alternative && isFile(alternative))
                    return alternative;
            }
            const base = actual(spelled);
            if (base !== null && isDir(base)) {
                const pkg = manifest(base);
                if (pkg) {
                    const entry = resolveExports(pkg.exports) ?? (typeof pkg.main === "string" ? pkg.main : null);
                    if (entry) {
                        const resolved = resolvePackage(join(base, entry));
                        if (resolved)
                            return resolved;
                    }
                }
                for (const name of ["index.js", "index.cjs", "index.mjs", "index.json", "index.node"]) {
                    const index = join(base, name);
                    if (isFile(index))
                        return index;
                }
            }
            return null;
        };
        const join = (...parts) => {
            const joined = node_path_1.posix.normalize(parts.filter(Boolean).join("/"));
            return joined === "." ? "" : joined.replace(/\/$/, "");
        };
        const resolveInstalled = (dir, specifier) => {
            const { name, sub } = splitSpecifier(specifier);
            const packageDir = join(dir, "node_modules", name);
            const pkg = manifest(packageDir);
            if (pkg && pkg.exports !== undefined && pkg.exports !== null) {
                const target = matchExports(pkg.exports, sub);
                if (target) {
                    const found = resolvePackage(join(packageDir, target));
                    if (found)
                        return found;
                }
                else if (sub !== ".")
                    return null;
            }
            return resolvePackage(join(dir, "node_modules", specifier));
        };
        const resolvePackageImport = (specifier, fromDir) => {
            for (let dir = fromDir;; dir = dir.includes("/") ? node_path_1.posix.dirname(dir) : "") {
                const pkg = manifest(dir);
                if (pkg) {
                    const imports = pkg.imports;
                    if (!imports || typeof imports !== "object")
                        return null;
                    let target = Object.hasOwn(imports, specifier) ? resolveExports(imports[specifier]) : null;
                    if (!target) {
                        for (const key of Object.keys(imports)) {
                            const star = key.indexOf("*");
                            if (star < 0)
                                continue;
                            const prefix = key.slice(0, star);
                            const suffix = key.slice(star + 1);
                            if (specifier.startsWith(prefix) && specifier.endsWith(suffix)) {
                                const value = resolveExports(imports[key]);
                                if (value)
                                    target = value.replaceAll("*", specifier.slice(prefix.length, specifier.length - suffix.length));
                            }
                        }
                    }
                    if (!target)
                        return null;
                    return target.startsWith("./") ? resolvePackage(join(dir, target)) : resolve(target, dir);
                }
                if (!dir)
                    return null;
            }
        };
        /** Where the host would find `specifier` required from a file in `fromDir`, if inside the application. */
        const resolve = (specifier, fromDir) => {
            if (!specifier || specifier.startsWith("node:") || specifier.startsWith("/") || /^[A-Za-z]:/.test(specifier))
                return null;
            if (specifier.startsWith("#"))
                return resolvePackageImport(specifier, fromDir);
            if (specifier === "." || specifier === ".." || specifier.startsWith("./") || specifier.startsWith("../")) {
                const base = join(fromDir, specifier);
                if (base === ".." || base.startsWith("../"))
                    return null;
                return resolvePackage(base);
            }
            for (let dir = fromDir;; dir = dir.includes("/") ? node_path_1.posix.dirname(dir) : "") {
                const found = resolveInstalled(dir, specifier);
                if (found)
                    return found;
                if (!dir)
                    return null;
            }
        };
        const filesOf = new Map();
        for (const path of byPath.keys()) {
            const root = packageRootOf(path);
            if (!root)
                continue;
            const list = filesOf.get(root);
            if (list)
                list.push(path);
            else
                filesOf.set(root, [path]);
        }
        const foreign = (path) => {
            if (!packageRootOf(path))
                return false;
            const name = node_path_1.posix.basename(path);
            if (!NATIVE_FILE.test(name) && !/^[^.]+$|\.exe$/i.test(name))
                return false;
            const entry = byPath.get(path);
            if (!entry)
                return false;
            let info = null;
            try {
                info = BinaryInspector_1.BinaryInspector.inspect(typeof entry.source === "string" ? entry.source : entry.source.subarray(0, 4096));
            }
            catch {
                info = null;
            }
            return info !== null && !BinaryInspector_1.BinaryInspector.matchesTarget(info, options.target);
        };
        const kept = new Set();
        const whole = new Set();
        const queue = [];
        const reach = (path) => {
            if (kept.has(path))
                return;
            kept.add(path);
            if (JS_FILE.test(path))
                queue.push(path);
            touch(packageRootOf(path));
        };
        const touched = new Set();
        /** A package something reaches: its manifest ships, and all of it when it carries a native binary. */
        const touch = (root) => {
            if (!root || touched.has(root))
                return;
            touched.add(root);
            if (isFile(`${root}/package.json`))
                kept.add(`${root}/package.json`);
            // Addon loaders (bindings, node-gyp-build, prebuild-install) look for the binary themselves.
            if ((filesOf.get(root) ?? []).some((path) => NATIVE_FILE.test(path)))
                keepWhole(root);
        };
        /** Something required `specifier` and it resolved to no file: the package it names still counts as reached. */
        const touchNamed = (specifier, fromDir) => {
            if (/^[./#]|^node:|^[A-Za-z]:/.test(specifier))
                return;
            const { name } = splitSpecifier(specifier);
            for (let dir = fromDir;; dir = dir.includes("/") ? node_path_1.posix.dirname(dir) : "") {
                const candidate = join(dir, "node_modules", name);
                if (filesOf.has(candidate))
                    return touch(candidate);
                if (!dir)
                    return;
            }
        };
        const keepWhole = (root) => {
            if (!root || whole.has(root))
                return;
            whole.add(root);
            for (const path of filesOf.get(root) ?? []) {
                if (AppTrimmer.isNeverLoaded(path, root))
                    continue;
                // TypeScript a package ships beside its build is only loaded if something asks for it by name.
                if (options.convertedFromTypeScript?.has(path))
                    continue;
                if (foreign(path))
                    continue;
                reach(path);
            }
        };
        /** The packages `root` declares, where the host would find them from it. */
        const dependenciesOf = (root) => {
            const pkg = manifest(root) ?? {};
            const names = new Set([
                ...Object.keys(pkg.dependencies ?? {}),
                ...Object.keys(pkg.optionalDependencies ?? {}),
                ...Object.keys(pkg.peerDependencies ?? {}),
            ]);
            const found = [];
            for (const name of names) {
                for (let dir = root;; dir = dir.includes("/") ? node_path_1.posix.dirname(dir) : "") {
                    const candidate = join(dir, "node_modules", name);
                    if (manifest(candidate)) {
                        found.push(candidate);
                        break;
                    }
                    if (!dir)
                        break;
                }
            }
            return found;
        };
        /** Code that loads a name the graph cannot read keeps its package, and every package it depends on, whole. */
        const opaque = new Set();
        const markOpaque = (root) => {
            if (opaque.has(root))
                return;
            // A loader can be handed the name of a package it does not declare (knex is told "pg" by the program's
            // configuration), and those are the program's own dependencies: once anything loads by name, they all ship.
            if (!opaque.size) {
                for (const dependency of dependenciesOf("")) {
                    kept.add(`${dependency}/package.json`);
                    const main = resolvePackage(dependency);
                    if (main)
                        reach(main);
                }
            }
            opaque.add(root);
            keepWhole(root);
            for (const dependency of dependenciesOf(root))
                keepWhole(dependency);
        };
        // The program's own files ship as they are, and every one of them is a starting point.
        for (const path of byPath.keys())
            if (!packageRootOf(path))
                reach(path);
        const literal = LITERAL_ARG;
        for (let file = queue.pop(); file !== undefined; file = queue.pop()) {
            const code = text(file);
            const fromDir = node_path_1.posix.dirname(file) === "." ? "" : node_path_1.posix.dirname(file);
            const root = packageRootOf(file);
            let dynamic = OPAQUE_LOADER.test(code);
            for (const match of code.matchAll(CALL)) {
                const after = (match.index ?? 0) + match[0].length;
                literal.lastIndex = after;
                const arg = literal.exec(code);
                if (!arg) {
                    // `import(` also declares a method named import; a require() of anything but a literal is certain.
                    if (match[2] === "require" || !opensMethodBody(code, after))
                        dynamic = true;
                    continue;
                }
                const found = resolve(arg[2], fromDir);
                if (found)
                    reach(found);
                else
                    touchNamed(arg[2], fromDir);
            }
            for (const match of code.matchAll(STATIC_IMPORT)) {
                const specifier = match[2] ?? match[4];
                const found = resolve(specifier, fromDir);
                if (found)
                    reach(found);
                else
                    touchNamed(specifier, fromDir);
            }
            for (const match of code.matchAll(RESOLVE_CALL)) {
                if (match[2] === undefined) {
                    dynamic = true;
                    continue;
                }
                // A resolved path is usually read or handed on as a directory: the package it points into ships whole.
                const found = resolve(match[2], fromDir);
                if (found) {
                    reach(found);
                    keepWhole(packageRootOf(found));
                }
            }
            if (dynamic)
                markOpaque(root);
            else if (root && OWN_FILES.test(code))
                keepWhole(root);
        }
        // Source maps matter only to code that reads them, and then every shipped file's map does.
        if ([...kept].some((path) => /(^|\/)source-map-support\//.test(path))) {
            for (const path of [...kept])
                if (JS_FILE.test(path) && isFile(`${path}.map`))
                    kept.add(`${path}.map`);
        }
        const shipped = new Set([...kept].map(packageRootOf).filter(Boolean));
        const before = { files: 0, bytes: 0 };
        const after = { files: 0, bytes: 0 };
        const out = [];
        for (const entry of entries) {
            const bytes = sizeOf(entry);
            before.files++;
            before.bytes += bytes;
            const root = packageRootOf(entry.path);
            const keep = root
                ? (kept.has(entry.path) && !foreign(entry.path)) ||
                    // The build redistributes this code, so its licence goes with it.
                    (shipped.has(root) && node_path_1.posix.dirname(entry.path) === root && LICENSE_FILE.test(node_path_1.posix.basename(entry.path)))
                : true;
            if (!keep)
                continue;
            out.push(entry);
            after.files++;
            after.bytes += bytes;
        }
        const droppedPackages = [...filesOf.keys()].filter((root) => !shipped.has(root));
        return { entries: out, before, after, droppedPackages };
    }
}
exports.AppTrimmer = AppTrimmer;
function sizeOf(entry) {
    if (typeof entry.source !== "string")
        return entry.source.length;
    try {
        return (0, node_fs_1.statSync)(entry.source).size;
    }
    catch {
        return 0;
    }
}
//# sourceMappingURL=AppTrimmer.js.map