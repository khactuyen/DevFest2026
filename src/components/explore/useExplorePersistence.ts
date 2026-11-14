"use client";
import { readBrowserDraft, writeBrowserDraft } from "@/lib/browser-draft";
import { request } from "@/lib/client";
import {
  ExplorationSessionSchema,
  resultForExplorationScene,
  sceneForExplorationSave,
  type ExplorationSession,
} from "@/lib/exploration-contracts";
import { learnerSessionId } from "@/lib/learner";
import { useEffect } from "react";
import { hasRecoverableContent } from "./shared";
import type { ExploreState } from "./useExploreState";
type Context = Pick<
  ExploreState,
  | "patterns"
  | "selected"
  | "visual"
  | "result"
  | "problemPrompt"
  | "recognitionDraft"
  | "inputTab"
  | "latexDraft"
  | "handwritingDraft"
  | "handwritingUndo"
  | "sessionOwnerKey"
  | "setSessionOwnerKey"
  | "sessionReady"
  | "setSessionReady"
  | "setSessionStatus"
  | "eventRevision"
  | "reflectionPrompt"
  | "activeStep"
  | "completed"
  | "learningTab"
  | "error"
  | "setNotice"
  | "assistantAnswer"
  | "setAvailableSession"
  | "inkDraft"
  | "visualState"
  | "boardOptions"
  | "runtime"
  | "visualStateRef"
  | "sessionIdRef"
  | "sessionRevisionRef"
  | "sessionCreatedAtRef"
  | "sessionEventsRef"
  | "sessionSaveQueueRef"
  | "sessionRevisions"
>;
export function useExplorePersistence({
  patterns,
  selected,
  visual,
  result,
  problemPrompt,
  recognitionDraft,
  inputTab,
  latexDraft,
  handwritingDraft,
  handwritingUndo,
  sessionOwnerKey,
  setSessionOwnerKey,
  sessionReady,
  setSessionReady,
  setSessionStatus,
  eventRevision,
  reflectionPrompt,
  activeStep,
  completed,
  learningTab,
  error,
  setNotice,
  assistantAnswer,
  setAvailableSession,
  inkDraft,
  visualState,
  boardOptions,
  runtime,
  visualStateRef,
  sessionIdRef,
  sessionRevisionRef,
  sessionCreatedAtRef,
  sessionEventsRef,
  sessionSaveQueueRef,
  sessionRevisions,
}: Context, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    const ownerKey = learnerSessionId();
    const localKey = `math-studio:explore-session:${ownerKey}`;
    setSessionOwnerKey(ownerKey);
    sessionIdRef.current = crypto.randomUUID();
    sessionCreatedAtRef.current = new Date().toISOString();
    sessionRevisionRef.current = 0;
    let localSession: ExplorationSession | null = null;
    try {
      const savedKeys = Array.from(
        { length: window.localStorage.length },
        (_, index) => window.localStorage.key(index),
      ).filter(
        (key): key is string =>
          key === localKey || Boolean(key?.startsWith(`${localKey}:`)),
      );
      const localSessions = savedKeys
        .flatMap((key) => {
          try {
            const parsed = ExplorationSessionSchema.safeParse(
              JSON.parse(window.localStorage.getItem(key!) || "null"),
            );
            return parsed.success ? [parsed.data as ExplorationSession] : [];
          } catch {
            return [];
          }
        })
        .filter(hasRecoverableContent)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      if (localSessions[0]) {
        localSession = localSessions[0];
        setAvailableSession(localSession);
      }
    } catch {
      /* A corrupt local snapshot must not prevent opening Explore. */
    }
    request<ExplorationSession[]>(
      `/api/explore-sessions?ownerKey=${encodeURIComponent(ownerKey)}`,
    )
      .then((sessions) => {
        if (!alive || !sessions.length) return;
        const latest = sessions.find(hasRecoverableContent);
        if (!latest) return;
        const localPending =
          localSession &&
          readBrowserDraft<{ pending: boolean }>(
            `${localKey}:${localSession.id}:pending`,
          )?.pending;
        if (
          !localSession ||
          (!localPending && latest.updatedAt > localSession.updatedAt)
        )
          setAvailableSession(latest);
      })
      .catch(() => {
        if (alive) setSessionStatus("offline");
      })
      .finally(() => {
        if (alive) setSessionReady(true);
      });
    return () => {
      alive = false;
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || !sessionReady || !sessionOwnerKey) return;
    // Do not create a newer, empty session merely by visiting Explore; that
    // would bury the learner's actual last session in the resume chooser.
    if (
      !visual &&
      !result &&
      !problemPrompt.trim() &&
      !reflectionPrompt.trim() &&
      !assistantAnswer &&
      !inkDraft &&
      !handwritingDraft.length &&
      !latexDraft &&
      !recognitionDraft &&
      eventRevision === 0
    )
      return;
    const now = new Date().toISOString();
    const savedScene = sceneForExplorationSave(
      visual,
      visual ? runtime.current?.serialized() : null,
    );
    const session: ExplorationSession = {
      id: sessionIdRef.current || (sessionIdRef.current = crypto.randomUUID()),
      ownerKey: sessionOwnerKey,
      revision: sessionRevisionRef.current,
      title:
        result?.title ||
        patterns.find((item) => item.key === selected)?.title ||
        "Phiên khám phá",
      prompt: problemPrompt,
      reflectionPrompt,
      patternKey: selected,
      visual: savedScene,
      result: savedScene
        ? resultForExplorationScene(savedScene, [result])
        : null,
      visualState:
        visualStateRef.current?.visualId === savedScene?.id
          ? visualStateRef.current || null
          : null,
      inkDraft,
      handwritingDraft,
      handwritingUndo,
      inputTab,
      latexDraft,
      boardOptions,
      assistantAnswer,
      activeStep,
      completedSteps: completed,
      learningTab,
      events: sessionEventsRef.current,
      createdAt: sessionCreatedAtRef.current || now,
      updatedAt: now,
    };
    const key = `math-studio:explore-session:${sessionOwnerKey}:${session.id}`;
    const localSaved = writeBrowserDraft(key, session);
    const token = crypto.randomUUID();
    writeBrowserDraft(`${key}:pending`, { token, pending: true });
    writeBrowserDraft(
      `math-studio:explore-input:${sessionOwnerKey}:${session.id}`,
      recognitionDraft,
    );
    if (!localSaved)
      setNotice("Không lưu được trên thiết bị; đang thử lưu vào tài khoản.");
    const timer = window.setTimeout(() => {
      setSessionStatus("saving");
      sessionSaveQueueRef.current = sessionSaveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const pendingSession = {
            ...session,
            revision:
              sessionRevisions.current.get(session.id) ?? session.revision,
          };
          const saved = await request<ExplorationSession>(
            "/api/explore-sessions",
            { method: "POST", body: JSON.stringify(pendingSession) },
          );
          sessionRevisions.current.set(
            saved.id,
            Math.max(
              sessionRevisions.current.get(saved.id) || 0,
              saved.revision,
            ),
          );
          // A server timestamp from an older request must not supersede newer device edits.
          const marker = readBrowserDraft<{ token: string }>(`${key}:pending`);
          if (marker?.token === token)
            writeBrowserDraft(`${key}:pending`, { token, pending: false });
          if (sessionIdRef.current === saved.id) {
            sessionRevisionRef.current = Math.max(
              sessionRevisionRef.current,
              saved.revision,
            );
            try {
              const latestLocal = JSON.parse(
                window.localStorage.getItem(key) || "null",
              ) as ExplorationSession | null;
              if (latestLocal?.id === saved.id)
                window.localStorage.setItem(
                  key,
                  JSON.stringify({
                    ...latestLocal,
                    revision: Math.max(latestLocal.revision, saved.revision),
                  }),
                );
            } catch {
              /* The server copy is authoritative after a successful save. */
            }
          }
          if (sessionIdRef.current === saved.id) setSessionStatus("saved");
        })
        .catch((error: Error & { code?: string }) => {
          if (sessionIdRef.current === session.id)
            setSessionStatus(
              error.code === "session_revision_conflict"
                ? "conflict"
                : "offline",
            );
        });
    }, 850);
    return () => window.clearTimeout(timer);
  }, [
    activeStep,
    assistantAnswer,
    completed,
    eventRevision,
    inkDraft,
    learningTab,
    patterns,
    problemPrompt,
    reflectionPrompt,
    result,
    selected,
    sessionOwnerKey,
    sessionReady,
    visual,
    visualState,
    handwritingDraft,
    handwritingUndo,
    inputTab,
    latexDraft,
    boardOptions,
    recognitionDraft,
  ]);
}
