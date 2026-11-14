import type { Metadata } from "next";
import { LessonAssessmentStudent } from "@/components/LessonAssessmentStudent";

export const metadata: Metadata = { title: "Phiếu kiểm tra · MathCos", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return <LessonAssessmentStudent id={(await params).id} />;
}
