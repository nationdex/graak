// A WebAssembly module from another language, through the binding Graak generates next to it (reactor.wasm.js).
import { add, double_f64 } from "./reactor.wasm.js";

console.log("add", add(20, 22));
console.log("double", double_f64(4.5));
