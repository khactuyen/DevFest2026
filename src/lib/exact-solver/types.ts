export type ExactStep = { title: string; content: string };
export type ExactMethod = {
  id: string;
  label: string;
  description: string;
  steps: ExactStep[];
};
export type ExactResult = {
  family: string;
  topic: string;
  domain: string;
  answer: string;
  methods: ExactMethod[];
  checks: string[];
  rationalSolutions?: { variable: string; values: string[] };
};
export function result(
  family: string,
  topic: string,
  domain: string,
  answer: string,
  label: string,
  steps: ExactStep[],
  checks: string[],
): ExactResult {
  if (!checks.length || checks.some((s) => s.length > 1200))
    throw Error("Thiếu kiểm tra chính xác.");
  return {
    family,
    topic,
    domain,
    answer,
    methods: [
      {
        id: "ai-0",
        label,
        description:
          "Tính bằng quy tắc toán học và số học chính xác; không gọi model để tạo đáp án.",
        steps,
      },
    ],
    checks,
  };
}
