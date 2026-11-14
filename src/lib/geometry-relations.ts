export type MidpointRelation = { point: string; ends: [string, string] };

/** Read standalone math names, never a final letter in a Vietnamese word. */
export function readMidpointRelations(source: string): {
  relations: MidpointRelation[];
  issues: string[];
} {
  const relations: MidpointRelation[] = [];
  const issues: string[] = [];
  const add = (point: string, edge: string) => {
    const ends = edge.replace(/\s/g, "").toUpperCase().split("") as [
      string,
      string,
    ];
    point = point.trim().toUpperCase();
    const existing = relations.find((item) => item.point === point);
    if (existing) {
      if (
        existing.ends.slice().sort().join("") !== ends.slice().sort().join("")
      )
        issues.push(
          `Điểm ${point} được khai báo là trung điểm của hai cạnh khác nhau.`,
        );
      return;
    }
    relations.push({ point, ends });
  };
  const grouped =
    /(?<![\p{L}\p{N}_])([A-Za-z](?:\s*(?:,|và)\s*[A-Za-z]){1,7})(?![\p{L}\p{N}_])\s+lần\s+lượt\s+(?:là\s+)?(?:các\s+)?trung\s*điểm\s*(?:của\s*)?(?:các\s*)?(?:(?:cạnh|đoạn\s*thẳng|đoạn)\s*)?([A-Za-z]\s*[A-Za-z](?:\s*(?:,|và)\s*[A-Za-z]\s*[A-Za-z]){1,7})(?![\p{L}\p{N}_])/giu;
  for (const match of source.matchAll(grouped)) {
    const points = match[1].split(/\s*(?:,|và)\s*/iu);
    const edges = match[2].split(/\s*(?:,|và)\s*/iu);
    if (points.length !== edges.length) {
      issues.push(
        "Danh sách điểm và cạnh trong quan hệ trung điểm lần lượt chưa khớp số lượng.",
      );
      continue;
    }
    points.forEach((point, index) => add(point, edges[index]));
  }
  const single =
    /(?<![\p{L}\p{N}_])([A-Za-z])(?![\p{L}\p{N}_])\s*(?:là\s*)?trung\s*điểm\s*(?:của\s*)?(?:(?:cạnh|đoạn\s*thẳng|đoạn)\s*)?([A-Za-z]\s*[A-Za-z])(?![\p{L}\p{N}_])/giu;
  for (const match of source.matchAll(single)) add(match[1], match[2]);
  return { relations, issues };
}
