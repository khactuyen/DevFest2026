"use client";

import type { Material } from "@/lib/contracts";
import { examQuestions, examHasOptions, examKinds, examPartLabels, examSourceFigures } from "@/lib/exam-document";
import type { ExploreRuntime } from "./explore/shared";
import { ExamPromptDisplay } from "./ExamPromptEditor";
import { FormattedAIAnswer } from "./FormattedMath";
import { LessonBoardView } from "./LessonBoardView";
import { Visual } from "./Visual";
import { MaterialImage } from "./MaterialImage";
import { studentIdentityLine, type StudentIdentity } from "@/lib/lesson-check-roster";

export type ExamBlock = Material["blocks"][number];
export type ExamRow = ReturnType<typeof examQuestions>[number];

export function ExamHeader({ material, student }: { material: Material; student?: StudentIdentity }) {
  const exam = material.exam!;
  return <header className="exam-paper-header">
    <div><strong>{exam.school || (student ? "MathCos" : "TRƯỜNG …")}</strong>{exam.code && <span>Mã đề {exam.code}</span>}</div>
    <div><h1>{material.title}</h1><strong>Môn {exam.subject} · Lớp {material.metadata.grade || "…"}</strong>
      <span>Thời gian làm bài {exam.duration} phút</span></div>
    <p>{student ? studentIdentityLine(student) : "Họ và tên ..................................................................... Lớp ............... Số báo danh ..............."}</p>
  </header>;
}

export function ExamFigure({ material, block, onReady }: {
  material: Material;
  block: ExamBlock;
  onReady?: (runtime: ExploreRuntime) => void;
}) {
  const visual = material.visuals.find((item) => item.id === block.visualId);
  const { width, align } = block.examFigure || { width: 65, align: "center" };
  const keepBackground = block.examFigure?.keepBackground ?? false;
  function prepareRuntime(runtime: ExploreRuntime) {
    if ("setBoardBackgroundVisible" in runtime) runtime.setBoardBackgroundVisible(keepBackground);
    if (!keepBackground && "setGridVisible" in runtime) runtime.setGridVisible(false);
    onReady?.(runtime);
  }
  const runtimeKey = keepBackground ? "background" : "transparent";
  return <figure className="exam-figure" data-exam-figure={block.id} data-align={align}
    data-background={runtimeKey} style={{ width: `${width}%` }}>
    {block.authorKind === "image"
      ? <MaterialImage src={block.content} alt={block.title || "Hình minh họa"} removeFlatBackground={!keepBackground} />
      : block.board ? <LessonBoardView key={runtimeKey} board={block.board} spec={visual || null} onReady={prepareRuntime} />
        : visual ? <Visual key={runtimeKey} spec={visual} onRuntimeReady={prepareRuntime} /> : null}
    {(block.authorKind === "image" ? block.title : block.content) &&
      <figcaption>{block.authorKind === "image" ? block.title : block.content}</figcaption>}
  </figure>;
}

export function ExamSheet({ material, teacher = false, onFigureReady, student }: {
  material: Material;
  teacher?: boolean;
  student?: StudentIdentity;
  onFigureReady?: (id: string, runtime: ExploreRuntime) => void;
}) {
  const rows = examQuestions(material);
  const exam = material.exam!;
  return <article className="exam-paper" style={{ fontFamily: exam.font, fontSize: `${exam.fontSize}pt` }}>
    <ExamHeader material={material} student={student} />
    {examKinds.filter((kind) => rows.some((row) => row.kind === kind)).map((kind, index) =>
      <section key={kind} className="exam-part">
        <h2>Phần {index + 1}. {examPartLabels[kind]}</h2>
        {rows.filter((row) => row.kind === kind).map(({ question, number, figures }) => {
          const { assessment, examQuestion } = question;
          const answers = kind === "true-false" ? assessment?.answer?.split(" ") : undefined;
          const sourceFigures = examSourceFigures(question);
          return <section key={question.id} className="exam-sheet-question">
            {sourceFigures.length === 0 && <div className="exam-question-prompt">
              <strong>Câu {number}.{kind === "written" && !!assessment?.points && ` (${assessment.points} điểm)`}</strong>
              <ExamPromptDisplay prompt={examQuestion?.prompt} content={question.content} />
            </div>}
            {[...sourceFigures, ...figures].map((block) => <ExamFigure key={block.id} material={material} block={block}
              onReady={(runtime) => onFigureReady?.(block.id, runtime)} />)}
            {sourceFigures.length === 0 && examHasOptions(kind) && <div className="exam-sheet-options" style={{ "--exam-columns": examQuestion?.columns || 1 } as React.CSSProperties}>
              {assessment?.options?.map((value, i) => <div key={i} className={teacher && assessment.correctIndex === i ? "exam-correct" : undefined}>
                <strong>{kind === "multiple" ? "ABCD"[i] + "." : "abcd"[i] + ")"}</strong>
                <FormattedAIAnswer text={value} />
                {teacher && (answers?.[i] === "Đ" || answers?.[i] === "S") && <b>{answers[i] === "Đ" ? "Đúng" : "Sai"}</b>}
              </div>)}
            </div>}
            {teacher && sourceFigures.length > 0 && examHasOptions(kind) && <div className="exam-answer">
              {kind === "multiple" && assessment?.correctIndex !== undefined && <strong>Đáp án {"ABCD"[assessment.correctIndex]}</strong>}
              {kind === "true-false" && assessment?.answer && <strong>Đáp án {assessment.answer}</strong>}
            </div>}
            {!teacher && (student || kind === "short") && <p className="exam-short-space">Trả lời ................................................................</p>}
            {!teacher && student && kind === "written" && <p className="exam-short-space">....................................................................................</p>}
            {teacher && !examHasOptions(kind) && assessment?.answer && <div className="exam-answer"><strong>Đáp án </strong><FormattedAIAnswer text={assessment.answer} /></div>}
            {teacher && assessment?.explanation && <div className="exam-answer"><strong>Lời giải </strong><FormattedAIAnswer text={assessment.explanation} /></div>}
          </section>;
        })}
      </section>)}
  </article>;
}
