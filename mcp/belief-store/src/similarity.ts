/**
 * Non-parametric similarity for the recall_similar_episodes tool.
 *
 * Phase 2 uses token-overlap (Jaccard over word tokens) rather than
 * embeddings. Rationale: no extra dependency, no model to run, works
 * well enough as a first-cut "this past episode looks like the current
 * situation" signal. A learned embedding is a later upgrade.
 */
export function jaccardSimilarity(a: string, b: string): number {
  const ta = tokenSet(a);
  const tb = tokenSet(b);
  if (ta.size === 0 && tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenSet(s: string): Set<string> {
  return new Set(s.toLowerCase().split(/\W+/).filter((t) => t.length > 1));
}
