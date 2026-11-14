// Symbolic utilities intentionally stay separate from the visual arithmetic DSL.
export async function inspectMath(latex: string) {
  if (latex.length > 1000) throw Error("Công thức quá dài");
  // The package exposes a browser UMD build and an ESM build. Namespace loading
  // keeps Next from selecting a non-existent named browser export at build time.
  const module = await import("@cortex-js/compute-engine");
  const ComputeEngine = module.ComputeEngine;
  if (!ComputeEngine) throw Error("Không thể khởi tạo bộ máy tính toán");
  const ce = new ComputeEngine();
  const expression = ce.parse(latex);
  if (!expression.isValid) throw Error("Công thức chưa hợp lệ");
  return {
    mathJSON: expression.json,
    canonical: expression.latex,
    simplified: expression.simplify().latex,
    numeric: expression.N().latex,
  };
}
