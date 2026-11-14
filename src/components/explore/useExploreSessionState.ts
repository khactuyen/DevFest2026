"use client";
import {
  type ExplorationEvent,
  type ExplorationSession,
} from "@/lib/exploration-contracts";
import { useRef, useState } from "react";
export function useExploreSessionState() {
  const [sessionOwnerKey, setSessionOwnerKey] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<
    "loading" | "saving" | "saved" | "offline" | "conflict"
  >("loading");
  const [eventRevision, setEventRevision] = useState(0);
  const [availableSession, setAvailableSession] =
    useState<ExplorationSession | null>(null);
  const lastInteractionEventAtRef = useRef(0);
  const sessionIdRef = useRef("");
  const sessionRevisionRef = useRef(0);
  const sessionCreatedAtRef = useRef("");
  const sessionEventsRef = useRef<ExplorationEvent[]>([]);
  const sessionSaveQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const sessionRevisions = useRef(new Map<string, number>());
  return {
    sessionOwnerKey,
    setSessionOwnerKey,
    sessionReady,
    setSessionReady,
    sessionStatus,
    setSessionStatus,
    eventRevision,
    setEventRevision,
    availableSession,
    setAvailableSession,
    lastInteractionEventAtRef,
    sessionIdRef,
    sessionRevisionRef,
    sessionCreatedAtRef,
    sessionEventsRef,
    sessionSaveQueueRef,
    sessionRevisions,
  };
}
