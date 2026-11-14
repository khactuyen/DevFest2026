import { z } from "zod";

const id = z.string().regex(/^[a-zA-Z][\w-]{0,63}$/);
const iso = z.string().datetime();

export const LessonUnlockRuleSchema = z
  .object({
    type: z.enum(["immediate", "previous_lesson", "previous_unit", "manual"]).default("immediate"),
    requiredCompletion: z.number().int().min(0).max(100).optional(),
  })
  .strict();

export const LessonCompletionRuleSchema = z
  .object({
    type: z.enum(["open", "all_steps", "required_questions", "score"]).default("all_steps"),
    threshold: z.number().min(0).max(100).optional(),
  })
  .strict();

export const CurriculumLessonSchema = z
  .object({
    id,
    materialId: z.string().uuid().nullable().default(null),
    title: z.string().min(1).max(200),
    objective: z.string().max(1000).default(""),
    prerequisites: z.array(z.string().max(200)).max(20).default([]),
    estimatedMinutes: z.number().int().min(0).max(600).default(15),
    orderIndex: z.number().int().min(0).max(10000),
    unlockRule: LessonUnlockRuleSchema.default({ type: "immediate" }),
    completionRule: LessonCompletionRuleSchema.default({ type: "all_steps" }),
  })
  .strict();

export const CurriculumUnitSchema = z
  .object({
    id,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    objectives: z.array(z.string().max(500)).max(20).default([]),
    orderIndex: z.number().int().min(0).max(10000),
    lessons: z.array(CurriculumLessonSchema).max(100).default([]),
  })
  .strict();

export const CurriculumCourseSchema = z
  .object({
    id,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    prerequisites: z.array(z.string().max(200)).max(20).default([]),
    objectives: z.array(z.string().max(500)).max(20).default([]),
    estimatedMinutes: z.number().int().min(0).max(100000).default(0),
    orderIndex: z.number().int().min(0).max(10000),
    units: z.array(CurriculumUnitSchema).max(100).default([]),
  })
  .strict();

export const CurriculumSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().min(1).max(120).default("local-teacher"),
    title: z.string().min(1).max(200),
    description: z.string().max(4000).default(""),
    subject: z.string().min(1).max(100).default("Toán học"),
    gradeBand: z.string().min(1).max(100).default("THPT"),
    objectives: z.array(z.string().max(500)).max(30).default([]),
    status: z.enum(["draft", "published", "archived"]).default("draft"),
    revision: z.number().int().min(1).default(1),
    courses: z.array(CurriculumCourseSchema).max(100).default([]),
    createdAt: iso,
    updatedAt: iso,
    publishedAt: iso.nullable().default(null),
  })
  .strict();

export const LessonProgressSchema = z
  .object({
    lessonId: id,
    completedStepIds: z.array(id).max(100).default([]),
    completedAt: iso.nullable().default(null),
    lastOpenedAt: iso.nullable().default(null),
  })
  .strict();

export const CurriculumProgressSchema = z
  .object({
    curriculumId: z.string().uuid(),
    curriculumRevision: z.number().int().min(1).optional(),
    learnerId: z.string().min(1).max(120),
    lessons: z.array(LessonProgressSchema).max(10000).default([]),
    updatedAt: iso,
  })
  .strict();

export type Curriculum = z.infer<typeof CurriculumSchema>;
export type CurriculumCourse = z.infer<typeof CurriculumCourseSchema>;
export type CurriculumUnit = z.infer<typeof CurriculumUnitSchema>;
export type CurriculumLesson = z.infer<typeof CurriculumLessonSchema>;
export type CurriculumProgress = z.infer<typeof CurriculumProgressSchema>;

export function validateCurriculum(input: unknown) {
  const curriculum = CurriculumSchema.parse(input);
  const nodeIds = new Set<string>();
  const lessonIds = new Set<string>();
  let previousCourseOrder = -1;
  curriculum.courses.forEach((course) => {
    if (nodeIds.has(course.id)) throw Error("ID khóa học trùng");
    nodeIds.add(course.id);
    if (course.orderIndex < previousCourseOrder) throw Error("Thứ tự khóa học không hợp lệ");
    previousCourseOrder = course.orderIndex;
    let previousUnitOrder = -1;
    course.units.forEach((unit) => {
      if (nodeIds.has(unit.id)) throw Error("ID chương trùng");
      nodeIds.add(unit.id);
      if (unit.orderIndex < previousUnitOrder) throw Error("Thứ tự chương không hợp lệ");
      previousUnitOrder = unit.orderIndex;
      let previousLessonOrder = -1;
      unit.lessons.forEach((lesson) => {
        if (nodeIds.has(lesson.id) || lessonIds.has(lesson.id)) throw Error("ID bài học trùng");
        nodeIds.add(lesson.id);
        lessonIds.add(lesson.id);
        if (lesson.orderIndex < previousLessonOrder) throw Error("Thứ tự bài học không hợp lệ");
        previousLessonOrder = lesson.orderIndex;
        if (lesson.unlockRule.type === "previous_lesson" && lesson.orderIndex === 0)
          throw Error("Bài học đầu tiên không thể yêu cầu hoàn thành bài trước");
      });
    });
  });
  return curriculum;
}

export function validateCurriculumProgress(input: unknown) {
  return CurriculumProgressSchema.parse(input);
}

export function curriculumLessonList(curriculum: Curriculum) {
  return curriculum.courses
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .flatMap((course) =>
      course.units
        .slice()
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .flatMap((unit) =>
          unit.lessons
            .slice()
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((lesson) => ({ course, unit, lesson })),
        ),
    );
}

/** Shared unlock calculation for the learner UI and the progress API. */
export function isLessonUnlocked(
  curriculum: Curriculum,
  lessonId: string,
  completedLessonIds: Set<string>,
) {
  for (const course of curriculum.courses) {
    for (let unitIndex = 0; unitIndex < course.units.length; unitIndex += 1) {
      const unit = course.units[unitIndex];
      const lessonIndex = unit.lessons.findIndex((lesson) => lesson.id === lessonId);
      if (lessonIndex < 0) continue;
      const lesson = unit.lessons[lessonIndex];
      if (lesson.unlockRule.type === "immediate") return true;
      if (lesson.unlockRule.type === "manual") return false;
      if (lesson.unlockRule.type === "previous_lesson")
        return lessonIndex > 0 && completedLessonIds.has(unit.lessons[lessonIndex - 1].id);
      const previousUnitLessons = course.units
        .slice(0, unitIndex)
        .flatMap((item) => item.lessons);
      return previousUnitLessons.length > 0 && previousUnitLessons.every((item) => completedLessonIds.has(item.id));
    }
  }
  return false;
}
