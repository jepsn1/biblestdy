/** Runs every cleanup (Lexical's register* functions each return one). */
export function mergeRegister(...cleanups: (() => void)[]): () => void {
  return () => {
    for (const c of cleanups) c();
  };
}
