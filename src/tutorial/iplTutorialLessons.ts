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
  difficulty: 'Débutant' | 'Intermédiaire' | 'Avancé';
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
    title: "1. Structurer une Vue UI",
    subtitle: "Déclarer des interfaces graphiques avec le verbe `add view`",
    category: "Bases IPL",
    icon: "Layout",
    difficulty: "Débutant",
    estimatedTime: "3 min",
    explanation: `Dans **IPL (Intent Programming Language)**, la déclaration des interfaces utilisateur se fait de manière déclarative avec le verbe **\`add view\`**.

Une vue définit le titre, le thème visuel, et la liste des composants graphiques nécessaires pour l'application.

### Syntaxe générale :
\`\`\`ipl
add view NomDeLaVue {
  title: "Titre de l'application",
  theme: "dark",
  components: [
    "inputNom",
    "boutonValider",
    "carteResultat"
  ]
}
\`\`\`

**Note :** Le verbe \`add\` est l'un des 12 verbes canoniques d'IPL.`,
    codeExample: `add view DashboardView {
  title: "Tableau de Bord Analytique",
  theme: "dark",
  components: [
    "filterDateInput",
    "metricsSummaryCard",
    "salesChart"
  ]
}`,
    initialCode: `// Étape 1 : Déclarez votre première vue IPL prénommée TaskDashboardView
// Elle doit contenir un titre "Gestionnaire de Tâches" et au moins 2 composants.

add view TaskDashboardView {
  // Complétez ici
  title: "Gestionnaire de Tâches",
  components: [
    "taskInputField",
    "taskListView"
  ]
}`,
    solution: `add view TaskDashboardView {
  title: "Gestionnaire de Tâches",
  theme: "dark",
  components: [
    "taskInputField",
    "taskListView"
  ]
}`,
    hint: "Assurez-vous d'utiliser `add view TaskDashboardView { ... }` avec un champ `title:` et une liste `components: [...]` avec au moins 2 éléments.",
    objectives: [
      {
        id: "view_decl",
        description: "Déclarer une vue nommée `TaskDashboardView` avec le verbe `add view`",
        check: (code: string) => /add\s+view\s+TaskDashboardView\s*\{/.test(code)
      },
      {
        id: "view_title",
        description: "Définir le champ `title:` avec une chaîne de caractères",
        check: (code: string) => /title\s*:\s*["'][^"']+["']/.test(code)
      },
      {
        id: "view_components",
        description: "Définir un tableau `components:` contenant au moins 2 éléments",
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
    title: "2. Déclarer des Entités & Types",
    subtitle: "Modéliser le domaine avec `add entity` et les 7 Types d'Intention",
    category: "Modélisation",
    icon: "Database",
    difficulty: "Débutant",
    estimatedTime: "5 min",
    explanation: `Les données dans IPL sont structurées sous forme d'**Entités**. Pour garantir une génération de code multi-langage (Rust, Python, TypeScript, Go) 100% fiable, IPL impose strictement **7 Types d'Intention** :

1. \`text\` : Chaînes de caractères (titre, nom, description).
2. \`number\` : Nombres entiers ou décimaux (prix, âge, score).
3. \`boolean\` : Valeurs vraies/fausses (\`true\` / \`false\`).
4. \`id\` : Identifiants uniques / UUID.
5. \`date\` : Dates ou horodatages.
6. \`options("val1", "val2")\` : Énumérations et choix contraints.
7. \`list\` : Listes ou tableaux d'éléments.

### Exemple :
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
    initialCode: `// Étape 2 : Créez une entité nommée Task
// Elle doit posséder 4 champs :
// - id (type: id)
// - title (type: text)
// - priority (type: options avec "low", "medium", "high")
// - isDone (type: boolean)

add entity Task {
  id: id,
  // Ajoutez les autres champs ici
}`,
    solution: `add entity Task {
  id: id,
  title: text,
  priority: options("low", "medium", "high"),
  isDone: boolean
}`,
    hint: "Déclarez les champs dans l'entité Task en utilisant `title: text`, `priority: options(\"low\", \"medium\", \"high\")`, et `isDone: boolean`.",
    objectives: [
      {
        id: "entity_decl",
        description: "Déclarer l'entité `Task` avec `add entity Task { ... }`",
        check: (code: string) => /add\s+entity\s+Task\s*\{/.test(code)
      },
      {
        id: "entity_id",
        description: "Inclure le champ `id: id`",
        check: (code: string) => /id\s*:\s*id/.test(code)
      },
      {
        id: "entity_title",
        description: "Inclure le champ `title: text`",
        check: (code: string) => /title\s*:\s*text/.test(code)
      },
      {
        id: "entity_priority",
        description: "Inclure le champ `priority: options(...)` avec au moins 2 options",
        check: (code: string) => /priority\s*:\s*options\s*\([^)]+\)/.test(code)
      },
      {
        id: "entity_bool",
        description: "Inclure un champ booléen `isDone: boolean`",
        check: (code: string) => /isDone\s*:\s*boolean/.test(code)
      }
    ]
  },
  {
    id: 3,
    title: "3. Manipuler les Données (CRUD)",
    subtitle: "Utiliser les verbes `read`, `set`, `remove`, `search`",
    category: "Verbes de Données",
    icon: "Repeat",
    difficulty: "Intermédiaire",
    estimatedTime: "5 min",
    explanation: `IPL fournit des verbes déclaratifs pour manipuler la donnée sans se soucier du SQL ou du stockage sous-jacent :

- **\`read\`** : Lit un enregistrement depuis un service ou une table.
- **\`set\`** : Modifie une propriété ou un état.
- **\`remove\`** : Supprime un élément d'une collection.
- **\`search\`** : Recherche des éléments selon un critère.

### Exemples :
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
    initialCode: `// Étape 3 : Effectuez les 2 opérations suivantes :
// 1. Lisez la tâche dans 'taskService' où id == req.taskId et stockez-la dans 'currentTask'
// 2. Modifiez l'état de 'currentTask.isDone' à true avec le verbe 'set'

read currentTask from taskService {
  where: id == req.taskId
}

// Écrivez l'instruction 'set' ci-dessous :
`,
    solution: `read currentTask from taskService {
  where: id == req.taskId
}

set currentTask.isDone = true`,
    hint: "Pour modifier une propriété, utilisez `set currentTask.isDone = true`.",
    objectives: [
      {
        id: "read_verb",
        description: "Utiliser `read currentTask from taskService { ... }`",
        check: (code: string) => /read\s+currentTask\s+from\s+taskService/.test(code)
      },
      {
        id: "read_where",
        description: "Spécifier le critère `where: id == req.taskId`",
        check: (code: string) => /where\s*:\s*id\s*==\s*req\.taskId/.test(code)
      },
      {
        id: "set_verb",
        description: "Mettre à jour la tâche avec `set currentTask.isDone = true`",
        check: (code: string) => /set\s+currentTask\.isDone\s*=\s*true/.test(code)
      }
    ]
  },
  {
    id: 4,
    title: "4. Métriques & Calculs",
    subtitle: "Utiliser `compute`, `if` et `for` pour la logique métier",
    category: "Logique & Flux",
    icon: "Cpu",
    difficulty: "Intermédiaire",
    estimatedTime: "5 min",
    explanation: `Les opérations de calcul et de contrôle de flux dans IPL s'expriment naturellement :

- **\`compute\`** : Déclare un calcul métier explicite.
- **\`if (...) { ... } else { ... }\`** : Branchement conditionnel.
- **\`for item in collection { ... }\`** : Boucle d'itération.

### Exemple :
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
    initialCode: `// Étape 4 :
// 1. Calculez une métrique nommée 'completionStats' depuis 'taskList' :
//    completionRate: (completedCount / totalCount) * 100
// 2. Si completionStats.completionRate >= 100, réglez 'project.status = "COMPLETED"' avec 'set'

compute completionStats from taskList {
  completionRate: (completedCount / totalCount) * 100
}

// Ajoutez la condition 'if (...) { ... }' ici :
`,
    solution: `compute completionStats from taskList {
  completionRate: (completedCount / totalCount) * 100
}

if (completionStats.completionRate >= 100) {
  set project.status = "COMPLETED"
}`,
    hint: "Créez une structure `if (completionStats.completionRate >= 100) { set project.status = \"COMPLETED\" }`.",
    objectives: [
      {
        id: "compute_verb",
        description: "Utiliser le verbe `compute` pour calculer `completionRate`",
        check: (code: string) => /compute\s+completionStats\s+from\s+taskList/.test(code)
      },
      {
        id: "if_condition",
        description: "Créer un bloc conditionnel `if (completionStats.completionRate >= 100)`",
        check: (code: string) => /if\s*\(\s*completionStats\.completionRate\s*>=\s*100\s*\)/.test(code)
      },
      {
        id: "set_inside_if",
        description: "Mettre à jour l'état dans le bloc if avec `set project.status = \"COMPLETED\"`",
        check: (code: string) => /set\s+project\.status\s*=\s*["']COMPLETED["']/.test(code)
      }
    ]
  },
  {
    id: 5,
    title: "5. Événements & Gestion d'Erreurs",
    subtitle: "Rendre l'application réactive avec `listen`, `try`, `catch` et `return`",
    category: "Événements & APIs",
    icon: "Zap",
    difficulty: "Avancé",
    estimatedTime: "6 min",
    explanation: `Les applications IPL réagissent aux événements utilisateurs ou système via **\`listen event on "nom:evenement"\`**.

Pour garantir la sécurité et la résilience, les blocs d'accès aux données ou aux services externes doivent être encapsulés dans **\`try { ... } catch (err) { ... }\`**, terminés par **\`return\`** pour renvoyer une réponse structurée.

### Exemple :
\`\`\`ipl
listen event on "user:create" {
  try {
    read newUser from userService {
      where: email == req.email
    }
    send notification to emailService {
      to: newUser.email,
      body: "Bienvenue !"
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
    initialCode: `// Étape 5 : Écoutez l'événement "task:toggle"
// Dans un bloc try/catch :
// 1. Modifiez la tâche
// 2. Envoyez une mise à jour au composant 'taskListView' avec 'send'
// 3. Retournez un objet { status: "SUCCESS" }

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
    hint: "Assurez-vous de posséder `listen event on \"task:toggle\"`, un bloc `try { ... } catch (err) { ... }`, le verbe `send` et un `return { ... }`.",
    objectives: [
      {
        id: "listen_event",
        description: "Écouter l'événement `listen event on \"task:toggle\"`",
        check: (code: string) => /listen\s+event\s+on\s+["']task:toggle["']/.test(code)
      },
      {
        id: "try_catch",
        description: "Utiliser un bloc de sécurité `try { ... } catch (err) { ... }`",
        check: (code: string) => /try\s*\{[\s\S]*\}\s*catch\s*\(\s*err\s*\)\s*\{/.test(code)
      },
      {
        id: "send_verb",
        description: "Dispatch de la mise à jour avec `send update to taskListView`",
        check: (code: string) => /send\s+\w+\s+to\s+taskListView/.test(code)
      },
      {
        id: "return_payload",
        description: "Retourner une réponse structurée avec `return { status: ... }`",
        check: (code: string) => /return\s*\{[\s\S]*status\s*:/.test(code)
      }
    ]
  },
  {
    id: 6,
    title: "6. Projet Final : App de Tâches Intelligente",
    subtitle: "Combiner vues, entités, calculs et événements dans un fichier IPL complet",
    category: "Projet complet",
    icon: "CheckCircle2",
    difficulty: "Avancé",
    estimatedTime: "8 min",
    explanation: `Félicitations ! Vous maîtrisez les concepts fondamentaux d'IPL.

Dans cet exercice final, vous allez créer une **Spécification IPL complète** qui regroupe :
1. Une Vue UI (\`add view TaskAppView\`)
2. Une Entité de données (\`add entity TaskItem\`)
3. Un Gestionnaire d'Événement réactif (\`listen event on "task:create"\`) qui utilise \`try/catch\`, \`compute\`, \`send\` et \`return\`.`,
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
    initialCode: `// Étape 6 (Projet Final) : Écrivez la spécification complète IPL !

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
    hint: "Conservez les trois blocs principaux : `add view TaskAppView`, `add entity TaskItem`, et `listen event on \"task:create\"`.",
    objectives: [
      {
        id: "final_view",
        description: "Contient une vue `add view TaskAppView`",
        check: (code: string) => /add\s+view\s+TaskAppView/.test(code)
      },
      {
        id: "final_entity",
        description: "Contient une entité `add entity TaskItem` avec id, title et boolean",
        check: (code: string) => /add\s+entity\s+TaskItem/.test(code) && /isDone\s*:\s*boolean/.test(code)
      },
      {
        id: "final_listen",
        description: "Contient un gestionnaire d'événement `listen event on \"task:create\"`",
        check: (code: string) => /listen\s+event\s+on\s+["']task:create["']/.test(code)
      },
      {
        id: "final_robustness",
        description: "Contient `try`, `compute`, `send` et `return` dans le bloc d'événement",
        check: (code: string) => /try/.test(code) && /compute/.test(code) && /send/.test(code) && /return/.test(code)
      }
    ]
  }
];
