import { z } from "zod";
export const BoardItemSchema = z
  .object({
    id: z.string().regex(/^[a-zA-Z][\w-]{0,63}$/),
    kind: z.enum([
      "text",
      "formula",
      "image",
      "table",
      "bar",
      "line",
      "pie",
      "histogram",
      "boxplot",
      "tree",
      "venn",
      "intervals",
      "network",
    ]),
    x: z.number().finite().min(-1e5).max(1e5),
    y: z.number().finite().min(-1e5).max(1e5),
    width: z.number().finite().min(80).max(3000),
    height: z.number().finite().min(50).max(3000),
    text: z.string().max(10000).default(""),
    cells: z
      .array(z.array(z.string().max(500)).max(20))
      .max(50)
      .optional(),
    data: z.array(z.number().finite().min(-1e8).max(1e8)).max(200).optional(),
    labels: z.array(z.string().max(100)).max(200).optional(),
    image: z
      .string()
      .max(1800000)
      .regex(/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
      .optional(),
    assetUrl: z.string()
      .regex(/^\/api\/material-assets\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(png|jpg|webp)$/i)
      .optional(),
    regions: z.array(z.number().int().min(0).max(7)).max(8).optional(),
    setCount: z.union([z.literal(2), z.literal(3)]).optional(),
    graphEdges: z
      .array(
        z.tuple([
          z.number().int().min(0).max(11),
          z.number().int().min(0).max(11),
        ]),
      )
      .max(66)
      .optional(),
    visible: z.boolean().default(true),
    fontSize: z.number().min(10).max(80).default(18),
    graphLink: z
      .object({
        sourceId: z.string().min(1).max(64),
        mode: z.enum(["variation", "sign"]),
        min: z.number().finite(),
        max: z.number().finite(),
        manual: z.boolean().default(false),
      })
      .strict()
      .optional(),
  })
  .strict();
export type BoardItem = z.infer<typeof BoardItemSchema>;
export function freeBoardPosition(
  items: Pick<BoardItem, "x" | "y" | "width" | "height" | "visible">[],
  width: number,
  height: number,
  boardWidth = 1200,
  boardHeight = 650,
) {
  for (
    let y = 18;
    y + height <= Math.max(height + 18, boardHeight - 18);
    y += 32
  )
    for (
      let x = 18;
      x + width <= Math.max(width + 18, boardWidth - 18);
      x += 32
    )
      if (
        items.every(
          (i) =>
            !i.visible ||
            x + width + 12 < i.x ||
            i.x + i.width + 12 < x ||
            y + height + 12 < i.y ||
            i.y + i.height + 12 < y,
        )
      )
        return { x, y };
  return { x: 18 + (items.length % 4) * 24, y: 18 + (items.length % 4) * 24 };
}
export function histogramBins(
  data: number[],
  count = Math.max(1, Math.ceil(Math.sqrt(data.length))),
) {
  if (
    !data.length ||
    data.some((x) => !Number.isFinite(x)) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 50
  )
    throw Error("Dữ liệu hoặc số nhóm không hợp lệ.");
  const min = Math.min(...data),
    max = Math.max(...data),
    width = (max - min || 1) / count,
    bins = Array.from({ length: count }, (_, i) => ({
      from: min + i * width,
      to: min + (i + 1) * width,
      count: 0,
    }));
  for (const value of data)
    bins[Math.min(count - 1, Math.floor((value - min) / width))].count++;
  return bins;
}
export function descriptiveStatistics(data: number[]) {
  if (!data.length || data.some((x) => !Number.isFinite(x)))
    throw Error("Cần ít nhất một số hữu hạn.");
  const s = [...data].sort((a, b) => a - b),
    n = s.length,
    mean = s.reduce((a, b) => a + b, 0) / n;
  const quantile = (q: number) => {
    const i = (n - 1) * q,
      j = Math.floor(i);
    return s[j] + (s[Math.min(n - 1, j + 1)] - s[j]) * (i - j);
  };
  const variance = s.reduce((v, x) => v + (x - mean) ** 2, 0) / n;
  return {
    count: n,
    min: s[0],
    q1: quantile(0.25),
    median: quantile(0.5),
    q3: quantile(0.75),
    max: s[n - 1],
    mean,
    variance,
    standardDeviation: Math.sqrt(variance),
  };
}
export function bayesProbability(
  prior: number,
  likelihood: number,
  falsePositive: number,
) {
  if (
    [prior, likelihood, falsePositive].some(
      (p) => !Number.isFinite(p) || p < 0 || p > 1,
    )
  )
    throw Error("Xác suất phải trong [0, 1].");
  const total = prior * likelihood + (1 - prior) * falsePositive;
  if (!total) throw Error("Biến cố điều kiện có xác suất 0.");
  return { total, posterior: (prior * likelihood) / total };
}
