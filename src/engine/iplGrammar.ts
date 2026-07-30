/**
 * Specification and Grammar of IPL v1.0 (Intent Programming Language)
 * Contains the 12 key action verbs, Monarch rules for Monaco, brace validation, import preprocessor, and symbol extraction.
 */

/**
 * Recursively resolves `import "file.ipl"` directives in IPL source code
 */
export function resolveIPLImports(mainCode: string, sourceFiles: Record<string, string> = {}): string {
  const importRegex = /import\s+["']([^"']+)["'];?/g;
  return mainCode.replace(importRegex, (match, importedFile) => {
    if (sourceFiles[importedFile]) {
      return `// --- Imported from ${importedFile} ---\n${sourceFiles[importedFile]}\n`;
    }
    return match;
  });
}

export interface IPLVerb {
  id: string;
  name: string;
  category: 'action' | 'data' | 'control' | 'flow';
  description: string;
  snippet: string;
  example: string;
}

export const IPL_VERBS: IPLVerb[] = [
  {
    id: 'add',
    name: 'add',
    category: 'data',
    description: 'Adds an item, entity, or module into the data structure or UI view',
    snippet: 'add item {\n  name: "Name",\n  value: "Value"\n}',
    example: 'add user { name: "Alice", role: "Admin" }'
  },
  {
    id: 'read',
    name: 'read',
    category: 'data',
    description: 'Reads or extracts data from database, API, or local store',
    snippet: 'read item from dataStore {\n  where: id == 1\n}',
    example: 'read profile from users { where: id == currentUser }'
  },
  {
    id: 'set',
    name: 'set',
    category: 'data',
    description: 'Sets or updates a property, state, or variable value',
    snippet: 'set status = "active"',
    example: 'set theme = "dark"'
  },
  {
    id: 'remove',
    name: 'remove',
    category: 'data',
    description: 'Deletes a record, state item, or visual component',
    snippet: 'remove item from list {\n  where: id == targetId\n}',
    example: 'remove session from activeSessions { where: expired == true }'
  },
  {
    id: 'search',
    name: 'search',
    category: 'data',
    description: 'Searches or filters entities based on search criteria',
    snippet: 'search items in catalog {\n  matching: query\n}',
    example: 'search products in catalog { matching: searchKeyword }'
  },
  {
    id: 'send',
    name: 'send',
    category: 'action',
    description: 'Sends a network request, notification, event, or email',
    snippet: 'send notification to user {\n  message: "Hello"\n}',
    example: 'send email to user { subject: "Welcome", body: "Hello Alice" }'
  },
  {
    id: 'listen',
    name: 'listen',
    category: 'action',
    description: 'Listens for incoming webhooks, user clicks, or system events',
    snippet: 'listen event on "userCreated" {\n  action: "sendWelcomeEmail"\n}',
    example: 'listen event on "paymentReceived" { action: "fulfillOrder" }'
  },
  {
    id: 'compute',
    name: 'compute',
    category: 'action',
    description: 'Executes a calculation, algorithm, or data transformation',
    snippet: 'compute totalPrice {\n  formula: subtotal + tax - discount\n}',
    example: 'compute finalPrice { formula: price * 1.20 }'
  },
  {
    id: 'if',
    name: 'if',
    category: 'control',
    description: 'Conditional branching control flow based on boolean expressions',
    snippet: 'if user.isLoggedIn {\n  read dashboard\n} else {\n  redirect to login\n}',
    example: 'if status == "success" { return true }'
  },
  {
    id: 'for',
    name: 'for',
    category: 'flow',
    description: 'Loops over a collection or list of items',
    snippet: 'for item in items {\n  compute total\n}',
    example: 'for order in activeOrders { send receipt to order.customer }'
  },
  {
    id: 'try',
    name: 'try',
    category: 'control',
    description: 'Executes a block with error handling and fallback logic',
    snippet: 'try {\n  read remoteData\n} catch error {\n  log error\n}',
    example: 'try { send payload } catch err { set status = "failed" }'
  },
  {
    id: 'return',
    name: 'return',
    category: 'flow',
    description: 'Returns a result or exits the execution block',
    snippet: 'return result',
    example: 'return { status: 200, data: user }'
  }
];

export const IPL_LANGUAGE_DEFINITION = {
  defaultToken: '',
  tokenPostfix: '.ipl',

  keywords: IPL_VERBS.map(v => v.name),

  typeKeywords: [
    'string', 'number', 'boolean', 'array', 'object', 'date', 'entity', 'module'
  ],

  operators: [
    '=', '==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/', '&&', '||', '!'
  ],

  symbols:  /[=><!~?:&|+\-*\/\^%]+/,

  tokenizer: {
    root: [
      [/[a-z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@typeKeywords': 'type',
          '@default': 'identifier'
        }
      }],
      [/[A-[#0-9]]*/, 'type'],
      { include: '@whitespace' },
      [/[{}()\[\]]/, '@brackets'],
      [/@symbols/, {
        cases: {
          '@operators': 'operator',
          '@default': ''
        }
      }],
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/0[xX][0-9a-fA-F]+/, 'number.hex'],
      [/\d+/, 'number'],
      [/[;,.]/, 'delimiter'],
      [/"([^"\\]|\\.)*"/, 'string'],
      [/'([^'\\]|\\.)*'/, 'string'],
    ],

    whitespace: [
      [/[ \t\r\n]+/, 'white'],
      [/\/\*/, 'comment', '@comment'],
      [/\/\/.*/, 'comment'],
    ],

    comment: [
      [/[^\/*]+/, 'comment'],
      [/\/\*/, 'comment', '@push'],
      [/\*\//, 'comment', '@pop'],
      [/[/*]/, 'comment']
    ]
  }
};

export interface SyntaxErrorItem {
  line: number;
  column: number;
  message: string;
}

export function validateIPLCode(code: string): SyntaxErrorItem[] {
  const errors: SyntaxErrorItem[] = [];
  const lines = code.split('\n');
  
  let openBraces = 0;
  const braceStack: Array<{ line: number; col: number }> = [];

  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    for (let c = 0; c < lineText.length; c++) {
      const char = lineText[c];
      if (char === '{') {
        openBraces++;
        braceStack.push({ line: l + 1, col: c + 1 });
      } else if (char === '}') {
        if (openBraces === 0) {
          errors.push({
            line: l + 1,
            column: c + 1,
            message: 'Closing brace "}" found without a matching opening brace.'
          });
        } else {
          openBraces--;
          braceStack.pop();
        }
      }
    }
  }

  if (openBraces > 0) {
    const lastOpen = braceStack[braceStack.length - 1];
    errors.push({
      line: lastOpen ? lastOpen.line : lines.length,
      column: lastOpen ? lastOpen.col : 1,
      message: `Unclosed opening brace "{" at line ${lastOpen ? lastOpen.line : lines.length}.`
    });
  }

  return errors;
}

export interface IPLSymbol {
  name: string;
  kind: 'entity' | 'module' | 'event';
  line: number;
  column: number;
}

/**
 * Extracts all declared symbols in IPL script (add <name>, listen event on <name>, etc.)
 */
export function extractIPLSymbols(code: string): IPLSymbol[] {
  const symbols: IPLSymbol[] = [];
  const lines = code.split('\n');

  for (let l = 0; l < lines.length; l++) {
    const lineText = lines[l];
    const addMatch = lineText.match(/\badd\s+([a-zA-Z0-9_]+)\s*\{/);
    if (addMatch) {
      symbols.push({
        name: addMatch[1],
        kind: 'entity',
        line: l + 1,
        column: lineText.indexOf(addMatch[1]) + 1
      });
    }

    const eventMatch = lineText.match(/\blisten\s+event\s+on\s+["']([^"']+)["']/);
    if (eventMatch) {
      symbols.push({
        name: eventMatch[1],
        kind: 'event',
        line: l + 1,
        column: lineText.indexOf(eventMatch[1]) + 1
      });
    }
  }

  return symbols;
}
