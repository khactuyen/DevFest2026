import { z } from "zod";
import { compileExpression } from "./expression";

export type Vec = { x: number; y: number };
export type Construction = { kind: "midpoint" | "foot" | "centroid" | "circumcenter" | "incenter" | "intersection"; refs: string[] };
export type BoardPoint = Vec & { id: string; label: string; construction?: Construction };
export type BoardItem = {
  id: string; kind: "segment" | "line" | "ray" | "polygon" | "circle" | "stroke" | "text" | "image" | "graph";
  refs: string[]; color: string; width: number; dashed?: boolean; fill?: boolean;
  x?: number; y?: number; text?: string; data?: string; path?: Vec[];
};
export type Scene = { points: BoardPoint[]; items: BoardItem[]; problem: string; title: string };
export type Block = { id: string; kind: "theory" | "exercise" | "homework"; title: string; content: string };
export type Lesson = { id: string; title: string; summary: string; published: boolean; blocks: Block[] };
export type Classroom = { id: string; name: string; students: string[] };
export type Submission = { id: string; lessonId: string; images: string[]; date: string; grade?: number; comment: string };
export type WorkspaceData = { scene: Scene; lessons: Lesson[]; classes: Classroom[]; submissions: Submission[] };
export const uid = () => crypto.randomUUID();
const bounded = z.number().finite().min(-1e6).max(1e6);
const pointSchema = z.object({ id: z.string(), label: z.string().max(80), x: bounded, y: bounded, construction: z.object({ kind: z.enum(["midpoint", "foot", "centroid", "circumcenter", "incenter", "intersection"]), refs: z.array(z.string()).max(8) }).superRefine((value, ctx) => {
  const required = value.kind === "midpoint" ? 2 : value.kind === "intersection" ? 4 : 3;
  if (value.refs.length !== required) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Sai số điểm cho phép dựng." });
}).optional() });
const imageData = z.string().max(4_300_000).regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/);
export const workspaceSchema = z.object({
  scene: z.object({ points: z.array(pointSchema).max(1500), items: z.array(z.object({
    id: z.string(), kind: z.enum(["segment", "line", "ray", "polygon", "circle", "stroke", "text", "image", "graph"]),
    refs: z.array(z.string()).max(100), color: z.string().regex(/^#[a-fA-F0-9]{6}$/), width: z.number().min(1).max(12),
    dashed: z.boolean().optional(), fill: z.boolean().optional(), x: bounded.optional(), y: bounded.optional(),
    text: z.string().max(8000).optional(), data: imageData.optional(), path: z.array(z.object({ x: bounded, y: bounded })).max(6000).optional(),
  })).max(1500), problem: z.string().max(8000), title: z.string().max(200) }),
  lessons: z.array(z.object({ id: z.string(), title: z.string().max(200), summary: z.string().max(2000), published: z.boolean(), blocks: z.array(z.object({ id: z.string(), kind: z.enum(["theory", "exercise", "homework"]), title: z.string().max(200), content: z.string().max(8000) })).max(60) })).max(100),
  classes: z.array(z.object({ id: z.string(), name: z.string().max(200), students: z.array(z.string().max(120)).max(100) })).max(100),
  submissions: z.array(z.object({ id: z.string(), lessonId: z.string(), images: z.array(imageData).max(8), date: z.string(), grade: z.number().min(0).max(10).optional(), comment: z.string().max(2000) })).max(100),
});

export const DEFAULT_PROBLEM = "Cho tam giác ABC nhọn, hai đường cao BH và CK. Chứng minh tứ giác BCHK nội tiếp.";
export function seedData(): WorkspaceData {
  return {
    scene: { title: "Bảng toán của tôi", problem: DEFAULT_PROBLEM,
      points: [{ id: "A", label: "A", x: 500, y: 160 }, { id: "B", label: "B", x: 250, y: 570 }, { id: "C", label: "C", x: 780, y: 570 }, { id: "H", label: "H", x: 0, y: 0, construction: { kind: "foot", refs: ["B", "A", "C"] } }, { id: "K", label: "K", x: 0, y: 0, construction: { kind: "foot", refs: ["C", "A", "B"] } }],
      items: [{ id: "abc", kind: "polygon", refs: ["A", "B", "C"], color: "#3877e9", width: 2, fill: true }, { id: "bh", kind: "segment", refs: ["B", "H"], color: "#485467", width: 2 }, { id: "ck", kind: "segment", refs: ["C", "K"], color: "#485467", width: 2 }],
    },
    lessons: [{ id: "sample", title: "Bài 1. Tứ giác nội tiếp", summary: "Nhận biết và chứng minh tứ giác nội tiếp qua góc vuông.", published: true, blocks: [
      { id: "theory", kind: "theory", title: "Lý thuyết: Tứ giác nội tiếp", content: "Tứ giác nội tiếp có bốn đỉnh cùng thuộc một đường tròn.\nNếu hai góc đối của tứ giác có tổng bằng $180^\\circ$ thì tứ giác đó nội tiếp." },
      { id: "exercise", kind: "exercise", title: "Bài tập trên lớp", content: DEFAULT_PROBLEM },
      { id: "homework", kind: "homework", title: "Bài về nhà", content: "Cho tam giác ABC nhọn, hai đường cao AD và BE cắt nhau tại H. Chứng minh tứ giác CDHE nội tiếp." },
    ] }], classes: [{ id: "demo", name: "Lớp 9A — Toán hình học", students: ["Nguyễn Minh", "Trần An"] }], submissions: [],
  };
}
const sub = (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Vec, b: Vec) => a.x * b.y - a.y * b.x;
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export function resolvePoints(scene: Scene): Map<string, BoardPoint> {
  const resolved = new Map<string, BoardPoint>(), visiting = new Set<string>();
  const raw = new Map(scene.points.map(p => [p.id, p]));
  function visit(id: string): BoardPoint | undefined {
    if (resolved.has(id)) return resolved.get(id);
    if (visiting.has(id)) return;
    const p = raw.get(id); if (!p) return;
    visiting.add(id);
    let v: Vec | undefined = p;
    if (p.construction) {
      const refs = p.construction.refs.map(visit); v = undefined;
      const required = p.construction.kind === "midpoint" ? 2 : p.construction.kind === "intersection" ? 4 : 3;
      if (refs.length === required && refs.every(Boolean)) {
        const [a, b, c, d] = refs as BoardPoint[];
        switch (p.construction.kind) {
          case "midpoint": v = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; break;
          case "centroid": v = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 }; break;
          case "foot": { const u = sub(c, b), len = u.x ** 2 + u.y ** 2; if (len > 1e-8) { const t = ((a.x - b.x) * u.x + (a.y - b.y) * u.y) / len; v = { x: b.x + t * u.x, y: b.y + t * u.y }; } break; }
          case "intersection": { const u = sub(b, a), w = sub(d, c), den = cross(u, w); if (Math.abs(den) > 1e-8) { const t = cross(sub(c, a), w) / den; v = { x: a.x + t * u.x, y: a.y + t * u.y }; } break; }
          case "circumcenter": {
            const det = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
            if (Math.abs(det) > 1e-8) { const aa = a.x ** 2 + a.y ** 2, bb = b.x ** 2 + b.y ** 2, cc = c.x ** 2 + c.y ** 2; v = { x: (aa * (b.y - c.y) + bb * (c.y - a.y) + cc * (a.y - b.y)) / det, y: (aa * (c.x - b.x) + bb * (a.x - c.x) + cc * (b.x - a.x)) / det }; } break;
          }
          case "incenter": { const wa = distance(b, c), wb = distance(a, c), wc = distance(a, b), sum = wa + wb + wc; if (sum > 1e-8 && Math.abs(cross(sub(b, a), sub(c, a))) > 1e-8) v = { x: (wa * a.x + wb * b.x + wc * c.x) / sum, y: (wa * a.y + wb * b.y + wc * c.y) / sum }; break; }
        }
      }
    }
    visiting.delete(id);
    if (!v || !Number.isFinite(v.x) || !Number.isFinite(v.y)) return;
    const result = { ...p, ...v }; resolved.set(id, result); return result;
  }
  scene.points.forEach(p => visit(p.id)); return resolved;
}
/** Delete dependent objects transitively, rather than leaving dangling geometry. */
export function removeFromScene(scene: Scene, id: string): Scene {
  const removed = new Set([id]);
  for (let pass = 0; pass <= scene.points.length; pass++) {
    let changed = false;
    for (const p of scene.points) if (!removed.has(p.id) && p.construction?.refs.some(ref => removed.has(ref))) { removed.add(p.id); changed = true; }
    if (!changed) break;
  }
  return { ...scene, points: scene.points.filter(p => !removed.has(p.id)), items: scene.items.filter(i => !removed.has(i.id) && !i.refs.some(ref => removed.has(ref))) };
}
export function graphPaths(expression: string): string[] {
  const fn = compileExpression(expression.replace(/^y\s*=\s*/i, ""), ["x"]), paths: string[] = []; let line = "", last: number | undefined;
  for (let n = 0; n <= 500; n++) {
    const x = -10 + n / 25; let y: number;
    try { y = fn({ x }); } catch { y = NaN; }
    if (!Number.isFinite(y) || Math.abs(y) > 12 || last !== undefined && Math.abs(y - last) > 3) { if (line) paths.push(line); line = ""; last = undefined; continue; }
    line += `${line ? " L" : "M"}${500 + x * 36},${390 - y * 36}`; last = y;
  }
  if (line) paths.push(line); return paths;
}
export function fitView(scene: Scene): { x: number; y: number; width: number; height: number } {
  const all: Vec[] = [...resolvePoints(scene).values()];
  for (const item of scene.items) { if (item.path) all.push(...item.path); if (item.x !== undefined && item.y !== undefined) all.push({ x: item.x, y: item.y }, { x: item.x + 260, y: item.y + 100 }); if (item.kind === "graph") all.push({ x: 100, y: 30 }, { x: 900, y: 750 }); }
  for (const item of scene.items.filter(i => i.kind === "circle")) { const p = resolvePoints(scene); const a = p.get(item.refs[0]), b = p.get(item.refs[1]); if (a && b) { const r = distance(a, b); all.push({ x: a.x - r, y: a.y - r }, { x: a.x + r, y: a.y + r }); } }
  if (!all.length) return { x: 0, y: 0, width: 1000, height: 760 };
  const x = Math.min(...all.map(p => p.x)) - 80, y = Math.min(...all.map(p => p.y)) - 80;
  return { x, y, width: Math.max(300, Math.max(...all.map(p => p.x)) - x + 80), height: Math.max(250, Math.max(...all.map(p => p.y)) - y + 80) };
}
