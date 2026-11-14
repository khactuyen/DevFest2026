"use client";

import { useEffect, useState } from "react";

export function MaterialImage({ src, alt, onLoad, removeFlatBackground = false }: {
  src: string; alt: string; onLoad?: () => void; removeFlatBackground?: boolean;
}) {
  const [resolved, setResolved] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    setResolved("");
    setError("");
    if (!src) return;
    if (!src.startsWith("/api/material-assets/")) {
      setResolved(src);
      return;
    }
    const controller = new AbortController();
    let objectUrl = "";
    setError("");
    void fetch(src, { signal: controller.signal, credentials: "same-origin" })
      .then((response) => { if (!response.ok) throw Error("Không tải được ảnh minh họa."); return response.blob(); })
      .then(async (blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        if (removeFlatBackground) {
          const cleaned = await import("@/lib/flat-image-background")
            .then(({ removeFlatImageBackground }) => removeFlatImageBackground(objectUrl))
            .catch(() => null);
          if (cleaned && !controller.signal.aborted) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = URL.createObjectURL(cleaned);
          }
        }
        if (!controller.signal.aborted) setResolved(objectUrl);
      })
      .catch(() => { if (!controller.signal.aborted) setError("Không tải được ảnh minh họa."); });
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [src, removeFlatBackground]);
  if (error) return <p role="alert">{error}</p>;
  if (!resolved) return <p>Đang tải ảnh…</p>;
  return <img src={resolved} alt={alt} onLoad={onLoad} onError={() => setError("Không tải được ảnh minh họa.")} />;
}
