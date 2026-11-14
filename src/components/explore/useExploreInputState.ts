"use client";
import type { HandwritingDraft } from "@/lib/handwriting-draft";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import { useRef, useState } from "react";
import { AnalysisStatus } from "./shared";
export function useExploreInputState() {
  const [problemPrompt, setProblemPrompt] = useState("");
  const [recognitionDraft, setRecognitionDraft] = useState<
    | (ProblemRecognition & {
        imageDataUrl: string;
        mode: "photo" | "handwriting";
      })
    | null
  >(null);
  const [recognizingImage, setRecognizingImage] = useState(false);
  const [inputDockOpen, setInputDockOpen] = useState(false);
  const [inputTab, setInputTab] = useState<
    "text" | "photo" | "handwriting" | "latex"
  >("text");
  const [latexDraft, setLatexDraft] = useState("");
  const [handwritingDraft, setHandwritingDraft] = useState<HandwritingDraft>(
    [],
  );
  const [handwritingUndo, setHandwritingUndo] = useState<HandwritingDraft[]>(
    [],
  );
  const handwritingHistory = useRef<HandwritingDraft[]>([]);
  const [sketchTitle, setSketchTitle] = useState("");
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>("idle");
  const [analysisError, setAnalysisError] = useState("");
  const analysisRequestRef = useRef(0);
  const recognitionRequestRef = useRef(0);
  const recognitionAbortRef = useRef<AbortController | null>(null);
  return {
    problemPrompt,
    setProblemPrompt,
    recognitionDraft,
    setRecognitionDraft,
    recognizingImage,
    setRecognizingImage,
    inputDockOpen,
    setInputDockOpen,
    inputTab,
    setInputTab,
    latexDraft,
    setLatexDraft,
    handwritingDraft,
    setHandwritingDraft,
    handwritingUndo,
    setHandwritingUndo,
    handwritingHistory,
    sketchTitle,
    setSketchTitle,
    analysisStatus,
    setAnalysisStatus,
    analysisError,
    setAnalysisError,
    analysisRequestRef,
    recognitionRequestRef,
    recognitionAbortRef,
  };
}
