import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Playground } from "@/components/Playground";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const { mode } = await searchParams;
  if (mode === "author") redirect("/studio");

  return (
    <Suspense fallback={<p>Đang tải không gian…</p>}>
      <Playground />
    </Suspense>
  );
}
