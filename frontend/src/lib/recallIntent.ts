/**
 * Detect if a transcribed question is asking about something from the past
 * (recall) versus something about the current scene (regular ask).
 *
 * Heuristic only — not perfect. Errs toward calling /query (regular ask)
 * since that always works; /recall on a non-recall question still works
 * but adds latency from the retrieval step.
 *
 * Examples that should match recall:
 *   "where did I put my keys"
 *   "where are my keys"
 *   "what did I do earlier"
 *   "kahan rakhi thi"  (Roman Urdu: "where did I put it")
 *   "ye jagah pehle dekhi thi"  (Roman Urdu: "I saw this place before")
 *
 * Examples that should NOT match (regular ask):
 *   "what is in front of me"
 *   "is this safe to eat"
 *   "what color is this"
 *   "yeh kya hai"  (Roman Urdu: "what is this")
 */
export function looksLikeRecall(question: string): boolean {
  const q = question.toLowerCase();

  // English recall phrases
  const englishPatterns = [
    /where did i (put|leave|place)/,
    /where (is|are) my/,
    /where (are|is) the /,
    /what did i (do|see|put)/,
    /\bearlier\b/,
    /\byesterday\b/,
    /\blast (time|night|week)\b/,
    /(do you )?remember/,
    /\bbefore\b.*\?/,
  ];

  // Roman Urdu recall phrases (transliterated common patterns)
  const urduPatterns = [
    /\bkahan\b/, // "where" (e.g., "kahan rakha tha")
    /\bpehle\b/, // "before/earlier"
    /\brakhi (thi|tha)\b/, // "had placed"
    /\bdekhi thi\b/, // "had seen"
    /\byaad\b/, // "remember"
  ];

  return [...englishPatterns, ...urduPatterns].some((p) => p.test(q));
}
