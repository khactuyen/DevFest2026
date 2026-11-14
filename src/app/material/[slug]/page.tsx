import { MaterialPage } from "@/components/MaterialReader";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <MaterialPage slug={(await params).slug} />;
}
