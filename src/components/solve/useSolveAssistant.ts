"use client";
import { request } from "@/lib/client";
import type { SolveSession } from "@/lib/solve-contracts";
import type { SolveSolution } from "@/lib/solve-engine";
import {
  isGuidedSolution,
  type GuidedSolution,
} from "@/lib/solve-guided-contracts";
import { useState } from "react";
import { useLatestTask } from "../useLatestTask";
import { message } from "./shared";
export function useSolveAssistant({
  prompt,
  solution,
  activeStep,
}: {
  prompt: string;
  solution: SolveSolution | GuidedSolution | null;
  activeStep: number;
}) {
  const questionTask = useLatestTask();
  const [messages, setMessages] = useState<SolveSession["messages"]>([]);
  const [askOpen, setAskOpen] = useState(false),
    [question, setQuestion] = useState(""),
    [selected, setSelected] = useState("");
  const [askBusy, setAskBusy] = useState(false),
    [askError, setAskError] = useState("");
  function cancel() {
    questionTask.cancel();
    setAskBusy(false);
    setAskError("");
    setSelected("");
  }
  async function ask(
    mode: "hint" | "detail" | "free" = "free",
    stepIndex = activeStep,
  ) {
    if (!solution || !solution.steps[stepIndex] || questionTask.pending) return;
    setAskOpen(true);
    setAskError("");
    const excerpt = mode === "free" && stepIndex === activeStep ? selected : "";
    const asked =
      mode === "hint"
        ? "Gợi ý cho bước hiện tại, chưa cho đáp án."
        : mode === "detail"
          ? "Giải thích chi tiết vì sao bước này đúng."
          : excerpt
            ? `${question.trim()}\nĐoạn đang hỏi: ${excerpt}`.slice(0, 1000)
            : question.trim();
    if (asked.length < 2) return;
    // Reopening an explanation for the same method/step reuses the saved answer.
    if (
      messages.some(
        (item) => item.step === stepIndex && item.question === asked,
      ) &&
      !excerpt
    )
      return;
    const ticket = questionTask.begin();
    setAskBusy(true);
    try {
      const guided = isGuidedSolution(solution);
      const result = await request<{ answer: string }>(
        guided ? "/api/solve-guided-ask" : "/api/solve-ask",
        {
          method: "POST",
          body: JSON.stringify(
            guided
              ? {
                  prompt,
                  methodLabel: solution.problem.methods.find(
                    (m) => m.id === solution.method,
                  )?.label,
                  step: {
                    title: solution.steps[stepIndex].title,
                    content: solution.steps[stepIndex].content,
                  },
                  selected: excerpt,
                  question: asked,
                  mode,
                }
              : {
                  prompt,
                  method: solution.method,
                  solveMode: solution.solveMode,
                  step: stepIndex,
                  selected: excerpt,
                  question: asked,
                  mode,
                },
          ),
          signal: ticket.signal,
        },
      );
      if (!ticket.isCurrent()) return;
      setMessages((items) =>
        [
          ...items,
          { question: asked, answer: result.answer, step: stepIndex },
        ].slice(-8),
      );
      setQuestion("");
    } catch (e) {
      if (ticket.isCurrent()) setAskError(message(e));
    } finally {
      if (ticket.isCurrent()) setAskBusy(false);
      questionTask.finish(ticket);
    }
  }
  return {
    messages,
    setMessages,
    askOpen,
    setAskOpen,
    question,
    setQuestion,
    selected,
    setSelected,
    askBusy,
    askError,
    ask,
    cancel,
  };
}
