/** Best-effort device drafts. Server persistence must not depend on storage access. */
export function readBrowserDraft<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) || "null") as T | null; }
  catch { return null; }
}
export function writeBrowserDraft(key: string, value: unknown): boolean {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch { return false; }
}

// Files are blobs, not JSON. IndexedDB preserves them without base64/localStorage limits.
async function fileDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("math-vision-draft-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function draftFiles(key: string, files?: File[]): Promise<File[]> {
  const db = await fileDatabase();
  try {
    return await new Promise<File[]>((resolve, reject) => {
      const tx = db.transaction("files", files ? "readwrite" : "readonly");
      const request = files ? tx.objectStore("files").put(files, key) : tx.objectStore("files").get(key);
      let result: File[] = files || [];
      request.onsuccess = () => { if (!files) result = request.result || []; };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
