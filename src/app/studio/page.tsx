import { Suspense } from "react";
import { GuidedStudio } from "@/components/GuidedStudio";
import { AccessGate } from "@/components/AccessGate";

export default function Page() {
  return (
    <AccessGate><Suspense fallback={<div className="gs-loading">Đang mở Studio…</div>}>
      <GuidedStudio />
    </Suspense></AccessGate>
  );
}
