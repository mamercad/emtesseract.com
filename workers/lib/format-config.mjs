/**
 * Roundtable format configuration.
 * Exported for testability.
 */

const FORMATS = {
  watercooler: { minTurns: 2, maxTurns: 5, temperature: 0.9 },
  standup: { minTurns: 4, maxTurns: 8, temperature: 0.6 },
  debate: { minTurns: 4, maxTurns: 8, temperature: 0.8 },
};

const DEFAULT = { minTurns: 2, maxTurns: 5, temperature: 0.9 };

/**
 * Get format config for a roundtable session.
 * @param {string} format - Format name (watercooler, standup, debate)
 * @returns {{ minTurns: number, maxTurns: number, temperature: number }}
 */
export function getFormatConfig(format) {
  return FORMATS[format] ?? DEFAULT;
}
