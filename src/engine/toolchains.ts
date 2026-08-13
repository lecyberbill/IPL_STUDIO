/**
 * Toolchain configuration — optional explicit paths to the runtimes the
 * generated apps target (node, python, rustc, go, g++, gcc).
 *
 * Three-level resolution (agreed):
 *  1. Explicit path configured in Settings (e.g. a venv python, a custom rustc).
 *  2. Default executable found on PATH.
 *  3. Missing entirely → the smoke reports a `missingToolchain` and the UI
 *     offers a user-confirmed install.
 *
 * These paths feed BOTH the smoke checks AND the run command, so a configured
 * venv python is used to launch the app, not just to syntax-check it.
 */

export interface Toolchains {
  node?: string;
  python?: string;
  rustc?: string;
  go?: string;
  gpp?: string;
  gcc?: string;
}

export type ToolchainKey = keyof Toolchains;

export const TOOLCHAIN_KEYS: ToolchainKey[] = ['node', 'python', 'rustc', 'go', 'gpp', 'gcc'];

export const DEFAULT_TOOL_NAMES: Record<ToolchainKey, string> = {
  node: 'node',
  python: 'python',
  rustc: 'rustc',
  go: 'go',
  gpp: 'g++',
  gcc: 'gcc'
};

/** Resolves the executable for a tool: configured path when set, else the default name. */
export function resolveTool(tool: ToolchainKey, toolchains?: Toolchains): string {
  const custom = toolchains?.[tool];
  return custom && custom.trim() ? custom.trim() : DEFAULT_TOOL_NAMES[tool];
}

/**
 * Rewrites a base command so its executable prefix uses the configured toolchain
 * when one is set (e.g. `python main.py` → `C:\venv\Scripts\python.exe main.py`).
 * Leaves the command untouched when no override exists.
 */
export function resolveToolchainCommand(command: string, toolchains?: Toolchains): string {
  const trimmed = command.trim();
  if (!trimmed) return trimmed;
  const match = /^([A-Za-z0-9_][A-Za-z0-9_.+-]*)(\s.*)?$/.exec(trimmed);
  if (!match) return trimmed;
  const prefix = match[1];
  const rest = match[2] ?? '';
  for (const key of TOOLCHAIN_KEYS) {
    if (DEFAULT_TOOL_NAMES[key] === prefix) {
      const resolved = resolveTool(key, toolchains);
      return resolved === prefix ? trimmed : `${resolved}${rest}`;
    }
  }
  return trimmed;
}

/** OS-aware suggested install command for a missing toolchain (never auto-run — the user confirms). */
export function installCommandFor(tool: ToolchainKey, platform: NodeJS.Platform = process.platform): string {
  const win = platform === 'win32';
  const mac = platform === 'darwin';
  switch (tool) {
    case 'node':
      return win ? 'winget install OpenJS.NodeJS.LTS' : mac ? 'brew install node' : 'sudo apt-get install -y nodejs';
    case 'python':
      return win ? 'winget install Python.Python.3.12' : mac ? 'brew install python' : 'sudo apt-get install -y python3';
    case 'rustc':
      return win ? 'winget install Rustlang.Rustup' : 'curl --proto "=https" --tlsv1.2 -sSf https://sh.rustup.rs | sh';
    case 'go':
      return win ? 'winget install GoLang.Go' : mac ? 'brew install go' : 'sudo apt-get install -y golang-go';
    case 'gpp':
    case 'gcc':
      return win
        ? 'winget install -e --id MartinStorsjo.LLVM-MinGW'
        : mac
          ? 'xcode-select --install'
          : 'sudo apt-get install -y build-essential';
  }
}
