import { z } from "zod";

export const SolveModeSchema = z.enum(["standard", "detailed"]);
export type SolveMode = z.infer<typeof SolveModeSchema>;
export const SOLVE_MODES = [
  { id: "standard", label: "Giải chuẩn", description: "Đủ bước và lập luận như bài thi, kiểm tra." },
  { id: "detailed", label: "Giải chuyên sâu", description: "Chia nhỏ phép biến đổi, giải thích vì sao từng bước đúng." },
] as const;
export const solveModeLabel = (mode: SolveMode) =>
  SOLVE_MODES.find(item => item.id === mode)!.label;
