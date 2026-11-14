import { Suspense } from "react";
import { StudioProjector } from "@/components/StudioProjector";

export default function Page() {
  return <Suspense fallback={<p>Đang mở màn trình chiếu…</p>}><StudioProjector /></Suspense>;
}
