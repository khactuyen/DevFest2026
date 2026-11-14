import { makeMaterial } from "./material-factory";
import type { Material } from "./contracts";
import { solveProblem, type SolveMethod } from "./solve-engine";
import { validateMaterialForPublish } from "./validation";
import { solveModeLabel, type SolveMode } from "./solve-mode";

export function makeSolveMaterial(
  prompt: string,
  method: SolveMethod,
  solveMode: SolveMode = "standard",
): Material {
  const solution = solveProblem(prompt, method, solveMode),
    now = new Date().toISOString();
  const visual = solution.visual ? structuredClone(solution.visual) : null;
  visual?.objects.forEach((o) => {
    o.visible = true;
  });
  const title = `${solveModeLabel(solveMode)} · ${prompt.slice(0, 100)}`;
  let material: Material;
  if (visual) {
    material = makeMaterial({
      title,
      explanation: `Đề: ${prompt}\nPhương pháp: ${solution.problem.methods.find((m) => m.id === method)?.label}.`,
      visual,
      entities: [],
      methods: [],
      suggestions: [],
      source: "template",
      steps: solution.steps.map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        visualActions: [],
      })),
    });
  } else {
    material = {
      id: crypto.randomUUID(),
      title,
      summary: `Đề: ${prompt}`,
      blocks: [
        { id: "intro", type: "paragraph", content: prompt },
        ...solution.steps.map((s) => ({
          id: s.id,
          type: "paragraph" as const,
          title: s.title,
          content: s.content,
        })),
      ],
      visuals: [],
      metadata: { grade: "10", topic: "Đại số", type: "problem", tags: [] },
      status: "draft",
      visibility: "private",
      revision: 1,
      slug: null,
      publishedAt: null,
      createdAt: now,
      updatedAt: now,
      learningSteps: solution.steps.map((s, i) => ({
        id: `activity_${s.id}`,
        title: s.title,
        description: "",
        phase: "practice",
        objective: "Hiểu và kiểm tra từng phép biến đổi.",
        estimatedMinutes: 5,
        blockIds: [...(i === 0 ? ["intro"] : []), s.id],
        actionLabels: [],
        visualActions: [],
      })),
    };
  }
  // A transfer creates a private draft, never publishes or exposes AI responses.
  return validateMaterialForPublish(material);
}
