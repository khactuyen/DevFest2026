import { algebra, transform } from "./algebra";
import { calculus } from "./calculus";
import { linearSystem, matrix } from "./linear";
import { discrete, vectors } from "./discrete";
import { transcendental } from "./transcendental";
import { sequences } from "./sequences";
import type { ExactResult } from "./types";
export type { ExactResult } from "./types";
/** Each plugin must consume the complete source. A failure is unsupported, never
 * a license to silently truncate a problem or use a numerical guess as proof. */
export function analyzeExtended(source: string): ExactResult | null {
  if (!source.trim() || source.length > 4000) return null;
  for (const solver of [
    linearSystem,
    matrix,
    calculus,
    sequences,
    discrete,
    vectors,
    transform,
    transcendental,
    algebra,
  ]) {
    try {
      const result = solver(source);
      if (
        result &&
        result.domain.length <= 300 &&
        result.answer.length <= 4000 &&
        result.methods.length <= 4 &&
        result.methods.every(
          (m) =>
            m.steps.length <= 10 &&
            m.steps.every(
              (step) => step.content.length >= 5 && step.content.length <= 6000,
            ),
        )
      )
        return result;
    } catch {
      /* Try another exact grammar, otherwise retain the reasoning fallback. */
    }
  }
  return null;
}
