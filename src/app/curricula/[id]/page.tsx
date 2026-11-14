import { CurriculumBuilder } from "@/components/CurriculumBuilder";
import { AccessGate } from "@/components/AccessGate";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AccessGate author><CurriculumBuilder curriculumId={id} /></AccessGate>;
}
