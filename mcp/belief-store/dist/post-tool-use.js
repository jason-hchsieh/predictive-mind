#!/usr/bin/env node
/**
 * PostToolUse hook.
 *
 * Contract (Claude Code hook protocol):
 *   - stdin: JSON event with { tool_name, tool_input, tool_response, ... }
 *   - stdout: optional JSON with hookSpecificOutput to inject context
 *             into the next turn
 *   - exit 0: non-blocking
 *
 * Behavior:
 *   1. Look up an open prediction matching (tool_name, tool_input_hash).
 *      Fall back to most-recent open prediction for that tool if no hash
 *      match — the model may not always provide a hash.
 *   2. Compute surprise = computeSurprise(expected, actual).
 *   3. Persist the observation.
 *   4. If surprise >= threshold, emit a PostToolUse additionalContext
 *      notice so the next turn sees the prediction error as context.
 *
 * The hook NEVER blocks the tool call itself — by the time PostToolUse
 * fires, the call has already happened. Its job is bookkeeping + a
 * passive signal to the next turn.
 */
import { readFileSync } from 'node:fs';
import { openDb, resolveDbPath } from './db.js';
import { computeSurprise } from './surprise.js';
import { hashToolInput } from './hash.js';
const SURPRISE_THRESHOLD = Number(process.env.PM_SURPRISE_THRESHOLD ?? '0.6');
function readStdin() {
    try {
        return readFileSync(0, 'utf8');
    }
    catch {
        return '';
    }
}
function toObservationText(response) {
    if (typeof response === 'string')
        return response;
    if (response == null)
        return '';
    try {
        return JSON.stringify(response);
    }
    catch {
        return String(response);
    }
}
function safeExit() {
    // Exit 0 on any error: the hook must never break the main loop.
    process.exit(0);
}
async function main() {
    const raw = readStdin();
    if (!raw.trim())
        safeExit();
    let event;
    try {
        event = JSON.parse(raw);
    }
    catch {
        safeExit();
    }
    const toolName = event.tool_name;
    if (!toolName)
        safeExit();
    const db = openDb(resolveDbPath());
    const hash = hashToolInput(event.tool_input);
    const byHash = db
        .prepare(`SELECT action_id, expected, action
         FROM predictions
        WHERE tool_name = ?
          AND tool_input_hash = ?
          AND actual IS NULL
        ORDER BY action_id DESC
        LIMIT 1`)
        .get(toolName, hash);
    const byTool = byHash
        ? undefined
        : db
            .prepare(`SELECT action_id, expected, action
             FROM predictions
            WHERE tool_name = ?
              AND actual IS NULL
            ORDER BY action_id DESC
            LIMIT 1`)
            .get(toolName);
    const match = byHash ?? byTool;
    if (!match)
        safeExit();
    const actual = toObservationText(event.tool_response);
    const surprise = computeSurprise(match.expected, actual);
    db.prepare(`UPDATE predictions
        SET actual = ?, surprise_score = ?, observed_at = datetime('now')
      WHERE action_id = ?`).run(actual, surprise, match.action_id);
    if (surprise >= SURPRISE_THRESHOLD) {
        const notice = {
            hookSpecificOutput: {
                hookEventName: 'PostToolUse',
                additionalContext: `[predictive-mind] High prediction error for ${toolName} ` +
                    `(surprise=${surprise.toFixed(2)}, action_id=${match.action_id}).\n` +
                    `Predicted: ${truncate(match.expected, 400)}\n` +
                    `Observed:  ${truncate(actual, 400)}\n` +
                    `Consider /reflect to update beliefs, or /probe to re-ground ` +
                    `before the next action.`,
            },
        };
        process.stdout.write(JSON.stringify(notice));
    }
    process.exit(0);
}
function truncate(s, n) {
    return s.length <= n ? s : s.slice(0, n) + '…';
}
main().catch(() => safeExit());
