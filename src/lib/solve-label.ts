import type { SolveSession } from "./solve-contracts";
export function solveMethodLabel(session: SolveSession): string {
  if (session.guidedSolution)
    return (
      session.guidedSolution.problem.methods.find(
        (m) => m.id === session.guidedSolution?.method,
      )?.label || "Cách giải AI"
    );
  if (!session.method) return "Chưa chọn cách giải";
  return {
    formula: "Công thức nghiệm",
    square: "Hoàn thành bình phương",
    isolate: "Chuyển vế",
    "sign-chart": "Bảng xét dấu",
  }[session.method];
}
