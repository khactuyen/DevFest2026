import { PrintPage } from "@/components/PrintPage";
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PrintPage id={(await params).slug} />;
}
