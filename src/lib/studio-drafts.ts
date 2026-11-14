import { MaterialSchema, type Material } from "./contracts";
import { readBrowserDraft, writeBrowserDraft } from "./browser-draft";

export type StudioStage = "start" | "info" | "outline" | "edit" | "preview" | "finish";
export type StudioDraft = {
  doc: Material; persisted: boolean; dirty: boolean;
  stage: StudioStage; stepId: string; blockId: string;
};

export function studioDraftDiscarded(key: string, id: string) {
  return readBrowserDraft<boolean>(`${key}:deleted:${id}`) === true;
}

export function storeStudioDraft(key: string, draft: StudioDraft) {
  const id = draft.doc.id;
  if (studioDraftDiscarded(key, id)) return false;
  const existing = readStudioDraft(key, id);
  if (existing?.persisted && (!draft.persisted || existing.doc.revision > draft.doc.revision)) {
    return !draft.dirty || writeBrowserDraft(`${key}:conflict:${id}`, draft);
  }
  if (existing?.persisted && existing.dirty && !draft.dirty && existing.doc.revision === draft.doc.revision) return true;
  return writeBrowserDraft(`${key}:${id}`, draft);
}

export function readStudioDraft(key: string, id: string) {
  if (studioDraftDiscarded(key, id)) return null;
  const draft = readBrowserDraft<StudioDraft>(`${key}:${id}`);
  if (draft?.doc?.id === id) return draft;
  const legacy = readBrowserDraft<StudioDraft>(key);
  return legacy?.doc?.id === id ? legacy : null;
}

export function listStudioDrafts(key: string): StudioDraft[] {
  const drafts = new Map<string, StudioDraft>();
  try {
    const legacy = readBrowserDraft<StudioDraft>(key);
    const ids = new Set(legacy?.doc?.id ? [legacy.doc.id] : []);
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      const id = name?.startsWith(`${key}:`) ? name.slice(key.length + 1) : "";
      if (id && !id.includes(":")) ids.add(id);
    }
    for (const id of ids) {
      const draft = readStudioDraft(key, id);
      if (draft?.doc?.id === id && draft.doc.status === "draft" && MaterialSchema.safeParse(draft.doc).success) drafts.set(id, draft);
    }
  } catch { /* Storage can be unavailable in private or restricted contexts. */ }
  return [...drafts.values()];
}

export function discardStudioDraft(key: string, id: string) {
  if (!writeBrowserDraft(`${key}:deleted:${id}`, true)) return false;
  try {
    localStorage.removeItem(`${key}:${id}`);
    localStorage.removeItem(`${key}:conflict:${id}`);
    localStorage.removeItem(`math-studio:position:${id}`);
    if (readBrowserDraft<StudioDraft>(key)?.doc?.id === id) localStorage.removeItem(key);
  } catch { /* The deletion marker already prevents restoration. */ }
  return true;
}

export async function withStudioDraftLock<T>(key: string, id: string, action: () => Promise<T>): Promise<T> {
  // Coordinate tabs on the same device. Server revisions cover account writes across devices.
  return navigator.locks ? navigator.locks.request(`${key}:lock:${id}`, action) : action();
}
