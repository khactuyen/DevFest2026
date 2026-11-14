"use client";
import type { VisualRuntime } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";
import type {
  SolveHeaderProps,
  SolveInputProps,
  SolveReviewProps,
  SolveSolutionProps,
} from "./view-contracts";

import { request } from "@/lib/client";
import { ThreeVisualSpecSchema, TwoDVisualSpecSchema, type ThreeVisualSpec, type TwoDVisualSpec } from "@/lib/contracts";
import type { HandwritingDraft } from "@/lib/handwriting-draft";
import { learnerSessionId } from "@/lib/learner";
import type { ProblemRecognition } from "@/lib/problem-recognition";
import { migrateSolveSession, type SolveSession } from "@/lib/solve-contracts";
import {
  analyzeSolveProblem,
  solveProblem,
  type SolveMethod,
  type SolveProblem,
  type SolveSolution,
} from "@/lib/solve-engine";
import {
  isGuidedProblem,
  isGuidedSolution,
  type GuidedProblem,
  type GuidedSolution,
} from "@/lib/solve-guided-contracts";
import { type SolveMode } from "@/lib/solve-mode";
import {
  normalizeSolveSource,
  unresolvedSourceMarks,
} from "@/lib/solve-source";
import { type QuestionPreference } from "@/lib/solve-question";
import {
  initialSolveFlow,
  restoredSolveFlow,
  solveFlowReducer,
} from "@/lib/workspace/solve-flow";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useLatestTask } from "../useLatestTask";
import { message, prepareImage } from "./shared";
import { useSolveAssistant } from "./useSolveAssistant";
import { useSolveDraft, useSolvePersistence } from "./useSolvePersistence";
import { useSolveVisual } from "./useSolveVisual";

export function useSolveWorkspace() {
  const localKey = `math-vision:solve-draft:v2:${learnerSessionId()}`;
  const router = useRouter(),
    search = useSearchParams(),
    requestedSession = search.get("session");
  const [flow, dispatch] = useReducer(solveFlowReducer, initialSolveFlow);
  const { prompt, phase, problem, solution } = flow;
  const [solveMode, setSolveMode] = useState<SolveMode>("standard");
  const [questionType, setQuestionType] = useState<QuestionPreference>("auto");
  const [tab, setTab] = useState("text");
  const [sourceConfirmed, setSourceConfirmed] = useState(false);
  const [quickAnswer, setQuickAnswer] = useState<SolveSolution | null>(null);
  const [inputRevision, setInputRevision] = useState(0);
  const sourceEpoch = useRef(0);
  const [handwritingDraft, setHandwritingDraft] = useState<HandwritingDraft>(
    [],
  );
  const [handwritingUndo, setHandwritingUndo] = useState<HandwritingDraft[]>(
    [],
  );
  const handwritingHistory = useRef<HandwritingDraft[]>([]);

  const [activeStep, setActiveStep] = useState(0),
    [showAll, setShowAll] = useState(false);
  const [hint, setHint] = useState<"hint" | "explanation" | null>(null);
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [recognition, setRecognition] = useState<
    (ProblemRecognition & { imageDataUrl: string }) | null
  >(null);

  const [mobileTab, setMobileTab] = useState("steps");
  const [visualOpen, setVisualOpen] = useState(true);
  const [visualDimension, setVisualDimension] = useState<"2d" | "3d">("2d");
  const [visualSurfaceFill, setVisualSurfaceFill] = useState(false);
  const diagramBusy = busy === "diagram";
  const workTask = useLatestTask(),
    saveTask = useLatestTask();
  const [print, setPrint] = useState(false);
  const moreMenu = useRef<HTMLDetailsElement>(null);
  const contentsMenu = useRef<HTMLDetailsElement>(null);
  const chatLauncher = useRef<HTMLButtonElement>(null);

  const retained = useRef<NonNullable<SolveSession["retainedSolutions"]>>([]);
  const [cacheRevision, setCacheRevision] = useState(0);

  const {
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
    cancel: cancelAI,
  } = useSolveAssistant({ prompt, solution, activeStep });
  const persistence = useSolvePersistence({
    localKey,
    requestedSession,
    restore,
    reset: resetPersistedInput,
    cancel: cancelWork,
    restoreInput(ui) {
      if (ui.tab && ["text", "math", "hand", "photo"].includes(ui.tab))
        setTab(ui.tab);
      if (ui.recognition) setRecognition(ui.recognition);
    },
    notice: setNotice,
    error: setError,
  });
  const {
    session,
    owner,
    saved,
    hydrated,
    loadFailed,
    legacyUnbound,
    freshIdentity,
  } = persistence;
  const step = solution?.steps[activeStep];
  const {
    runtime,
    spatialView,
    displaying3d,
    displayVisual,
    canFill,
    syncVisual,
  } = useSolveVisual({
    solution,
    activeStep,
    showAll,
    visualOpen,
    visualDimension,
    visualSurfaceFill,
  });

  const snapshot = useMemo<SolveSession | null>(
    () =>
      session && owner
        ? {
            ...session,
            ownerKey: owner,
            title: problem
              ? `${isGuidedProblem(problem) ? problem.topic : problem.degree === 2 ? "Bậc hai" : problem.degree === 1 ? "Bậc nhất" : "Mệnh đề"} · ${prompt.slice(0, 90)}`
              : prompt.slice(0, 100) || "Bài giải mới",
            prompt,
            solveMode,
            questionType,
            phase,
            method:
              phase === "solution" && solution && !isGuidedSolution(solution)
                ? solution.method
                : null,
            recommendation: problem?.recommendation,
            guidedProblem:
              phase !== "input" && isGuidedProblem(problem) ? problem : null,
            guidedSolution:
              phase === "solution" && isGuidedSolution(solution)
                ? solution
                : null,
            retainedSolutions: retained.current,
            visualOpen,
            visualDimension,
            visualSurfaceFill,
            legacyUnbound,
            handwritingDraft,
            handwritingUndo,
            activeStep: phase === "solution" ? activeStep : 0,
            showAll: phase === "solution" ? showAll : false,
            messages: phase === "solution" ? messages : [],
            updatedAt: new Date().toISOString(),
          }
        : null,
    [
      session,
      owner,
      prompt,
      solveMode,
      questionType,
      problem,
      phase,
      solution,
      visualOpen,
      visualDimension,
      visualSurfaceFill,
      activeStep,
      showAll,
      messages,
      handwritingDraft,
      handwritingUndo,
      legacyUnbound,
      cacheRevision,
    ],
  );

  useSolveDraft({
    localKey,
    snapshot,
    hydrated,
    loadFailed,
    input: { tab, recognition },
    notice: setNotice,
  });

  function cancelWork() {
    sourceEpoch.current += 1;
    setInputRevision(sourceEpoch.current);
    workTask.cancel();
    saveTask.cancel();
    setBusy("");
    cancelAI();
  }

  function edit(value: string) {
    setQuickAnswer(null);
    setSourceConfirmed(false);
    retained.current = [];
    setCacheRevision((value) => value + 1);
    persistence.clearLoadFailure();
    cancelWork();
    if (phase !== "input") freshIdentity();
    dispatch({ type: "edit", prompt: value });
    setVisualDimension("2d");
    setVisualSurfaceFill(false);
    setActiveStep(0);
    setShowAll(false);
    setMessages([]);
    setHint(null);
    setAskOpen(false);
    setError("");
    setNotice("");
  }
  function newProblem() {
    if (
      (prompt.trim() || handwritingDraft.length || recognition || solution) &&
      !window.confirm(
        "Bắt đầu bài mới? Bản chưa lưu vào tài khoản sẽ được thay thế.",
      )
    )
      return;
    persistence.skipNextLocalRestore();
    edit("");
    freshIdentity();
    setRecognition(null);
    setHandwritingDraft([]);
    setHandwritingUndo([]);
    handwritingHistory.current = [];
    setTab("text");
    setQuestionType("auto");
    setVisualOpen(true);
    router.replace("/space", { scroll: false });
  }
  function goBack() {
    if (phase === "input") return;
    cancelWork();
    persistence.skipNextLocalRestore();
    rememberSolution();
    setHint(null);
    setAskOpen(false);
    setError("");
    setNotice("");
    dispatch({ type: "back" });
  }
  function restore(raw: unknown) {
    setQuickAnswer(null);
    const s = migrateSolveSession(raw);
    if (s.ownerKey !== learnerSessionId())
      throw Error("Phiên này thuộc thiết bị khác.");
    cancelWork();
    if (s.legacyUnbound) {
      try {
        localStorage.setItem(`${localKey}:legacy:${s.id}`, JSON.stringify(raw));
      } catch {
        /* remote record is untouched; local storage may be unavailable */
      }
    }
    persistence.adopt(s);
    retained.current = s.retainedSolutions || [];
    setCacheRevision((value) => value + 1);
    persistence.clearLoadFailure();
    setHandwritingDraft(s.handwritingDraft || []);
    setHandwritingUndo(s.handwritingUndo || []);
    handwritingHistory.current = s.handwritingUndo || [];

    setSolveMode(s.solveMode);
    setQuestionType(s.questionType);
    setVisualDimension(s.visualDimension ?? "2d");
    setVisualSurfaceFill(s.visualSurfaceFill ?? false);
    const sourceProblem =
      s.phase === "input" && !retained.current.length
        ? null
        : s.guidedProblem ||
          retained.current[0]?.guidedProblem ||
          analyzeSolveProblem(s.prompt);
    const restoredProblem =
      sourceProblem && !isGuidedProblem(sourceProblem)
        ? { ...sourceProblem, recommendation: s.recommendation }
        : sourceProblem;
    const sourceSolution =
      s.guidedSolution ||
      (s.method ? solveProblem(s.prompt, s.method, s.solveMode) : null);
    const restoredSolution =
      sourceSolution && !isGuidedSolution(sourceSolution)
        ? {
            ...sourceSolution,
            problem: {
              ...sourceSolution.problem,
              recommendation: s.recommendation,
            },
          }
        : sourceSolution;
    dispatch({
      type: "restore",
      value: restoredSolveFlow(
        s.prompt,
        s.phase,
        restoredProblem,
        restoredSolution,
      ),
    });
    setActiveStep(s.activeStep);
    setShowAll(s.showAll);
    setMessages(s.messages);
    setHint(null);
    setRecognition(null);
    setAskOpen(false);
    setVisualOpen(
      s.visualOpen ?? (!s.guidedSolution || !!s.guidedSolution.visual),
    );
    setError("");
    setNotice(
      s.legacyUnbound
        ? "Phiên cũ cần phân tích lại. Bản gốc được giữ; lưu sẽ tạo bản sao."
        : "Đã khôi phục đề, phương pháp và bước đang xem.",
    );
  }

  function resetPersistedInput() {
    setQuickAnswer(null);
    dispatch({ type: "edit", prompt: "" });
    setActiveStep(0);
    setShowAll(false);
    setMessages([]);
    setHandwritingDraft([]);
    setHandwritingUndo([]);
    handwritingHistory.current = [];
    setRecognition(null);
  }
  function rememberSolution() {
    if (!solution || !problem) return;
    const item = {
      method: isGuidedSolution(solution) ? null : solution.method,
      solveMode: solution.solveMode,
      guidedProblem: isGuidedProblem(problem) ? problem : null,
      guidedSolution: isGuidedSolution(solution) ? solution : null,
      ...(isGuidedSolution(solution)
        ? {
            outcomeMode:
              solution.origin === "gemini-decision" || solution.origin === "jev" || solution.origin === "solver"
                ? ("quick" as const)
                : ("deep" as const),
          }
        : {}),
      activeStep,
      showAll,
      messages,
    };
    const key = solution.method;
    retained.current = [
      item,
      ...retained.current.filter(
        (c) =>
          (c.guidedSolution?.method || c.method) !== key ||
          c.solveMode !== item.solveMode ||
          (c.outcomeMode || "deep") !== (item.outcomeMode || "deep"),
      ),
    ].slice(0, 8);
    setCacheRevision((value) => value + 1);
  }

  function changeSolveMode(mode: SolveMode) {
    if (mode === solveMode) return;
    rememberSolution();
    cancelWork();
    setSolveMode(mode);
    dispatch({ type: "mode-changed" });
    setActiveStep(0);
    setShowAll(false);
    setMessages([]);
    setHint(null);
    setError("");
    setNotice("");
  }

  // Visual tears down its old board asynchronously. Never run new-scene actions
  // against a destroyed board or a previous scene with different object IDs.

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      for (const menu of [moreMenu.current, contentsMenu.current])
        if (menu && !menu.contains(event.target as Node)) menu.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (moreMenu.current?.open) {
        moreMenu.current.open = false;
        moreMenu.current.querySelector("summary")?.focus();
      }
      if (contentsMenu.current?.open) {
        contentsMenu.current.open = false;
        contentsMenu.current.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", closeMenus);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", closeMenus);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    if (!askOpen) return;
    const frame = requestAnimationFrame(() =>
      document.getElementById("solve-question")?.focus(),
    );
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      cancelAI();
      setAskOpen(false);
      requestAnimationFrame(() => chatLauncher.current?.focus());
    };
    document.addEventListener("keydown", escape);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", escape);
    };
    // The request-version guards in cancelAI are refs, not captured state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askOpen]);
  useEffect(() => {
    if (!print) return;
    const sheet = document.querySelector<HTMLElement>(".solve-print");
    if (!sheet) {
      setPrint(false);
      return;
    }
    let disposed = false;
    void (async () => {
      sheet.dataset.preparing = "";
      if (sheet.querySelector(".formatted-ai-math"))
        await import("mathlive").catch(() => {});
      if (disposed) return;
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      // The print sheet is normally hidden. Lay it out to load the exact
      // Vietnamese and math glyphs before the browser snapshots the page.
      sheet.getBoundingClientRect();
      const sample = sheet.textContent || "Tiếng Việt";
      await Promise.allSettled([
        document.fonts.load('400 11pt "Be Vietnam Pro"', sample),
        document.fonts.load('700 11pt "Be Vietnam Pro"', sample),
      ]);
      await document.fonts.ready;
      if (!disposed) window.print();
    })();
    const done = () => setPrint(false);
    window.addEventListener("afterprint", done);
    return () => {
      disposed = true;
      delete sheet.dataset.preparing;
      window.removeEventListener("afterprint", done);
    };
  }, [print]);
  async function analyze() {
    const normalized = normalizeSolveSource(prompt);
    if (unresolvedSourceMarks(normalized).length) {
      setError(
        "Hãy sửa ký hiệu không đọc được được đánh dấu trong đề trước khi giải.",
      );
      return;
    }
    if (recognition?.needsReview && !sourceConfirmed) {
      setError(
        "Hãy đối chiếu và xác nhận nội dung đọc từ ảnh hoặc nét viết trước khi xử lý.",
      );
      return;
    }
    if (problem) {
      dispatch({ type: "show-review" });
      return;
    }
    cancelWork();
    const ticket = workTask.begin();
    setBusy("analyze");
    setError("");
    setNotice("");
    try {
      const result = await request<{
        problem: SolveProblem | GuidedProblem;
        cached: boolean;
        prompt: string;
      }>("/api/solve-plan", {
        method: "POST",
        signal: ticket.signal,
        body: JSON.stringify({
          prompt: normalized,
          questionType,
          sourceReview: {
            needsReview: !!recognition?.needsReview,
            ambiguities: recognition?.ambiguities || [],
            confirmed: sourceConfirmed,
          },
          ...(recognition?.containsDiagram
            ? {
                figure: {
                  imageDataUrl: recognition.imageDataUrl,
                  description: recognition.figureDescription,
                  ambiguities: recognition.ambiguities,
                },
              }
            : {}),
        }),
      });
      if (!ticket.isCurrent()) return;
      dispatch({
        type: "restore",
        value: {
          phase: "review",
          prompt: result.prompt,
          problem: result.problem,
          solution: null,
        },
      });
      setNotice("");
    } catch (e) {
      if (!ticket.isCurrent()) return;
      if (e && typeof e === "object" && "code" in e && e.code === "solve_question_unclear") {
        setError("Chưa tự nhận diện được loại đề. Chọn mục Loại câu hỏi, rồi bấm Phân tích & kiểm tra đề để tiếp tục.");
        return;
      }
      try {
        if (!["auto", "essay", "short_answer"].includes(questionType)) throw e;
        const local = analyzeSolveProblem(prompt);
        dispatch({ type: "analyzed", problem: local });
        setNotice(`${message(e)} Đang dùng bộ giải trực tiếp cho đề này.`);
      } catch {
        setError(
          `${message(e)} Đề gốc vẫn được giữ; hãy sửa dữ kiện hoặc thử lại.`,
        );
      }
    } finally {
      if (ticket.isCurrent()) setBusy("");
      workTask.finish(ticket);
    }
  }
  function revealQuickAnswer() {
    if (!problem || isGuidedProblem(problem) || busy) return;
    const method = problem.methods[0];
    if (!method) return;
    try {
      setQuickAnswer(solveProblem(prompt, method.id, solveMode));
      setError("");
    } catch (e) {
      setError(message(e));
    }
  }
  async function chooseMethod(
    method: SolveMethod | GuidedProblem["methods"][number]["id"],
    outcomeMode: "quick" | "deep" = "deep",
  ) {
    if (!problem) return;
    if (
      recognition?.containsDiagram &&
      isGuidedProblem(problem) &&
      !problem.figureContext?.imageDigest
    ) {
      cancelWork();
      dispatch({ type: "input" });
      setError("");
      setNotice(
        "Phân tích cũ chưa nhận ảnh nguồn. Bấm Phân tích & kiểm tra đề để phân tích lại cùng ảnh, không dùng lại cảnh báo hoặc lời giải cũ.",
      );
      return;
    }
    rememberSolution();
    const cached = retained.current.find(
      (c) =>
        (c.guidedSolution?.method || c.method) === method &&
        c.solveMode === solveMode &&
        (!isGuidedProblem(problem) ||
          !problem.directSolver ||
          c.guidedProblem?.directSolver === problem.directSolver) &&
        (!c.guidedSolution || (c.outcomeMode || "deep") === outcomeMode),
    );
    if (cached) {
      cancelWork();
      const cachedSolution =
        cached.guidedSolution ||
        solveProblem(prompt, cached.method!, cached.solveMode);
      dispatch({
        type: "solved",
        solution: !isGuidedSolution(cachedSolution)
          ? {
              ...cachedSolution,
              problem: {
                ...cachedSolution.problem,
                recommendation: problem.recommendation,
              },
            }
          : cachedSolution,
      });
      setActiveStep(cached.activeStep);
      setShowAll(cached.showAll);
      setMessages(cached.messages);
      setError("");
      setNotice("Đã mở lại lời giải của phương pháp này.");
      return;
    }
    cancelWork();
    setError("");
    setNotice("");
    try {
      if (isGuidedProblem(problem)) {
        // Direct solvers run first; unsupported deep requests may use the reasoning model.
        const ticket = workTask.begin();
        setBusy(method);
        try {
          const result = await request<{ solution: GuidedSolution }>(
            "/api/solve-outcome",
            {
              method: "POST",
              signal: ticket.signal,
              body: JSON.stringify({
                prompt,
                method,
                solveMode,
                mode: outcomeMode,
                analysis: problem,
                ...(recognition?.containsDiagram
                  ? {
                      figure: {
                        imageDataUrl: recognition.imageDataUrl,
                        description: recognition.figureDescription,
                        ambiguities: recognition.ambiguities,
                      },
                    }
                  : {}),
              }),
            },
          );
          if (!ticket.isCurrent()) return;
          dispatch({ type: "solved", solution: result.solution });
          setActiveStep(0);
          setShowAll(true);
          setMessages([]);
          setHint(null);
          setAskOpen(false);
          setMobileTab("steps");
          setVisualOpen(!!result.solution.visual);
        } catch (e) {
          if (ticket.isCurrent()) setError(message(e));
        } finally {
          if (ticket.isCurrent()) setBusy("");
          workTask.finish(ticket);
        }
        return;
      }
      const computed = solveProblem(prompt, method as SolveMethod, solveMode);
      dispatch({
        type: "solved",
        solution: {
          ...computed,
          problem: {
            ...computed.problem,
            recommendation: problem.recommendation,
          },
        },
      });
      setActiveStep(0);
      setShowAll(true);
      setMessages([]);
      setHint(null);
      setAskOpen(false);
      setMobileTab("steps");
      setVisualOpen(!!computed.visual);
    } catch (e) {
      setError(message(e));
    }
  }
  async function toggleDiagram() {
    if (!solution || busy) return;
    if (!isGuidedSolution(solution) || solution.visual) {
      setVisualOpen(!visualOpen);
      setMobileTab(!visualOpen ? "visual" : "steps");
      return;
    }
    const ticket = workTask.begin();
    setBusy("diagram");
    setError("");
    setNotice("");
    try {
      const result = await request<{ visual: TwoDVisualSpec; visual3d?: ThreeVisualSpec; note: string }>(
        "/api/solve-visual",
        {
          method: "POST",
          signal: ticket.signal,
          body: JSON.stringify({ prompt, analysis: solution.problem }),
        },
      );
      if (!ticket.isCurrent()) return;
      const visual = TwoDVisualSpecSchema.parse(result.visual);
      const visual3d = result.visual3d ? ThreeVisualSpecSchema.parse(result.visual3d) : undefined;
      dispatch({
        type: "replace-solution",
        expected: solution,
        solution: { ...solution, visual, visual3d, visualWarning: result.note },
      });
      setVisualDimension("2d");
      setVisualOpen(true);
      setMobileTab("visual");
    } catch (e) {
      if (ticket.isCurrent()) {
        setError(message(e));
        setVisualOpen(true);
        setMobileTab("visual");
      }
    } finally {
      if (ticket.isCurrent()) setBusy("");
      workTask.finish(ticket);
    }
  }
  async function recognize(file: File) {
    cancelWork();
    const ticket = workTask.begin();
    setBusy("photo");
    setError("");
    try {
      const imageDataUrl = await prepareImage(file);
      if (!ticket.isCurrent()) return;
      const result = await request<ProblemRecognition>(
        "/api/problem-recognition",
        {
          method: "POST",
          body: JSON.stringify({ imageDataUrl, mode: "photo" }),
          signal: ticket.signal,
        },
      );
      if (!ticket.isCurrent()) return;
      edit(result.transcription);
      setRecognition({ ...result, imageDataUrl });
      setNotice(
        "AI đã đọc ảnh. Kiểm tra lại từng dấu và chọn một câu trước khi giải.",
      );
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      if (ticket.isCurrent()) setBusy("");
    }
  }
  async function save(copy = false) {
    if (!snapshot || diagramBusy) return;
    const ticket = saveTask.begin();
    setBusy("save");
    setError("");
    const payload =
      copy || legacyUnbound
        ? {
            ...snapshot,
            id: crypto.randomUUID(),
            revision: 0,
            createdAt: new Date().toISOString(),
            legacyUnbound: false,
          }
        : snapshot;
    try {
      const result = await request<SolveSession>("/api/solve-sessions", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      persistence.acceptSave(result, ticket.isCurrent());
      if (!ticket.isCurrent()) return;

      setNotice("Đã lưu bài giải. Có thể mở lại từ Lịch sử.");
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      if (ticket.isCurrent()) setBusy("");
    }
  }
  async function toStudio() {
    if (!solution || isGuidedSolution(solution)) return;
    const ticket = workTask.begin();
    setBusy("studio");
    setError("");
    try {
      const material = await request<{ id: string }>("/api/solve-material", {
        method: "POST",
        body: JSON.stringify({
          prompt,
          method: solution.method,
          solveMode: solution.solveMode,
        }),
      });
      if (ticket.isCurrent()) router.push(`/studio?material=${material.id}`);
    } catch (e) {
      if (ticket.isCurrent()) setError(message(e));
    } finally {
      if (ticket.isCurrent()) setBusy("");
    }
  }
  function move(index: number) {
    cancelAI();
    setActiveStep(index);
    setHint(null);
  }
  function jumpToStep(index: number) {
    move(index);
    if (showAll)
      document.getElementById(`solve-step-${index}`)?.scrollIntoView({
        block: "start",
        behavior: "auto",
      });
  }
  function captureSelection() {
    const s = window.getSelection(),
      host = document.getElementById("solve-current-step");
    if (
      s &&
      !s.isCollapsed &&
      host?.contains(s.anchorNode) &&
      host?.contains(s.focusNode)
    ) {
      const anchor =
        s.anchorNode?.nodeType === Node.ELEMENT_NODE
          ? (s.anchorNode as Element)
          : s.anchorNode?.parentElement;
      const focus =
        s.focusNode?.nodeType === Node.ELEMENT_NODE
          ? (s.focusNode as Element)
          : s.focusNode?.parentElement;
      const article = anchor?.closest("[data-solve-step]");
      if (!article || focus?.closest("[data-solve-step]") !== article) return;
      cancelAI();
      setActiveStep(Number(article.getAttribute("data-solve-step")));
      setHint(null);
      setSelected(s.toString().slice(0, 2000));
    }
  }
  function setView(all: boolean) {
    cancelAI();
    setShowAll(all);
    setHint(null);
  }
  function closeMoreMenu() {
    if (moreMenu.current) moreMenu.current.open = false;
  }
  const sourceLines =
    recognition?.transcription.split(/\n+/).filter((s) => /[=<>≤≥]/.test(s)) ||
    [];
  const currentMessages = messages.filter((m) => m.step === activeStep);

  function chooseInputTab(tab: string) {
    cancelWork();
    setTab(tab);
  }
  function changeHandwritingDraft(strokes: HandwritingDraft) {
    setHandwritingDraft(strokes);
    setHandwritingUndo(structuredClone(handwritingHistory.current));
  }
  function acceptHandwritingResult(
    result: ProblemRecognition & { imageDataUrl: string },
    revision?: number,
  ) {
    if (revision !== sourceEpoch.current) return;
    edit(result.transcription);
    setRecognition(result);
    setNotice("Kiểm tra lại nội dung AI đọc từ nét viết trước khi giải.");
  }
  function confirmSourceCorrection(source: string) {
    edit(source);
    setNotice(
      "Đã xác nhận đáy ACDF; giữ ảnh nguồn. Phân tích lại để không dùng lời giải của đề đọc sai.",
    );
  }
  function chooseQuestionType(type: QuestionPreference) {
    edit(prompt);
    setQuestionType(type);
  }
  function useExample(source: string) {
    edit(source);
    setQuestionType("auto");
    setTab("text");
    setRecognition(null);
  }
  function openSavedSession(s: SolveSession) {
    restore(s);
    router.replace("/space?session=" + s.id, { scroll: false });
  }
  function chooseVisualDimension(dimension: "2d" | "3d") {
    runtime.current = null;
    setVisualDimension(dimension);
  }
  function zoomVisual(direction: "in" | "out" | "fit") {
    const r = runtime.current;
    if (direction === "in") r?.zoomIn();
    else if (direction === "out") r?.zoomOut();
    else r?.fitView();
  }
  function onVisualReady(r: VisualRuntime | ThreeVisualRuntime) {
    runtime.current = r;
    r.setSurfaceFillVisible(visualSurfaceFill);
    syncVisual(r);
  }
  const header: SolveHeaderProps = {
    busy: busy,
    closeMoreMenu: closeMoreMenu,
    diagramBusy: diagramBusy,
    goBack: goBack,
    moreMenu: moreMenu,
    newProblem: newProblem,
    phase: phase,
    openSavedSession: openSavedSession,
    save: save,
    saved: saved,
    printSolution: () => setPrint(true),
    solution: solution,
    toStudio: toStudio,
    toggleDiagram: toggleDiagram,
    visualOpen: visualOpen,
  };
  const input: SolveInputProps = {
    analyze: analyze,
    sourceConfirmed,
    confirmSource: setSourceConfirmed,
    busy: busy,
    changeSolveMode: changeSolveMode,
    edit: edit,
    handwritingDraft: handwritingDraft,
    handwritingHistory: handwritingHistory,
    hydrated: hydrated,
    inputRevision: inputRevision,
    loadFailed: loadFailed,
    phase: phase,
    prompt: prompt,
    questionType: questionType,
    recognition: recognition,
    recognize: recognize,
    chooseInputTab: chooseInputTab,
    changeHandwritingDraft: changeHandwritingDraft,
    getSourceRevision: () => sourceEpoch.current,
    acceptHandwritingResult: acceptHandwritingResult,
    clearSourceImage: () => setRecognition(null),
    confirmSourceCorrection: confirmSourceCorrection,
    chooseQuestionType: chooseQuestionType,
    useExample: useExample,
    solveMode: solveMode,
    sourceLines: sourceLines,
    tab: tab,
  };
  const review: SolveReviewProps = {
    quickAnswer: quickAnswer?.problem.source === prompt ? quickAnswer : null,
    revealQuickAnswer,
    questionType,
    busy: busy,
    chooseMethod: chooseMethod,
    goBack: goBack,
    hydrated: hydrated,
    loadFailed: loadFailed,
    phase: phase,
    problem: problem,
    prompt: prompt,
    recognition: recognition,
    solveMode: solveMode,
  };
  const result: SolveSolutionProps = {
    activeStep: activeStep,
    ask: ask,
    askBusy: askBusy,
    askError: askError,
    askOpen: askOpen,
    busy: busy,
    canFill: canFill,
    cancelAI: cancelAI,
    captureSelection: captureSelection,
    chatLauncher: chatLauncher,
    chooseMethod: chooseMethod,
    contentsMenu: contentsMenu,
    currentMessages: currentMessages,
    displayVisual: displayVisual,
    displaying3d: displaying3d,
    edit: edit,
    goBack: goBack,
    hint: hint,
    hydrated: hydrated,
    jumpToStep: jumpToStep,
    loadFailed: loadFailed,
    mobileTab: mobileTab,
    move: move,
    phase: phase,
    prompt: prompt,
    question: question,
    zoomVisual: zoomVisual,
    onVisualReady: onVisualReady,
    selected: selected,
    onAssistantOpenChange: setAskOpen,
    onHintChange: setHint,
    onMobileTabChange: setMobileTab,
    onQuestionChange: setQuestion,
    useExample: useExample,
    setView: setView,
    chooseVisualDimension: chooseVisualDimension,
    onVisualOpenChange: setVisualOpen,
    onSurfaceFillChange: setVisualSurfaceFill,
    showAll: showAll,
    solution: solution,
    spatialView: spatialView,
    step: step,
    visualOpen: visualOpen,
    visualSurfaceFill: visualSurfaceFill,
  };
  return {
    header,
    input,
    review,
    result,
    busy,
    error,
    hydrated,
    loadFailed,
    newProblem,
    notice,
    phase,
    prompt,
    session,
    dismissError: () => setError(""),
    correctSourceFromError: (source: string) => {
      confirmSourceCorrection(source);
      setTab("text");
    },
  };
}
