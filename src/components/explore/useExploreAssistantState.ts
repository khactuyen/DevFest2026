"use client";
import type { ExploreAssistantAnswer } from "@/lib/explore-assistant";
import { useRef, useState } from "react";
import { LassoContext } from "./shared";
export function useExploreAssistantState() {
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [reflectionPrompt, setReflectionPrompt] = useState("");
  const [assistantAnswer, setAssistantAnswer] =
    useState<ExploreAssistantAnswer | null>(null);
  const [lassoContext, setLassoContext] = useState<LassoContext | null>(null);
  const [assistantBusy, setAssistantBusy] = useState(false);
  const assistantRequestRef = useRef(0);
  const assistantAbortRef = useRef<AbortController | null>(null);
  return {
    assistantOpen,
    setAssistantOpen,
    reflectionPrompt,
    setReflectionPrompt,
    assistantAnswer,
    setAssistantAnswer,
    lassoContext,
    setLassoContext,
    assistantBusy,
    setAssistantBusy,
    assistantRequestRef,
    assistantAbortRef,
  };
}
