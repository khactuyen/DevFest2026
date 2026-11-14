"use client";
import { readBrowserDraft, writeBrowserDraft } from "@/lib/browser-draft";
import { request } from "@/lib/client";
import { learnerSessionId } from "@/lib/learner";
import type { SolveSession } from "@/lib/solve-contracts";
import { useEffect, useRef, useState } from "react";
import { message } from "./shared";
import type { RecognizedSource } from "./view-contracts";
type Identity = Pick<SolveSession, "id" | "revision" | "createdAt">;
type InputUI = { tab?: string; recognition?: RecognizedSource | null };
type Options = {
  localKey: string;
  requestedSession: string | null;
  restore(raw: unknown): void;
  reset(): void;
  cancel(): void;
  restoreInput(value: InputUI): void;
  notice(message: string): void;
  error(message: string): void;
};
/** Owns persistence identity/CAS, navigation hydration and the account's saved list. */
export function useSolvePersistence(options: Options) {
  const { localKey, requestedSession } = options;
  const [session, setSession] = useState<Identity | null>(null),
    [owner, setOwner] = useState("");
  const [saved, setSaved] = useState<SolveSession[]>([]),
    [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false),
    [legacyUnbound, setLegacyUnbound] = useState(false);
  const loaded = useRef(false);
  function freshIdentity() {
    setLegacyUnbound(false);
    setSession({
      id: crypto.randomUUID(),
      revision: 0,
      createdAt: new Date().toISOString(),
    });
  }
  function adopt(value: SolveSession) {
    setSession({
      id: value.id,
      revision: value.revision,
      createdAt: value.createdAt,
    });
    setLegacyUnbound(!!value.legacyUnbound);
    setLoadFailed(false);
  }
  function acceptSave(result: SolveSession, current: boolean) {
    // A server write can finish after navigation; preserve CAS only for that document.
    setSession((previous) =>
      previous?.id === result.id
        ? {
            ...previous,
            revision: Math.max(previous.revision, result.revision),
          }
        : previous,
    );
    if (!current) return;
    adopt(result);
    setLegacyUnbound(false);
    setSaved((items) =>
      [result, ...items.filter((s) => s.id !== result.id)].slice(0, 30),
    );
  }
  useEffect(() => {
    if (loaded.current && !requestedSession && !loadFailed) return;
    let alive = true;
    setHydrated(false);
    setLoadFailed(false);
    options.cancel();
    const key = learnerSessionId();
    setOwner(key);
    let local: string | null = null;
    try {
      local = localStorage.getItem(localKey);
    } catch {
      options.notice(
        "Trình duyệt chặn lưu cục bộ; bạn vẫn có thể giải và lưu lên máy chủ.",
      );
    }
    if (!requestedSession && local) {
      try {
        options.restore(JSON.parse(local));
        const input = readBrowserDraft<InputUI>(`${localKey}:input`);
        if (input) options.restoreInput(input);
      } catch {
        options.reset();
        freshIdentity();
        options.notice("Bản cục bộ không hợp lệ; bắt đầu một đề mới.");
      }
    } else if (!requestedSession) freshIdentity();
    request<SolveSession[]>(`/api/solve-sessions?ownerKey=${key}`)
      .then((items) => {
        if (!alive) return;
        setSaved(items);
        if (requestedSession) {
          const found = items.find((s) => s.id === requestedSession);
          if (found) options.restore(found);
          else {
            setLoadFailed(true);
            options.error(
              "Không tìm thấy bài giải đã lưu trên thiết bị này. Bản nháp trước được giữ nguyên.",
            );
          }
        }
      })
      .catch((error) => {
        if (alive && requestedSession) {
          setLoadFailed(true);
          options.error(message(error));
        }
      })
      .finally(() => {
        if (alive) {
          loaded.current = true;
          setHydrated(true);
        }
      });
    return () => {
      alive = false;
    };
    // Navigation chooses when hydration occurs. Callbacks belong to that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestedSession]);
  return {
    session,
    owner,
    saved,
    hydrated,
    loadFailed,
    legacyUnbound,
    freshIdentity,
    adopt,
    acceptSave,
    clearLoadFailure: () => setLoadFailed(false),
    skipNextLocalRestore: () => {
      loaded.current = true;
    },
  };
}
export function useSolveDraft({
  localKey,
  snapshot,
  hydrated,
  loadFailed,
  input,
  notice,
}: {
  localKey: string;
  snapshot: SolveSession | null;
  hydrated: boolean;
  loadFailed: boolean;
  input: InputUI;
  notice(message: string): void;
}) {
  const failed = useRef(false);
  useEffect(() => {
    if (!hydrated || loadFailed || !snapshot) return;
    try {
      localStorage.setItem(localKey, JSON.stringify(snapshot));
      failed.current = false;
    } catch {
      if (!failed.current) {
        notice(
          "Trình duyệt không lưu được bản trên thiết bị. Hãy dùng Lưu bài giải.",
        );
        failed.current = true;
      }
    }
  }, [localKey, hydrated, snapshot, loadFailed]);
  useEffect(() => {
    if (
      hydrated &&
      !loadFailed &&
      !writeBrowserDraft(`${localKey}:input`, input)
    )
      notice(
        "Không lưu được ảnh nguồn/tab trên thiết bị; hãy giữ trang mở hoặc dùng phần chữ đã nhận diện.",
      );
  }, [hydrated, loadFailed, localKey, input.tab, input.recognition]);
}
