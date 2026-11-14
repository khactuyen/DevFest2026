import type { SolveSolution } from "@/lib/solve-engine";
import { isGuidedSolution, type GuidedSolution } from "@/lib/solve-guided-contracts";
import { solveModeLabel } from "@/lib/solve-mode";
import { readableProofContent } from "@/lib/solve-quality";
import { FormattedAIAnswer, splitFormattedMath } from "../FormattedMath";

const argument = String.raw`\{(?:[^{}]|\{[^{}]*\})*\}`;
const bareMath = new RegExp(
  String.raw`\\(?:(?:frac|dfrac|tfrac)\s*${argument}\s*${argument}|(?:sqrt(?:\[[^\]\n]*\])?|vec|overrightarrow|mathrm|mathbf|mathit)\s*${argument}|(?:parallel|perp|angle|triangle|leq?|geq?|neq?|in|cdot|times|pm|pi|infty)(?![a-zA-Z]))`,
  "g",
);

function PrintText({ text }: { text: string }) {
  const normalized = text.replace(/(\p{L}\p{M}*)[ \u00a0]+(?=\p{M})/gu, "$1").normalize("NFC");
  const formatted = splitFormattedMath(normalized).map((part) => {
    if (part.type === "text") return part.value.replace(bareMath, (latex) => `\\(${latex}\\)`);
    return part.display ? `\\[${part.value}\\]` : `\\(${part.value}\\)`;
  }).join("");
  return <FormattedAIAnswer text={formatted} compactDisplaySpacing />;
}

export function SolvePrint({ prompt, solution }: { prompt: string; solution: SolveSolution | GuidedSolution }) {
  const guided = isGuidedSolution(solution) ? solution : null;
  const method = solution.problem.methods.find(({ id }) => id === solution.method);
  return (
    <section className="solve-print" aria-label="Bản in lời giải">
      <h1>Đề bài và lời giải</h1>
      <p>{solveModeLabel(solution.solveMode)}</p>
      <h2>Đề bài gốc</h2>
      <PrintText text={prompt} />
      {guided?.geminiVerified && <p>Đã kiểm chứng · Gemini Decision 1</p>}
      {guided?.solveMode === "detailed" && guided.resultReview?.status === "answer_verified" &&
        <p>Đã kiểm chứng · Bộ giải xác định</p>}
      {guided && guided.solveMode !== "detailed" && <PrintText text={guided.verification} />}
      {guided?.resultReview && guided.solveMode !== "detailed" && <PrintText text={`Trạng thái: ${guided.resultReview.summary}`} />}
      {method && <PrintText text={`Cách giải: ${method.label}`} />}
      {solution.steps.map((step) => (
        <article key={step.id}>
          <h2>{step.title.normalize("NFC")}</h2>
          <PrintText text={guided ? readableProofContent(step, guided.quality?.version) : step.content} />
        </article>
      ))}
      <section className="solve-print-answer">
        <h2>{guided?.resultKind === "conditional" ? "Kết quả có điều kiện" :
          guided?.resultKind === "partial" ? "Kết quả một phần" : "Đáp án"}</h2>
        {guided?.assumptions?.map((text, i) => <PrintText key={i} text={`Giả định: ${text}`} />)}
        {guided?.unresolvedGoals?.map((id) => <PrintText key={id} text={`Chưa kết luận: ${guided.problem.goals[id]}`} />)}
        <PrintText text={guided ? guided.answer : `\\[${solution.answer}\\]`} />
        {guided?.warning && <PrintText text={guided.warning} />}
      </section>
    </section>
  );
}
