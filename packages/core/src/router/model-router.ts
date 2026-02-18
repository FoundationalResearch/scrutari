export type TaskType = 'extract' | 'analyze' | 'synthesize' | 'verify' | 'format';
export type Complexity = 'low' | 'medium' | 'high';

export interface ModelRoute {
  task: TaskType;
  complexity: Complexity;
  model?: string; // explicit per-stage override from skill YAML
}

const DEFAULT_HAIKU = 'claude-haiku-3-5-20241022';
const DEFAULT_SONNET = 'claude-sonnet-4-20250514';

// Default routing table: task x complexity → model
const ROUTING_TABLE: Record<TaskType, Record<Complexity, string>> = {
  extract: {
    low: DEFAULT_HAIKU,
    medium: DEFAULT_HAIKU,
    high: DEFAULT_SONNET,
  },
  analyze: {
    low: DEFAULT_SONNET,
    medium: DEFAULT_SONNET,
    high: DEFAULT_SONNET,
  },
  synthesize: {
    low: DEFAULT_SONNET,
    medium: DEFAULT_SONNET,
    high: DEFAULT_SONNET,
  },
  verify: {
    low: DEFAULT_SONNET,
    medium: DEFAULT_SONNET,
    high: DEFAULT_SONNET,
  },
  format: {
    low: DEFAULT_HAIKU,
    medium: DEFAULT_SONNET,
    high: DEFAULT_SONNET,
  },
};

/**
 * Resolve which model to use for a given route.
 *
 * Priority:
 *   1. globalOverride (--model flag) — forces all stages to one model
 *   2. route.model (per-stage override from skill YAML)
 *   3. Default routing table (task × complexity)
 */
export function resolveModel(route: ModelRoute, globalOverride?: string): string {
  if (globalOverride) {
    return globalOverride;
  }
  if (route.model) {
    return route.model;
  }
  return ROUTING_TABLE[route.task][route.complexity];
}

/** Return a deep copy of the default routing table (for display / debugging). */
export function getRoutingTable(): Record<TaskType, Record<Complexity, string>> {
  return JSON.parse(JSON.stringify(ROUTING_TABLE)) as Record<TaskType, Record<Complexity, string>>;
}
