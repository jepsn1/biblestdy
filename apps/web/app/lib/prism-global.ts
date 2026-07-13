// @lexical/code's prism language components (prism-clike.js etc.) reference
// the global `Prism` that core sets on window when it evaluates. Rollup's
// CJS interop can evaluate a component before core in the built bundle
// ("ReferenceError: Prism is not defined" -> route module import rejects ->
// react-router reloads the page in a loop). Importing core here hoists it
// into the entry chunk so the global exists before any route chunk runs.
import Prism from "prismjs";

(globalThis as { Prism?: unknown }).Prism ??= Prism;
