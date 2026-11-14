import { Suspense } from "react";
import { SolveWorkspace } from "@/components/SolveWorkspace";
import "./space.css";
import "./space-redesign.css";

export default function Page() {
  return (
    <Suspense
      fallback={<p className="solve-loading">Đang mở Không gian giải…</p>}
    >
      <SolveWorkspace />
    </Suspense>
  );
}
