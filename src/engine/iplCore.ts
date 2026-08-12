/**
 * Core data model of IPL v1.0 (Intent Programming Language).
 * Single source of truth for the 13 key action verbs and the 7 human intent types.
 * Extracted from iplGrammar.ts so both the grammar (Monarch) and the parser can
 * import it without creating a dependency cycle.
 */

export interface IPLVerb {
  id: string;
  name: string;
  category: 'action' | 'data' | 'control' | 'flow';
  description: string;
  snippet: string;
  example: string;
}

export interface IPLTypeDefinition {
  id: string;
  name: string;
  category: 'types';
  description: string;
  snippet: string;
  example: string;
  targetMapping: string;
}

export const IPL_INTENT_TYPES: IPLTypeDefinition[] = [
  {
    id: 'type-text',
    name: 'text',
    category: 'types',
    description: 'Human Intent Type: Text string or email',
    snippet: 'text',
    example: 'customerName: text',
    targetMapping: 'String / str'
  },
  {
    id: 'type-number',
    name: 'number',
    category: 'types',
    description: 'Human Intent Type: Amount, price, score, or count',
    snippet: 'number',
    example: 'totalAmount: number',
    targetMapping: 'f64 / float / number'
  },
  {
    id: 'type-boolean',
    name: 'boolean',
    category: 'types',
    description: 'Human Intent Type: True/false condition or flag',
    snippet: 'boolean',
    example: 'isPaid: boolean',
    targetMapping: 'bool / boolean'
  },
  {
    id: 'type-id',
    name: 'id',
    category: 'types',
    description: 'Human Intent Type: Unique identifier or UUID',
    snippet: 'id',
    example: 'orderId: id',
    targetMapping: 'Uuid / UUID / string'
  },
  {
    id: 'type-date',
    name: 'date',
    category: 'types',
    description: 'Human Intent Type: Timestamp or date',
    snippet: 'date',
    example: 'createdAt: date',
    targetMapping: 'DateTime / datetime'
  },
  {
    id: 'type-options',
    name: 'options(...)',
    category: 'types',
    description: 'Human Intent Type: Choice list or Enum',
    snippet: 'options("option_a", "option_b")',
    example: 'status: options("pending", "shipped")',
    targetMapping: 'Enum / Union'
  },
  {
    id: 'type-list',
    name: 'list',
    category: 'types',
    description: 'Human Intent Type: Collection or Array',
    snippet: 'list',
    example: 'items: list',
    targetMapping: 'Vec<T> / List[T]'
  }
];

/**
 * Renders the 13 canonical verbs as a Markdown table.
 * Shared by the LLM prompts and the regenerated IPL_AGENT_GUIDE.md.
 */
export function renderVerbTable(verbs: IPLVerb[] = IPL_VERBS): string {
  const header = '| Verb | Category | Purpose & Description | Syntax Example |';
  const separator = '| :--- | :--- | :--- | :--- |';
  const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
  const rows = verbs.map((v) => `| \`${v.name}\` | ${capitalize(v.category)} | ${v.description} | \`${v.example}\` |`);
  return [header, separator, ...rows].join('\n');
}

/**
 * Renders the 7 human intent types as a Markdown table.
 * Shared by the LLM prompts and the regenerated IPL_AGENT_GUIDE.md.
 */
export function renderIntentTypeTable(types: IPLTypeDefinition[] = IPL_INTENT_TYPES): string {
  const header = '| Type | Description | Target Mapping | Example |';
  const separator = '| :--- | :--- | :--- | :--- |';
  const rows = types.map((t) => `| \`${t.name}\` | ${t.description.replace(/^Human Intent Type:\s*/i, '')} | ${t.targetMapping} | \`${t.example}\` |`);
  return [header, separator, ...rows].join('\n');
}

/**
 * Canonical grammar signature (verbs + intent types) generated from the
 * single source of truth. Embedded in the Pass 1 / Pass 2 LLM prompts and
 * in IPL_AGENT_GUIDE.md so the language vocabulary never drifts.
 */
export function grammarSignatureText(): string {
  return [
    'The 13 Canonical Action Verbs',
    '',
    renderVerbTable(),
    '',
    'The 7 Human Intent Types',
    '',
    renderIntentTypeTable()
  ].join('\n');
}

export const IPL_VERBS: IPLVerb[] = [
  {
    id: 'add',
    name: 'add',
    category: 'data',
    description: 'Adds an item, entity, or module with optional human intent types (text, number, boolean, id, date, options)',
    snippet: 'add entity Order {\n  id: id,\n  customerName: text,\n  amount: number,\n  isPaid: boolean,\n  status: options("pending", "shipped", "delivered")\n}',
    example: 'add entity User { id: id, email: text, age: number, isActive: boolean }'
  },
  {
    id: 'seed',
    name: 'seed',
    category: 'data',
    description: 'Seeds a concrete instance of an entity (catalog / fixture data) — closes the data gap: entities are types, seed is the actual data',
    snippet: 'seed Drink Espresso {\n  basePrice: 1.50,\n  devise: "EUR"\n}',
    example: 'seed Drink Espresso { basePrice: 1.50, devise: "EUR" }'
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
