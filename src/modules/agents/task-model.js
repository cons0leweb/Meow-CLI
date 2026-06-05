/**
 * Task model & attempt tracking types for Meow CLI v3.
 * Provides formal TaskState, AttemptState enums, and factory functions.
 *
 * TaskState: lifecycle of the task itself.
 *   PENDING   – queued, not yet started
 *   RUNNING   – actively being executed
 *   BLOCKED   – cannot proceed (e.g. missing dependency, permission denied)
 *   COMPLETED – finished successfully
 *   REPLACED  – superseded by a newer task / merged
 *
 * AttemptState: outcome of a single tool-call / action within a task.
 *   STARTED    – tool invocation began
 *   SUCCEEDED  – tool returned successfully
 *   FAILED     – tool returned an error
 *   TIMED_OUT  – tool call exceeded its budget
 *   CANCELLED  – user or system cancelled mid-flight
 */

/** @enum {string} */
export const TaskState = Object.freeze({
  PENDING:   "PENDING",
  RUNNING:   "RUNNING",
  BLOCKED:   "BLOCKED",
  COMPLETED: "COMPLETED",
  REPLACED:  "REPLACED",
});

/** @enum {string} */
export const AttemptState = Object.freeze({
  STARTED:   "STARTED",
  SUCCEEDED: "SUCCEEDED",
  FAILED:    "FAILED",
  TIMED_OUT: "TIMED_OUT",
  CANCELLED: "CANCELLED",
});

/** Default max attempts per task */
export const DEFAULT_MAX_ATTEMPTS = 10;

/**
 * Creates an Attempt record for the attemptHistory array.
 * @param {string} toolName - Name of the tool invoked
 * @param {Object} [args={}] - Arguments passed to the tool
 * @param {string|null} [result=null] - Tool result (may be truncated)
 * @param {AttemptState} [state=AttemptState.STARTED] - Outcome state
 * @param {number} [timestamp=Date.now()] - When the attempt occurred
 * @returns {Object}
 */
export function createAttempt({ toolName, args = {}, result = null, state = AttemptState.STARTED, timestamp = Date.now() } = {}) {
  return {
    toolName,
    args: { ...args },
    result,
    state,
    timestamp,
  };
}

/**
 * Creates a new Task object with default values.
 * @param {Object} params
 * @param {string} params.description - Task description / goal
 * @param {string} [params.category="refactor"] - Category id (fix_bugs, add_tests, etc.)
 * @param {number} [params.priority=3] - Priority 1 (highest) – 5 (lowest)
 * @param {string} [params.reason=""] - Why this task was selected
 * @param {string[]} [params.files=[]] - Files involved
 * @param {boolean} [params.parallel=false] - Can run in parallel with others
 * @param {number} [params.maxAttempts=DEFAULT_MAX_ATTEMPTS] - Max tool-level attempts
 * @returns {Object}
 */
export function createTask({
  description,
  category = "refactor",
  priority = 3,
  reason = "",
  files = [],
  parallel = false,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
} = {}) {
  return {
    // Task identity
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    description,
    category,
    priority,
    reason,
    files: [...files],
    parallel,

    // Lifecycle
    state: TaskState.PENDING,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,

    // Attempt tracking
    attempts: 0,
    maxAttempts,
    attemptHistory: [],

    // Result
    result: null,
    error: null,

    // Metadata
    costUsd: 0,
    tokensUsed: 0,
    elapsedMs: 0,
  };
}

/**
 * Normalises a suggestion object (from AI) into a full Task model.
 * @param {Object} suggestion - Raw suggestion from suggestNextTasks
 * @returns {Object} Full Task object
 */
export function fromSuggestion(suggestion) {
  return createTask({
    description: suggestion.task || suggestion.description || "",
    category: suggestion.category || "refactor",
    priority: suggestion.priority ?? 3,
    reason: suggestion.reason || "",
    files: suggestion.files || [],
    parallel: !!suggestion.parallel,
  });
}

/**
 * Returns a shallow copy of a task with an attempt record appended.
 * Mutates the original task in-place (for efficiency) and returns it.
 * @param {Object} task - The task object
 * @param {Object} attemptParams - See createAttempt()
 * @returns {Object} The same task object (mutated)
 */
export function recordAttempt(task, attemptParams = {}) {
  task.attempts = (task.attempts || 0) + 1;
  if (!task.attemptHistory) task.attemptHistory = [];
  task.attemptHistory.push(createAttempt(attemptParams));
  return task;
}

/**
 * Returns whether the task has exhausted all allowed attempts.
 * @param {Object} task
 * @returns {boolean}
 */
export function isAttemptsExhausted(task) {
  return (task.attempts || 0) >= (task.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
}

/**
 * Transitions task to a new state with a timestamp side-effect.
 * @param {Object} task
 * @param {TaskState} newState
 * @returns {Object} The same task (mutated)
 */
export function transitionTask(task, newState) {
  task.state = newState;
  if (newState === TaskState.RUNNING && !task.startedAt) {
    task.startedAt = Date.now();
  }
  if ((newState === TaskState.COMPLETED || newState === TaskState.REPLACED || newState === TaskState.BLOCKED) && !task.completedAt) {
    task.completedAt = Date.now();
  }
  return task;
}
