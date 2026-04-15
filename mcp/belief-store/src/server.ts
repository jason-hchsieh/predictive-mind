#!/usr/bin/env node
/**
 * belief-store MCP server.
 *
 * Exposes three Phase 1 tools:
 *   - store_prediction
 *   - record_observation
 *   - retrieve_beliefs
 *
 * More tools (recall_similar_episodes, update_belief, snapshot/rollback,
 * score_skill_reliability) arrive in Phase 2 and Phase 3.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { openDb, resolveDbPath } from './db.js';
import { jaccardSimilarity } from './similarity.js';

const db = openDb(resolveDbPath());

const server = new Server(
  { name: 'belief-store', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

const TOOLS = [
  {
    name: 'store_prediction',
    description:
      'Record an explicit predicted observation BEFORE a side-effecting tool call. Returns an action_id. The PostToolUse hook will reconcile the prediction automatically using tool_name + tool_input_hash matching.',
    inputSchema: {
      type: 'object',
      required: ['task_id', 'action', 'expected'],
      properties: {
        task_id: {
          type: 'string',
          description:
            'Stable ID for the current task (e.g. the session_id or a user-chosen label). Group predictions by task.',
        },
        action: {
          type: 'string',
          description:
            'Short description of the action about to be taken. Example: "Edit src/auth.ts: add null-check for token".',
        },
        expected: {
          type: 'string',
          description:
            'Explicit falsifiable predicted observation. Good: "pytest -q prints 14 passed, 0 failed, exit 0". Bad: "tests will pass".',
        },
        confidence: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description:
            'Subjective confidence in the prediction (0..1). Treated as ordinal, not a probability.',
        },
        tool_name: {
          type: 'string',
          description:
            'Name of the tool that will be invoked (e.g. "Bash", "Edit"). Used by PostToolUse reconciliation.',
        },
        tool_input_hash: {
          type: 'string',
          description:
            'Optional stable hash of the tool input, to disambiguate when multiple predictions target the same tool. The hook recomputes the hash on the observed tool_input and matches.',
        },
      },
    },
  },
  {
    name: 'record_observation',
    description:
      'Record the actual observation for a prior prediction and its surprise score. Normally called by the PostToolUse hook, not by the model. Exposed here for manual /reconcile use.',
    inputSchema: {
      type: 'object',
      required: ['action_id', 'actual', 'surprise_score'],
      properties: {
        action_id: { type: 'integer' },
        actual: { type: 'string' },
        surprise_score: {
          type: 'number',
          minimum: 0,
          maximum: 1,
          description: 'Higher = more surprising. 0 = matched prediction.',
        },
      },
    },
  },
  {
    name: 'retrieve_beliefs',
    description:
      'List recent predictions and their reconciliation status for a task. Call this before deciding the next action to see what you already predicted and how surprising it turned out to be.',
    inputSchema: {
      type: 'object',
      required: ['task_id'],
      properties: {
        task_id: { type: 'string' },
        limit: { type: 'integer', default: 20, minimum: 1, maximum: 200 },
        only_surprising: {
          type: 'boolean',
          default: false,
          description:
            'If true, return only predictions whose surprise_score >= 0.5.',
        },
      },
    },
  },
  {
    name: 'recall_similar_episodes',
    description:
      'Non-parametric M: retrieve past reconciled predictions (across all tasks) whose action/expected text is most similar to the given context. Use BEFORE planning to see how similar situations turned out. Returns episodes sorted by similarity, higher = more similar.',
    inputSchema: {
      type: 'object',
      required: ['context'],
      properties: {
        context: {
          type: 'string',
          description:
            'The current situation to match against — typically a concatenation of the candidate action and relevant task-card fields.',
        },
        k: {
          type: 'integer',
          default: 5,
          minimum: 1,
          maximum: 25,
          description: 'Number of nearest episodes to return.',
        },
        tool_name: {
          type: 'string',
          description:
            'Optional filter: restrict recall to episodes that invoked this tool.',
        },
        min_similarity: {
          type: 'number',
          default: 0.1,
          minimum: 0,
          maximum: 1,
          description: 'Discard episodes below this similarity threshold.',
        },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  if (name === 'store_prediction') {
    const stmt = db.prepare(`
      INSERT INTO predictions
        (task_id, action, expected, confidence, tool_name, tool_input_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      String(a.task_id),
      String(a.action),
      String(a.expected),
      typeof a.confidence === 'number' ? a.confidence : 0.5,
      a.tool_name ? String(a.tool_name) : null,
      a.tool_input_hash ? String(a.tool_input_hash) : null
    );
    return textResult({ action_id: info.lastInsertRowid, ok: true });
  }

  if (name === 'record_observation') {
    const stmt = db.prepare(`
      UPDATE predictions
         SET actual = ?, surprise_score = ?, observed_at = datetime('now')
       WHERE action_id = ?
    `);
    const info = stmt.run(
      String(a.actual),
      Number(a.surprise_score),
      Number(a.action_id)
    );
    return textResult({ updated: info.changes });
  }

  if (name === 'retrieve_beliefs') {
    const limit = typeof a.limit === 'number' ? a.limit : 20;
    const onlySurprising = a.only_surprising === true;
    const sql = onlySurprising
      ? `SELECT action_id, action, expected, confidence, actual,
                surprise_score, created_at, observed_at
           FROM predictions
          WHERE task_id = ? AND surprise_score >= 0.5
          ORDER BY action_id DESC LIMIT ?`
      : `SELECT action_id, action, expected, confidence, actual,
                surprise_score, created_at, observed_at
           FROM predictions
          WHERE task_id = ?
          ORDER BY action_id DESC LIMIT ?`;
    const rows = db.prepare(sql).all(String(a.task_id), limit);
    return textResult(rows);
  }

  if (name === 'recall_similar_episodes') {
    const context = String(a.context ?? '');
    const k = typeof a.k === 'number' ? a.k : 5;
    const minSim =
      typeof a.min_similarity === 'number' ? a.min_similarity : 0.1;
    const toolFilter = a.tool_name ? String(a.tool_name) : null;

    type EpisodeRow = {
      action_id: number;
      task_id: string;
      action: string;
      expected: string;
      actual: string;
      surprise_score: number;
      tool_name: string | null;
      observed_at: string;
    };

    const sql = toolFilter
      ? `SELECT action_id, task_id, action, expected, actual,
                surprise_score, tool_name, observed_at
           FROM predictions
          WHERE actual IS NOT NULL AND tool_name = ?
          ORDER BY action_id DESC
          LIMIT 500`
      : `SELECT action_id, task_id, action, expected, actual,
                surprise_score, tool_name, observed_at
           FROM predictions
          WHERE actual IS NOT NULL
          ORDER BY action_id DESC
          LIMIT 500`;
    const rows = (toolFilter
      ? db.prepare(sql).all(toolFilter)
      : db.prepare(sql).all()) as EpisodeRow[];

    const scored = rows
      .map((r) => {
        const haystack = `${r.action} ${r.expected}`;
        const similarity = jaccardSimilarity(context, haystack);
        return { ...r, similarity };
      })
      .filter((r) => r.similarity >= minSim)
      .sort((x, y) => y.similarity - x.similarity)
      .slice(0, k);

    return textResult(scored);
  }

  throw new Error(`Unknown tool: ${name}`);
});

function textResult(obj: unknown) {
  return {
    content: [
      { type: 'text' as const, text: JSON.stringify(obj, null, 2) },
    ],
  };
}

const transport = new StdioServerTransport();
await server.connect(transport);
