"use client";

const storageKey = "math_studio_learner_id";
let memoryId: string | null = null;
let accountId: string | null = null;
export function setLearnerIdentity(id: string | null) { accountId = id; }

export function learnerSessionId() {
  if (accountId) return `user_${accountId.replace(/-/g, "")}`;
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(storageKey);
  } catch {
    /* blocked storage */
  }
  if (id && !/^[a-zA-Z][\w-]{0,63}$/.test(id)) id = null;
  if (!id) {
    id = memoryId || `learner_${crypto.randomUUID().replace(/-/g, "")}`;
    try {
      window.localStorage.setItem(storageKey, id);
    } catch {
      /* in-memory fallback */
    }
  }
  memoryId = id;
  return id;
}

export function learnerRequestHeaders() {
  return {};
}
