/**
 * Shared security policy for the dev-only server APIs and their UI
 * counterparts. Kept in a client-safe module so the terminal panel and the
 * Vite middleware apply the exact same allow-list.
 */

/**
 * Recognized executables. Commands whose prefix is not listed require an
 * explicit user confirmation in the terminal panel before execution.
 * General-purpose shells (sh/bash/powershell/cmd...) are intentionally NOT
 * listed: they can execute arbitrary payloads, so they always need approval.
 */
export const DEFAULT_ALLOWED_COMMANDS: ReadonlyArray<string> = Object.freeze([
  'python', 'python3', 'py', 'python.exe',
  'node', 'npm', 'npx', 'yarn', 'pnpm', 'deno', 'bun',
  'cargo', 'rustc', 'go', 'g++', 'gcc', 'cc', 'clang', 'clang++',
  'javac', 'java', 'dotnet', 'cmake', 'make', 'ninja',
  'echo', 'git', 'ls', 'dir', 'pwd', 'cd', 'type', 'cat', 'rg', 'grep',
  'find', 'mkdir', 'copy', 'xcopy', 'robocopy', 'tar', 'unzip', 'curl', 'wget',
  // Installers — only ever run after an EXPLICIT user confirmation (toolchain
  // install offer from the smoke test). Never auto-installed.
  'winget', 'choco', 'brew', 'apt-get', 'apt', 'dnf', 'rustup'
]);

/**
 * Parses the IPL_ALLOWED_COMMANDS environment value (comma-separated,
 * case-insensitive). Returns null when unset/empty so callers can fall back
 * on their own default policy.
 */
export function parseAllowedCommands(envValue?: string): string[] | null {
  if (!envValue || !envValue.trim()) return null;
  return envValue
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Extracts the executable basename of a shell command line:
 *   "python main.py"            -> "python"
 *   "./myapp --port 8080"       -> "myapp"
 *   "../bin/tool -x"            -> "tool"
 *   "C:\\dev\\python.exe -x"     -> "python.exe"
 *   "npm run build"             -> "npm"
 *   "g++ -std=c++20 main.cpp"   -> "g++"
 */
export function commandPrefix(command: string): string {
  const trimmed = command.trim();
  if (!trimmed) return '';
  const firstToken = trimmed.split(/\s+/)[0];
  const match = /[A-Za-z0-9_][A-Za-z0-9_.+-]*$/.exec(firstToken);
  return match ? match[0].toLowerCase() : '';
}

/**
 * True when the command's executable prefix is inside the allow-list.
 */
export function isCommandAllowed(
  command: string,
  allowed: ReadonlyArray<string> = DEFAULT_ALLOWED_COMMANDS
): boolean {
  const prefix = commandPrefix(command);
  return prefix !== '' && allowed.includes(prefix);
}
