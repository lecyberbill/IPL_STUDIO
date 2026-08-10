import type { CustomTarget, IPLProject, PolyglotConfig } from './types';

export const DEFAULT_PROJECTS: IPLProject[] = [
  {
    id: 'proj-typed-order',
    name: '[Exemple] Typed E-Commerce Order Spec',
    targetLang: 'rust',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - Typed E-Commerce Order Spec (Human Intent Types)
add entity Order {
  id: id,
  customerName: text,
  totalAmount: number,
  isPaid: boolean,
  createdAt: date,
  status: options("pending", "processing", "shipped", "delivered")
}

listen event on "checkout:completed" {
  read orderData from event {
    where: totalAmount > 0
  }

  if (orderData.isPaid == true) {
    set orderData.status = "processing"
    send confirmationEmail to orderData.customerName {
      subject: "Order Confirmation",
      orderId: orderData.id
    }
  } else {
    set orderData.status = "pending"
  }
}`
  },
  {
    id: 'proj-stresstest',
    name: '[Exemple] Architecture Enterprise System',
    targetLang: 'python',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL v1.0 - Enterprise Multi-Services System Architecture Spec

add datacenter {
  name: "Eu-Central-Datacenter",
  region: "eu-west-1",
  nodes: 64,
  clusterState: "active"
}

add queue {
  name: "high-priority-tasks",
  maxCapacity: 10000,
  retryPolicy: "exponential-backoff"
}

listen event on "user:payment_completed" {
  try {
    read paymentDetails from eventData {
      where: amount > 0 && status == "settled"
    }

    compute taxDeduction from paymentDetails {
      rate: 0.20,
      applyExemption: false
    }

    if (paymentDetails.amount >= 5000) {
      add vipOrder {
        userId: paymentDetails.userId,
        amount: paymentDetails.amount,
        flag: "HIGH_VAL_TRANSACTION"
      }
      send alert to complianceTeam {
        channel: "slack-vip-channel",
        priority: "CRITICAL"
      }
    } else {
      add standardOrder {
        userId: paymentDetails.userId,
        amount: paymentDetails.amount
      }
    }

    search inventory in warehouse {
      query: paymentDetails.items,
      limit: 100
    }

    for item in inventory {
      if (item.stock < item.minimumThreshold) {
        send restockOrder to supplier {
          itemId: item.id,
          qtyNeeded: 500
        }
        set item.status = "restock_pending"
      } else {
        set item.stock = item.stock - item.quantity
      }
    }

    return {
      status: "SUCCESS",
      processedCount: inventory.length
    }

  } catch (err) {
    send log to centralizedLogging {
      level: "ERROR",
      message: err.message,
      stackTrace: err.stack
    }
    remove transientSession from memoryStore {
      where: sessionId == eventData.sessionId
    }
    return {
      status: "FAILED",
      reason: err.message
    }
  }
}`
  },
  {
    id: 'proj-ecommerce',
    name: '[Exemple] E-Commerce Dashboard',
    targetLang: 'python',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - E-Commerce Dashboard
add catalog {
  name: "IPL Studio Store",
  currency: "USD"
}

read products from catalog {
  where: stock > 0
}

compute totalValue from products {
  taxRate: 0.20
}

if (totalValue > 1000) {
  send alert to manager {
    message: "High sales volume detected"
  }
}`
  },
  {
    id: 'proj-form',
    name: '[Exemple] Formulaire d\'Inscription',
    targetLang: 'javascript',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - User Registration Form
add form {
  title: "Member Registration",
  fields: ["email", "password"]
}

listen event on "form:submit" {
  read email from form
  if (email != "") {
    send welcome to email
    set status = "success"
  } else {
    set status = "error"
  }
}`
  },
  {
    id: 'proj-hello',
    name: '[Exemple] Hello World Application',
    targetLang: 'html',
    updatedAt: new Date().toLocaleTimeString(),
    code: `// IPL Project v1.0 - Hello World
add message {
  text: "Hello World IPL Studio v1.3.0",
  target: "console"
}

compute timestamp from system
send message to screen
return success`
  }
];

export const DEFAULT_CUSTOM_TARGETS: CustomTarget[] = [
  {
    id: 'java',
    name: '☕ Java 21 Spring Boot (.java)',
    extension: 'java',
    promptInstructions: 'Generate a complete multi-file Java 21 Spring Boot enterprise application.'
  },
  {
    id: 'k8s',
    name: '☸️ Kubernetes Manifests (.yaml)',
    extension: 'yaml',
    promptInstructions: 'Generate complete Kubernetes production manifests (Deployment, Service, Ingress).'
  }
];

export const DEFAULT_POLYGLOT_CONFIG: PolyglotConfig = {
  autoDecide: true,
  layers: [
    { id: 'l-1', role: 'Backend API', tech: 'Python 3 (FastAPI / Flask)' },
    { id: 'l-2', role: 'Frontend UI', tech: 'HTML5 / JavaScript (Vanilla / Tailwind)' }
  ]
};

export const DEFAULT_LAYOUT = {
  leftSidebarWidth: 280,
  rightSidebarWidth: 520
};
