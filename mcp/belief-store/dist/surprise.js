/**
 * Surprise metric for Phase 1.
 *
 * This is DELIBERATELY CRUDE. Phase 1 is about BOOKKEEPING — recording
 * predictions and observations so surprise becomes a first-class signal
 * at all. A calibrated metric (LLM-as-judge, structured diff for
 * test-count / type-error predictions) lands in a later phase.
 *
 * Returns a scalar in [0, 1]. 0 = no surprise, 1 = maximally surprising.
 */
export function computeSurprise(expected, actual) {
    const e = normalize(expected);
    const a = normalize(actual);
    if (!e)
        return 0;
    if (e === a)
        return 0;
    if (a.includes(e) || e.includes(a))
        return 0.2;
    // Jaccard distance over word tokens — cheap, no deps, good enough to
    // differentiate "14 passed" vs "14 failed" from "completely unrelated".
    const te = tokenSet(e);
    const ta = tokenSet(a);
    if (te.size === 0 && ta.size === 0)
        return 0;
    let inter = 0;
    for (const t of te)
        if (ta.has(t))
            inter++;
    const union = te.size + ta.size - inter;
    const jaccard = union === 0 ? 0 : inter / union;
    return clamp01(1 - jaccard);
}
function normalize(s) {
    return s.trim().toLowerCase();
}
function tokenSet(s) {
    return new Set(s.split(/\W+/).filter(Boolean));
}
function clamp01(x) {
    if (Number.isNaN(x))
        return 0;
    return Math.max(0, Math.min(1, x));
}
