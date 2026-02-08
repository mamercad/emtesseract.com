/**
 * Pure utilities for agents-at-work workers.
 * Kept in a separate module for testability.
 */

const DEFAULT_MAX_TURN_CHARS = 120;

/**
 * Sanitize dialogue text for roundtable turns.
 * @param {string} text - Raw text
 * @param {number} [maxChars] - Max length (default 120)
 * @returns {string}
 */
export function sanitize(text, maxChars = DEFAULT_MAX_TURN_CHARS) {
  if (!text) return "";
  let s = String(text).trim().slice(0, maxChars);
  s = s.replace(/https?:\/\/\S+/g, "[link]");
  return s || "...";
}

/**
 * Simple hash for content deduplication (e.g. source_trace_id).
 * @param {string} s
 * @returns {string}
 */
export function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}
