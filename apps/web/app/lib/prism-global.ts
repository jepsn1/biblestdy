// @lexical/code's prism language components (prism-clike.js etc.) reference
// the global `Prism` that core sets on window when it evaluates. Rollup's
// CJS interop can evaluate a component before core in the built bundle
// ("ReferenceError: Prism is not defined" -> the editor import rejects).
// The note editor's loader (reader/note-editor-loader.ts) imports this first
// and only then the editor chunk, so the global exists before any of it runs.
import Prism from "prismjs";

(globalThis as { Prism?: unknown }).Prism ??= Prism;
