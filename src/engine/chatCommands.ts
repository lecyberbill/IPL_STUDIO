/**
 * Chat micro-commands: `/command [args]` typed at the start of a chat message.
 *
 * Two kinds:
 *   - `action` (built-in): runs a store action directly (verify, generate, ...).
 *   - `prompt` (user-defined in Settings): expands to an instruction and runs the
 *     normal LLM refinement (macro).
 *
 * Pure catalogue + parser (the side effects live in the store / ChatPanel).
 */

export type ChatCommandKind = 'action' | 'prompt';

export interface ChatCommandMeta {
  id: string;
  /** How it is typed, e.g. `/new <name>`. */
  usage: string;
  description: string;
  kind: ChatCommandKind;
}

export const BUILTIN_COMMANDS: ChatCommandMeta[] = [
  { id: 'help', usage: '/help', description: 'List the available commands.', kind: 'action' },
  { id: 'verify', usage: '/verify', description: 'Verify the current artifact against the IPL contract (gates + semantics + parity).', kind: 'action' },
  { id: 'generate', usage: '/generate', description: 'Generate the app from the current IPL contract.', kind: 'action' },
  { id: 'save', usage: '/save', description: 'Save the artifact to the project output folder.', kind: 'action' },
  { id: 'export', usage: '/export', description: 'Export the artifact as a .zip archive.', kind: 'action' },
  { id: 'new', usage: '/new <name>', description: 'Create and activate a new project.', kind: 'action' },
  { id: 'clear', usage: '/clear', description: 'Clear this project\u2019s chat history.', kind: 'action' }
];

/** Parses a leading `/command [args]` (any command id), or null. */
export function parseChatCommand(text: string): { id: string; args: string } | null {
  const m = text.trim().match(/^\/([a-z][a-z-]*)\b[ \t]*([\s\S]*)$/i);
  if (!m) return null;
  return { id: m[1].toLowerCase(), args: m[2].trim() };
}

/** A user-defined command (Settings): `/id [...]` expands to `instruction`. */
export interface CustomCommand {
  id: string;
  instruction: string;
  description?: string;
}

/** Autocomplete candidates for an in-progress `/query` (prefix match, capped). */
export function filterCommands(query: string, commands: ChatCommandMeta[], max = 8): ChatCommandMeta[] {
  const q = query.toLowerCase();
  return commands.filter(c => c.id.startsWith(q)).slice(0, max);
}

/** The merged catalogue the chat autocompletes over (built-ins + custom prompts). */
export function allCommandMetas(custom: CustomCommand[]): ChatCommandMeta[] {
  return [
    ...BUILTIN_COMMANDS,
    ...custom.map(c => ({
      id: c.id,
      usage: `/${c.id} [text]`,
      description: c.description || c.instruction,
      kind: 'prompt' as const
    }))
  ];
}

/** Expands a custom command into the LLM request (`instruction` + optional args). */
export function expandCustomCommand(instruction: string, args: string): string {
  return args ? `${instruction}\n\nAdditional input: ${args}` : instruction;
}
