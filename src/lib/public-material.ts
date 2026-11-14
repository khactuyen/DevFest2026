import type { Material } from "./contracts";

/** Remove answer keys from student-facing payloads; grading stays server-side. */
export function publicMaterial(material: Material): Material {
  return {
    ...material,
    sourcePages: undefined,
    reviewNotes: undefined,
    sourceReviewedAt: undefined,
    slidePlan: material.slidePlan?.map(({ notes: _notes, ...slide }) => slide),
    blocks: material.blocks.map((block) => {
      if (!block.assessment) return block;
      const assessment = { type: block.assessment.type, points: block.assessment.points,
        ...(block.assessment.options ? { options: block.assessment.options } : {}) };
      const examQuestion = block.examQuestion ? { ...block.examQuestion,
        sourceImages: block.examQuestion.useSourceLayout === false ? undefined : block.examQuestion.sourceImages,
        sourceWarnings: undefined, reviewFlags: undefined, reviewNote: undefined,
      } : undefined;
      return { ...block, assessment, examQuestion };
    }),
  };
}
