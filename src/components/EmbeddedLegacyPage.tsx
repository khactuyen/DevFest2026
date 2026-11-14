"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/** Keeps navigation inside Next while an older page is still rendered in an iframe. */
export function EmbeddedLegacyPage({ src, title }: { src: string; title: string }) {
  const router = useRouter();
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);

  const attach = useCallback((frame: HTMLIFrameElement): boolean => {
    const doc = frame.contentDocument;
    if (!doc?.querySelector("body > main")) return false;
    if (doc.documentElement.dataset.mathVisionEmbedded === "true") {
      setReady(true);
      return true;
    }
    doc.documentElement.dataset.mathVisionEmbedded = "true";
    const style = doc.createElement("style");
    style.textContent = "body > header { display: none !important; } body > main { padding-top: 0 !important; }";
    doc.head.append(style);
    doc.addEventListener("click", (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const node = event.target as Node | null;
      const element = node?.nodeType === 1 ? node as Element : node?.parentElement;
      const anchor = element?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor || anchor.hasAttribute("download") || anchor.target === "_blank") return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const destination = new URL(anchor.href, doc.baseURI);
      if (destination.origin !== window.location.origin || /\.[^/]+$/.test(destination.pathname)) return;
      event.preventDefault();
      router.push(destination.pathname + destination.search + destination.hash);
    }, { capture: true });
    window.requestAnimationFrame(() => setReady(true));
    return true;
  }, [router]);

  // A static iframe can finish loading before React hydrates its onLoad handler.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || attach(frame)) return;
    const timer = window.setInterval(() => { if (attach(frame)) window.clearInterval(timer); }, 50);
    return () => window.clearInterval(timer);
  }, [attach, src]);

  return <div className={`embedded-legacy-page ${ready ? "ready" : ""}`}>
    <iframe ref={frameRef} className="stitch-home-frame" src={`${src}?embedded=1`} title={title}
      onLoad={(event) => { attach(event.currentTarget); }} />
  </div>;
}
