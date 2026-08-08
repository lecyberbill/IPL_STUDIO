// [WFGY] Zone: SAFE | λ: 0.3 | Fallbacks: 0 | Action: Create IPL Tutorial Lessons Data Model

export interface LessonObjective {
  id: string;
  description: string;
  check: (code: string) => boolean;
}

export interface TutorialLesson {
  id: number;
  title: string;
  subtitle: string;
  category: string;
  icon: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  estimatedTime: string;
  explanation: string;
  codeExample: string;
  initialCode: string;
  solution: string;
  hint: string;
  objectives: LessonObjective[];
}

export const IPL_TUTORIAL_LESSONS: TutorialLesson[] = [
  {
    id: 1,
    title: "1. Structuring a UI View",
    subtitle: "Declare graphical interfaces with the `add view` verb",
    category: "IPL Basics",
    icon: "Layout",
    difficulty: "Beginner",
    estimatedTime: "3 min",
    explanation: `In **IPL (Intent Programming Language)**, user interfaces are declared declaratively with the **\`add view\`** verb.

A view defines the title, the visual theme, and the list of graphical components required by the application.

### General syntax :
\`\`\`ipl
add view ViewName {
  title: "Application title",
  theme: "dark",
  components: [
    "nameInput",
    "validateButton",
    "resultCard"
  ]
}
\`\`\`

**Note:** The \`add\` verb is one of IPL's 12 canonical verbs.`,
    codeExample: `add view DashboardView {
  title: "Analytics Dashboard",
  theme: "dark",
  components: [
    "filterDateInput",
    "metricsSummaryCard",
    "salesChart"
  ]
}`,
    initialCode: `// Step 1: Declare your first IPL view named TaskDashboardView
// It must contain a "Task Manager" title and at least 2 components.

add view TaskDashboardView {
  // Complete here
  title: "Task Manager",
  components: [
    "taskInputField",
    "taskListView"
  ]
}`,
    solution: `add view TaskDashboardView {
  title: "Task Manager",
  theme: "dark",
  components: [
    "taskInputField",
    "taskListView"
  ]
}`,
    hint: "Make sure you use `add view TaskDashboardView { ... }` with a `title:` field and a `components: [...]` list with at least 2 items.",
    objectives: [
      {
        id: "view_decl",
        description: "Declare a view named `TaskDashboardView` with the `add view` verb",
        check: (code: string) => /add\s+view\s+TaskDashboardView\s*\{/.test(code)
      },
      {
        id: "view_title",
        description: "Define the `title:` field with a string",
        check: (code: string) => /title\s*:\s*["'][^"']+["']/.test(code)
      },
      {
        id: "view_components",
        description: "Define a `components:` array containing at least 2 items",
        check: (code: string) => {
          const match = code.match(/components\s*:\s*\[([\s\S]*?)\]/);
          if (!match) return false;
          const items = match[1].split(',').filter(s => s.trim().length > 0);
          return items.length >= 2;
        }
      }
    ]
  },
  {
    id: 2,
    title: "2. Declaring Entities & Types",
    subtitle: "Model the domain with `add entity` and the 7 Intent Types",
    category: "Modeling",
    icon: "Database",
    difficulty: "Beginner",
    estimatedTime: "5 min",
    explanation: `Data in IPL is structured as **Entities**. To guarantee 100% reliable multi-language code generation (Rust, Python, TypeScript, Go), IPL strictly enforces **7 Intent Types**:

1. \`text\`: Character strings (title, name, description).
2. \`number\`: Integers or decimals (price, age, score).
3. \`boolean\`: True/false values (\`true\` / \`false\`).
4. \`id\`: Unique identifiers / UUID.
5. \`date\`: Dates or timestamps.
6. \`options("val1", "val2")\`: Enumerations and constrained choices.
7. \`list\`: Lists or arrays of items.

### Example :
\`\`\`ipl
add entity User {
  id: id,
  username: text,
  role: options("admin", "user", "guest"),
  isActive: boolean
}
\`\`\``,
    codeExample: `add entity Product {
  id: id,
  name: text,
  price: number,
  category: options("electronics", "books", "clothing"),
  inStock: boolean,
  createdAt: date
}`,
    initialCode: `// Step 2: Create an entity named Task
// It must have 4 fields:
// - id (type: id)
// - title (type: text)
// - priority (type: options with "low", "medium", "high")
// - isDone (type: boolean)

add entity Task {
  id: id,
  // Add the other fields here
}`,
    solution: `add entity Task {
  id: id,
  title: text,
  priority: options("low", "medium", "high"),
  isDone: boolean
}`,
    hint: "Declare the fields in the Task entity using `title: text`, `priority: options(\"low\", \"medium\", \"high\")`, and `isDone: boolean`.",
    objectives: [
      {
        id: "entity_decl",
        description: "Declare the `Task` entity with `add entity Task { ... }`",
        check: (code: string) => /add\s+entity\s+Task\s*\{/.test(code)
      },
      {
        id: "entity_id",
        description: "Include the `id: id` field",
        check: (code: string) => /id\s*:\s*id/.test(code)
      },
      {
        id: "entity_title",
        description: "Include the `title: text` field",
        check: (code: string) => /title\s*:\s*text/.test(code)
      },
      {
        id: "entity_priority",
        description: "Include the `priority: options(...)` field with at least 2 options",
        check: (code: string) => /priority\s*:\s*options\s*\([^)]+\)/.test(code)
      },
      {
        id: "entity_bool",
        description: "Include a boolean field `isDone: boolean`",
        check: (code: string) => /isDone\s*:\s*boolean/.test(code)
      }
    ]
  },
  {
    id: 3,
    title: "3. Manipulating Data (CRUD)",
    subtitle: "Use the `read`, `set`, `remove`, `search` verbs",
    category: "Data Verbs",
    icon: "Repeat",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
    explanation: `IPL provides declarative verbs to manipulate data without worrying about SQL or the underlying storage:

- **\`read\`**: Reads a record from a service or a table.
- **\`set\`**: Modifies a property or a state.
- **\`remove\`**: Removes an item from a collection.
- **\`search\`**: Searches for items matching a criterion.

### Examples :
\`\`\`ipl
read targetUser from userService {
  where: id == currentId
}

set targetUser.status = "ACTIVE"

remove targetItem from cart.items

search activeTasks from taskList {
  query: "urgent"
}
\`\`\``,
    codeExample: `read activeUser from userService {
  where: status == "ACTIVE"
}

set activeUser.lastLogin = "2026-08-06"
`,
    initialCode: `// Step 3: Perform the following 2 operations:
// 1. Read the task from 'taskService' where id == req.taskId and store it in 'currentTask'
// 2. Set 'currentTask.isDone' to true with the 'set' verb

read currentTask from taskService {
  where: id == req.taskId
}

// Write the 'set' statement below:
`,
    solution: `read currentTask from taskService {
  where: id == req.taskId
}

set currentTask.isDone = true`,
    hint: "To modify a property, use `set currentTask.isDone = true`.",
    objectives: [
      {
        id: "read_verb",
        description: "Use `read currentTask from taskService { ... }`",
        check: (code: string) => /read\s+currentTask\s+from\s+taskService/.test(code)
      },
      {
        id: "read_where",
        description: "Specify the `where: id == req.taskId` criterion",
        check: (code: string) => /where\s*:\s*id\s*==\s*req\.taskId/.test(code)
      },
      {
        id: "set_verb",
        description: "Update the task with `set currentTask.isDone = true`",
        check: (code: string) => /set\s+currentTask\.isDone\s*=\s*true/.test(code)
      }
    ]
  },
  {
    id: 4,
    title: "4. Metrics & Calculations",
    subtitle: "Use `compute`, `if` and `for` for business logic",
    category: "Logic & Flow",
    icon: "Cpu",
    difficulty: "Intermediate",
    estimatedTime: "5 min",
    explanation: `Calculation and flow-control operations in IPL are expressed naturally:

- **\`compute\`**: Declares an explicit business calculation.
- **\`if (...) { ... } else { ... }\`**: Conditional branching.
- **\`for item in collection { ... }\`**: Iteration loop.

### Example :
\`\`\`ipl
compute score from analytics {
  total: baseScore + (bonus * 1.5)
}

if (score.total > 100) {
  set user.badge = "VIP"
} else {
  set user.badge = "MEMBER"
}
\`\`\``,
    codeExample: `compute cartTotal from cart {
  finalPrice: subtotal - discount
}

if (cartTotal.finalPrice > 50) {
  set shipping.isFree = true
}`,
    initialCode: `// Step 4:
// 1. Compute a metric named 'completionStats' from 'taskList':
//    completionRate: (completedCount / totalCount) * 100
// 2. If completionStats.completionRate >= 100, set 'project.status = "COMPLETED"' with 'set'

compute completionStats from taskList {
  completionRate: (completedCount / totalCount) * 100
}

// Add the 'if (...) { ... }' condition here:
`,
    solution: `compute completionStats from taskList {
  completionRate: (completedCount / totalCount) * 100
}

if (completionStats.completionRate >= 100) {
  set project.status = "COMPLETED"
}`,
    hint: "Create an `if (completionStats.completionRate >= 100) { set project.status = \"COMPLETED\" }` structure.",
    objectives: [
      {
        id: "compute_verb",
        description: "Use the `compute` verb to calculate `completionRate`",
        check: (code: string) => /compute\s+completionStats\s+from\s+taskList/.test(code)
      },
      {
        id: "if_condition",
        description: "Create a conditional block `if (completionStats.completionRate >= 100)`",
        check: (code: string) => /if\s*\(\s*completionStats\.completionRate\s*>=\s*100\s*\)/.test(code)
      },
      {
        id: "set_inside_if",
        description: "Update the state inside the if block with `set project.status = \"COMPLETED\"`",
        check: (code: string) => /set\s+project\.status\s*=\s*["']COMPLETED["']/.test(code)
      }
    ]
  },
  {
    id: 5,
    title: "5. Events & Error Handling",
    subtitle: "Make the app reactive with `listen`, `try`, `catch` and `return`",
    category: "Events & APIs",
    icon: "Zap",
    difficulty: "Advanced",
    estimatedTime: "6 min",
    explanation: `IPL applications react to user or system events via **\`listen event on "event:name"\`**.

To guarantee safety and resilience, blocks accessing data or external services must be wrapped in **\`try { ... } catch (err) { ... }\`**, ending with **\`return\`** to send back a structured response.

### Example :
\`\`\`ipl
listen event on "user:create" {
  try {
    read newUser from userService {
      where: email == req.email
    }
    send notification to emailService {
      to: newUser.email,
      body: "Welcome!"
    }
    return { status: "SUCCESS", user: newUser }
  } catch (err) {
    send log to systemMonitor { message: err.message }
    return { status: "ERROR", reason: err.message }
  }
}
\`\`\``,
    codeExample: `listen event on "task:complete" {
  try {
    set task.isDone = true
    return { status: "SUCCESS" }
  } catch (err) {
    return { status: "FAILED", error: err.message }
  }
}`,
    initialCode: `// Step 5: Listen for the "task:toggle" event
// Inside a try/catch block:
// 1. Modify the task
// 2. Send an update to the 'taskListView' component with 'send'
// 3. Return an object { status: "SUCCESS" }

listen event on "task:toggle" {
  try {
    set task.isDone = true
    send update to taskListView {
      updatedTask: task
    }
    return {
      status: "SUCCESS"
    }
  } catch (err) {
    return {
      status: "FAILED"
    }
  }
}`,
    solution: `listen event on "task:toggle" {
  try {
    set task.isDone = true
    send update to taskListView {
      updatedTask: task
    }
    return {
      status: "SUCCESS"
    }
  } catch (err) {
    return {
      status: "FAILED"
    }
  }
}`,
    hint: "Make sure you have `listen event on \"task:toggle\"`, a `try { ... } catch (err) { ... }` block, the `send` verb and a `return { ... }`.",
    objectives: [
      {
        id: "listen_event",
        description: "Listen for the `listen event on \"task:toggle\"` event",
        check: (code: string) => /listen\s+event\s+on\s+["']task:toggle["']/.test(code)
      },
      {
        id: "try_catch",
        description: "Use a safety block `try { ... } catch (err) { ... }`",
        check: (code: string) => /try\s*\{[\s\S]*\}\s*catch\s*\(\s*err\s*\)\s*\{/.test(code)
      },
      {
        id: "send_verb",
        description: "Dispatch the update with `send update to taskListView`",
        check: (code: string) => /send\s+\w+\s+to\s+taskListView/.test(code)
      },
      {
        id: "return_payload",
        description: "Return a structured response with `return { status: ... }`",
        check: (code: string) => /return\s*\{[\s\S]*status\s*:/.test(code)
      }
    ]
  },
  {
    id: 6,
    title: "6. Final Project: Smart Task App",
    subtitle: "Combine views, entities, calculations and events in a complete IPL file",
    category: "Complete project",
    icon: "CheckCircle2",
    difficulty: "Advanced",
    estimatedTime: "8 min",
    explanation: `Congratulations! You now master IPL's core concepts.

In this final exercise, you will create a **complete IPL Specification** that brings together:
1. A UI View (\`add view TaskAppView\`)
2. A Data Entity (\`add entity TaskItem\`)
3. A Reactive Event Handler (\`listen event on "task:create"\`) using \`try/catch\`, \`compute\`, \`send\` and \`return\`.`,
    codeExample: `add view TaskAppView {
  title: "IPL Smart Task Manager",
  theme: "dark",
  components: ["taskInput", "taskGrid"]
}

add entity TaskItem {
  id: id,
  title: text,
  priority: options("low", "high"),
  isDone: boolean
}

listen event on "task:create" {
  try {
    compute stats from taskGrid {
      total: count + 1
    }
    send update to taskGrid {
      stats: stats
    }
    return { status: "SUCCESS" }
  } catch (err) {
    return { status: "FAILED" }
  }
}`,
    initialCode: `// Step 6 (Final Project): Write the complete IPL specification!

add view TaskAppView {
  title: "IPL Smart Task Manager",
  components: ["taskInput", "taskGrid"]
}

add entity TaskItem {
  id: id,
  title: text,
  priority: options("low", "medium", "high"),
  isDone: boolean
}

listen event on "task:create" {
  try {
    compute stats from taskGrid {
      total: count + 1
    }
    send update to taskGrid {
      data: stats
    }
    return {
      status: "SUCCESS"
    }
  } catch (err) {
    return {
      status: "FAILED"
    }
  }
}`,
    solution: `add view TaskAppView {
  title: "IPL Smart Task Manager",
  components: ["taskInput", "taskGrid"]
}

add entity TaskItem {
  id: id,
  title: text,
  priority: options("low", "medium", "high"),
  isDone: boolean
}

listen event on "task:create" {
  try {
    compute stats from taskGrid {
      total: count + 1
    }
    send update to taskGrid {
      data: stats
    }
    return {
      status: "SUCCESS"
    }
  } catch (err) {
    return {
      status: "FAILED"
    }
  }
}`,
    hint: "Keep the three main blocks: `add view TaskAppView`, `add entity TaskItem`, and `listen event on \"task:create\"`.",
    objectives: [
      {
        id: "final_view",
        description: "Contains a view `add view TaskAppView`",
        check: (code: string) => /add\s+view\s+TaskAppView/.test(code)
      },
      {
        id: "final_entity",
        description: "Contains an entity `add entity TaskItem` with id, title and boolean",
        check: (code: string) => /add\s+entity\s+TaskItem/.test(code) && /isDone\s*:\s*boolean/.test(code)
      },
      {
        id: "final_listen",
        description: "Contains an event handler `listen event on \"task:create\"`",
        check: (code: string) => /listen\s+event\s+on\s+["']task:create["']/.test(code)
      },
      {
        id: "final_robustness",
        description: "Contains `try`, `compute`, `send` and `return` in the event block",
        check: (code: string) => /try/.test(code) && /compute/.test(code) && /send/.test(code) && /return/.test(code)
      }
    ]
  }
];
