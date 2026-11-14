import { LearnerLesson } from "@/components/LearnerLesson";

export default async function Page({ params }: { params: Promise<{ id: string; lessonId: string }> }) {
  const { id, lessonId } = await params;
  return <LearnerLesson curriculumId={id} lessonId={lessonId} />;
}
