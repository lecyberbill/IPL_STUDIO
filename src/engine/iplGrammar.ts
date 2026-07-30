/**
 * Spécification et Grammaire du Langage IPL v1.0 (Intent Programming Language)
 * Contient les 12 verbes d'action clés, les règles de monarch pour Monaco, la validation des accolades et le préprocesseur d'imports.
 */

/**
 * Résout récursivement les directives `import "file.ipl"` dans le code source IPL
 */
export function resolveIPLImports(mainCode: string, sourceFiles: Record<string, string> = {}): string {
  const importRegex = /import\s+["']([^"']+)["'];?/g;
  return mainCode.replace(importRegex, (match, importedFile) => {
    if (sourceFiles[importedFile]) {
      return `// --- Importé depuis ${importedFile} ---\n${sourceFiles[importedFile]}\n`;
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
    description: 'Ajoute un élément ou une entité dans la structure de données ou la vue UI',
    snippet: 'add item {\n  name: "Nom",\n  value: "Valeur"\n}',
    example: 'add user { name: "Alice", role: "Admin" }'
  },
  {
    id: 'read',
    name: 'read',
    category: 'data',
    description: 'Lit ou extrait une donnée de la base de données ou du magasin local',
    snippet: 'read item from dataStore {\n  where: id == 1\n}',
    example: 'read profile from users { where: id == currentUser }'
  },
  {
    id: 'set',
    name: 'set',
    category: 'data',
    description: 'Définit ou met à jour une propriété, un état ou une variable',
    snippet: 'set status = "active"',
    example: 'set theme = "dark"'
  },
  {
    id: 'remove',
    name: 'remove',
    category: 'data',
    description: 'Supprime un enregistrement ou un composant visuel',
    snippet: 'remove item from list {\n  where: id == targetId\n}',
    example: 'remove session from activeSessions { where: expired == true }'
  },
  {
    id: 'search',
    name: 'search',
    category: 'data',
    description: 'Recherche et filtre des données selon un critère d\'intention',
    snippet: 'search items in catalog {\n  query: "keyword",\n  limit: 10\n}',
    example: 'search products in inventory { query: "laptop" }'
  },
  {
    id: 'send',
    name: 'send',
    category: 'action',
    description: 'Envoie un message, un événement ou une requête API réseau',
    snippet: 'send notification to user {\n  message: "Opération réussie",\n  channel: "email"\n}',
    example: 'send request to "/api/v1/checkout" { body: cart }'
  },
  {
    id: 'listen',
    name: 'listen',
    category: 'action',
    description: 'Écoute un événement système, utilisateur ou socket en temps réel',
    snippet: 'listen event on "user:click" {\n  set count = count + 1\n}',
    example: 'listen websocket on "messages" { add message to chat }'
  },
  {
    id: 'compute',
    name: 'compute',
    category: 'action',
    description: 'Calcule une transformation complexe, statistique ou formule mathématique',
    snippet: 'compute totalAmount from cart {\n  taxRate: 0.20,\n  discount: 10\n}',
    example: 'compute total = price * quantity'
  },
  {
    id: 'if',
    name: 'if',
    category: 'control',
    description: 'Condition d\'exécution basée sur une expression d\'intention',
    snippet: 'if (condition) {\n  set status = "valid"\n} else {\n  set status = "invalid"\n}',
    example: 'if (user.isLoggedIn) { send welcome to user }'
  },
  {
    id: 'for',
    name: 'for',
    category: 'control',
    description: 'Boucle d\'itération sur une collection ou une séquence',
    snippet: 'for item in collection {\n  send update to item\n}',
    example: 'for order in pendingOrders { set order.status = "processed" }'
  },
  {
    id: 'try',
    name: 'try',
    category: 'flow',
    description: 'Bloc de gestion d\'erreurs et d\'exceptions de flux',
    snippet: 'try {\n  read data from remoteApi\n} catch (error) {\n  send alert to admin { text: error }\n}',
    example: 'try { compute result } catch (err) { set status = "error" }'
  },
  {
    id: 'return',
    name: 'return',
    category: 'flow',
    description: 'Retourne une valeur, un état ou un composant à la fonction appelante',
    snippet: 'return {\n  success: true,\n  data: result\n}',
    example: 'return totalAmount'
  }
];

/**
 * Définition du Monarch Language Tokenizer pour Monaco Editor
 */
export const IPL_LANGUAGE_DEFINITION = {
  defaultToken: '',
  tokenPostfix: '.ipl',

  keywords: IPL_VERBS.map(v => v.name),

  types: ['empty', 'string', 'number', 'boolean', 'list', 'map', 'object'],
  builtins: ['true', 'false', 'null', 'undefined'],

  operators: [
    '=', '==', '!=', '>', '<', '>=', '<=', '+', '-', '*', '/', '%', '&&', '||', '!'
  ],

  // Symbols
  symbols: /[=><!~?:&|+\-*\/\^%]+/,

  // Tokenizer rules
  tokenizer: {
    root: [
      // Identifiers and keywords
      [/[a-zA-Z_$][\w$]*/, {
        cases: {
          '@keywords': 'keyword',
          '@types': 'type',
          '@builtins': 'predefined',
          '@default': 'identifier'
        }
      }],

      // Whitespace
      { include: '@whitespace' },

      // Delimiters and brackets
      [/[{}()\[\]]/, '@brackets'],
      [/[;,]/, 'delimiter'],

      // Numbers
      [/\d*\.\d+([eE][\-+]?\d+)?/, 'number.float'],
      [/\d+/, 'number'],

      // Strings
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

/**
 * Validation Syntaxique IPL (Contrôle des 12 verbes et des accolades {})
 */
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
            message: 'Accolade fermante "}" fermée sans ouverture préalable.'
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
      line: lastOpen.line,
      column: lastOpen.col,
      message: `Accolade ouvrante "{" non refermée à la ligne ${lastOpen.line}.`
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
 * Extrait tous les symboles déclarés dans le script IPL (add <name>, listen event on <name>, etc.)
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
