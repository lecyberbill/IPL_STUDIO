/**
 * Regenerates the verb/type tables inside IPL_AGENT_GUIDE.md from the single
 * source of truth (src/engine/iplCore.ts).
 *
 * Run: npm run doc:guide
 *
 * The tables are delimited by HTML-comment markers in the markdown:
 *   <!-- IPL_SIGNATURE:VERBS --> ... <!-- IPL_SIGNATURE:VERBS_END -->
 *   <!-- IPL_SIGNATURE:TYPES --> ... <!-- IPL_SIGNATURE:TYPES_END -->
 * The prose around them is preserved as-is.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { renderVerbTable, renderIntentTypeTable, IPL_VERBS, IPL_INTENT_TYPES } from '../src/engine/iplCore.ts';

const GUIDE_PATH = resolve(import.meta.dirname, '../IPL_AGENT_GUIDE.md');

const MARKERS: ReadonlyArray<{
  begin: string;
  end: string;
  render: () => string;
}> = [
  {
    begin: '<!-- IPL_SIGNATURE:VERBS -->',
    end: '<!-- IPL_SIGNATURE:VERBS_END -->',
    render: renderVerbTable
  },
  {
    begin: '<!-- IPL_SIGNATURE:TYPES -->',
    end: '<!-- IPL_SIGNATURE:TYPES_END -->',
    render: renderIntentTypeTable
  }
];

function replaceBetween(content: string, begin: string, end: string, replacement: string): string {
  const start = content.indexOf(begin);
  const stop = content.indexOf(end);
  if (start === -1 || stop === -1 || stop < start) {
    throw new Error(`Marker pair not found: ${begin} ... ${end}`);
  }
  const insertStart = start + begin.length;
  const insertEnd = stop;
  return content.slice(0, insertStart) + '\n' + replacement + '\n' + content.slice(insertEnd);
}

let guide = readFileSync(GUIDE_PATH, 'utf8');
for (const marker of MARKERS) {
  guide = replaceBetween(guide, marker.begin, marker.end, marker.render());
}

// Keep the prose counts in sync with the single source of truth too, so a verb
// or type added to iplCore.ts can never leave the guide saying "12 verbs".
const countPhrases: Array<[RegExp, string]> = [
  [/The 12 Canonical Action Verbs/g, `The ${IPL_VERBS.length} Canonical Action Verbs`],
  [/exactly \*\*12 canonical action verbs\*\*/g, `exactly **${IPL_VERBS.length} canonical action verbs**`],
  [/12 canonical verbs and 7 intent types/g, `${IPL_VERBS.length} canonical verbs and ${IPL_INTENT_TYPES.length} intent types`]
];
for (const [re, replacement] of countPhrases) {
  guide = guide.replace(re, replacement);
}

writeFileSync(GUIDE_PATH, guide, 'utf8');
console.log(`Regenerated tables + counts in ${GUIDE_PATH} (${IPL_VERBS.length} verbs, ${IPL_INTENT_TYPES.length} types)`);
