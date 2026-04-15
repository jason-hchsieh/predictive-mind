import { createHash } from 'node:crypto';
/**
 * Stable hash of a tool input. Used by both the model (when storing a
 * prediction) and the PostToolUse hook (when looking it up) so
 * reconciliation is deterministic.
 */
export function hashToolInput(input) {
    return createHash('sha1').update(canonicalize(input)).digest('hex');
}
function canonicalize(value) {
    return JSON.stringify(sortKeys(value));
}
function sortKeys(value) {
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (value && typeof value === 'object') {
        const entries = Object.entries(value)
            .map(([k, v]) => [k, sortKeys(v)])
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
        return Object.fromEntries(entries);
    }
    return value;
}
