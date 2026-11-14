import { request } from "./client";
import type { VisualPatternSummary } from "./visual-patterns";

let pending: Promise<VisualPatternSummary[]> | undefined;
let cached: { items: VisualPatternSummary[]; until: number } | undefined;

// The model catalog is public and independent of the signed-in account.
export function loadVisualPatternCatalog(): Promise<VisualPatternSummary[]> {
  if (cached && Date.now() < cached.until) return Promise.resolve(cached.items);
  return pending ??= request<VisualPatternSummary[]>("/api/visual-patterns")
    .then((items) => {
      cached = { items, until: Date.now() + 5 * 60_000 };
      return items;
    })
    .finally(() => { pending = undefined; });
}
