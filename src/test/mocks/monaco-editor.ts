/**
 * Minimal monaco-editor stand-in for Node-based unit tests.
 *
 * The real package touches browser globals (`window`) at import time, which
 * breaks in the node test environment. These tests never exercise a real
 * Monaco instance (editorInstance stays null), so a type-compatible stub for
 * the runtime-only symbols used by the store slices is enough. TypeScript still
 * resolves types from the real package; only Vitest's runtime import is aliased.
 */
export class Selection {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;

  constructor(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number) {
    this.startLineNumber = startLineNumber;
    this.startColumn = startColumn;
    this.endLineNumber = endLineNumber;
    this.endColumn = endColumn;
  }
}

export const editor: Record<string, unknown> = {};

export default { Selection, editor };
