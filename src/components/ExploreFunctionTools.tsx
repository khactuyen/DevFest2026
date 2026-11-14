"use client";
import { useState, useEffect } from "react";
import { FunctionSquare, ChartNoAxesCombined,X } from "lucide-react";
import {
  ObjectSchema,
  type TwoDVisualSpec,
  type VisualSpec,
} from "@/lib/contracts";
import {
  compileGraphExpression,
  graphParameters,
  analyzeFunction,
  tangentSlope,
  functionTable,
  compileRegionExpression,
  integrateFunction,
} from "@/lib/function-analysis";
import { compileExpression } from "@/lib/expression";
import { uid } from "@/lib/drawing-id";
import { validateVisual } from "@/lib/validation";
import { freeBoardPosition } from "@/lib/board-content";
import type { ExploreRuntime } from "./explore/shared";
import { pattern } from "@/lib/patterns";
import { pasteSceneObjects } from "@/lib/scene-clipboard";
export function ExploreFunctionTools({
  getRuntime,
  onCommit,
  stage,
  selectedObjectId,
}: {
  getRuntime: () => ExploreRuntime | null | undefined;
  onCommit: (s: VisualSpec, label?: string) => void;
  stage?: HTMLElement | null;
  selectedObjectId?: string;
}) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState("functionGraph"),
    [expression, setExpression] = useState("x^3-3*x+m"),
    [expressionY, setExpressionY] = useState("sin(t)"),
    [min, setMin] = useState(-5),
    [max, setMax] = useState(5),
    [at, setAt] = useState(1),
    [error, setError] = useState("");
  const [report, setReport] = useState(""),
    [selected, setSelected] = useState("");
  useEffect(() => {
    if (selectedObjectId) setSelected(selectedObjectId);
  }, [selectedObjectId]);
  useEffect(() => {
    const cancel = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, []);
  const snapshot = (): TwoDVisualSpec => {
    const scene = getRuntime()?.serialized();
    if (scene?.dimension === "3d") throw Error("Chuyển về bảng 2D để vẽ hàm số.");
    // A blank board has no persisted scene. Validate after inserting the first object.
    return scene ?? {
      id: uid(),
      version: 1,
      dimension: "2d",
      engine: "jsxgraph",
      kind: "cartesian",
      surfaceFill: true,
      parameters: [],
      objects: [],
      viewport: { x: [-7, 7], y: [-5, 5] },
    };
  };
  function run(f: () => void) {
    try {
      f();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chưa dựng được đồ thị.");
    }
  }
  function add() {
    const s = snapshot();
    const formula = kind === "functionGraph" ? expression.replace(/^\s*y\s*=\s*/i, "").trim() : expression;
    if (!(min < max)) throw Error("Miền cần có đầu trái nhỏ hơn đầu phải.");
    const names = graphParameters(
        formula + (kind === "parametric" ? ` ${expressionY}` : ""),
      ),
      missing = names.filter((n) => !s.parameters.some((p) => p.id === n));
    if (s.parameters.length + missing.length > 12)
      throw Error("Tối đa 12 tham số.");
    const parameters = [
      ...s.parameters,
      ...missing.map((id) => ({
        id,
        label: id,
        min: -5,
        max: 5,
        value: 0,
        step: 0.1,
      })),
    ];
    if (kind === "functionGraph") compileGraphExpression(formula, names);
    else if (kind === "inequality") compileRegionExpression(expression, names);
    else {
      compileExpression(expression, ["t", "y", ...names]);
      if (kind === "parametric")
        compileExpression(expressionY, ["t", ...names]);
    }
    const object = ObjectSchema.parse({
      id: uid(),
      type: kind,
      expression: formula,
      ...(kind === "parametric" ? { expressionY } : {}),
      domain: [min, max],
      color: "#168265",
      label: kind === "functionGraph" ? `y = ${formula}`.slice(0, 100) : kind,
    });
    onCommit(
      validateVisual({
        ...s,
        kind: "cartesian",
        parameters,
        objects: [...s.objects, object],
      }),
      "Đã thêm đồ thị",
    );
    setSelected(object.id);
  }
  function analyze(
    mode: "variation" | "sign" | "tangent" | "integral" | "area",
  ) {
    const s = snapshot(),
      object =
        s.objects.find((o) => o.id === selected) ||
        (functions.length === 1 ? functions[0] : undefined);
    if (!object?.expression || object.type !== "functionGraph")
      throw Error("Chọn một hàm y=f(x) trước.");
    const parameters = Object.fromEntries(
      s.parameters.map((p) => [p.id, p.value]),
    );
    if (mode === "tangent") {
      const f = compileGraphExpression(
          object.expression,
          Object.keys(parameters),
        ),
        y = f({ ...parameters, x: at }),
        slope = tangentSlope((x) => f({ ...parameters, x }), at);
      if (!Number.isFinite(y) || !Number.isFinite(slope))
        throw Error("Tiếp tuyến chưa xác định tại điểm này.");
      onCommit(
        {
          ...s,
          objects: [
            ...s.objects,
            ObjectSchema.parse({
              id: uid(),
              type: "functionGraph",
              expression: `(${slope})*(x-(${at}))+(${y})`,
              tangentOf: { sourceId: object.id, at },
              lineStyle: "dashed",
              color: "#ce8b32",
              label: `Tiếp tuyến tại x=${at}`,
            }),
          ],
        },
        "Đã dựng tiếp tuyến",
      );
      return;
    }
    if (mode === "integral" || mode === "area") {
      setReport(
        `${mode === "area" ? "Diện tích với trục Ox" : "Tích phân"} trên [${min}, ${max}] ≈ ${integrateFunction(object.expression, min, max, parameters, mode === "area").toPrecision(8)}. Kết quả tích phân số, cần đối chiếu điều kiện liên tục.`,
      );
      return;
    }
    const r = analyzeFunction(object.expression, min, max, parameters),
      fmt = (n: number) => Number(n.toFixed(5));
    setReport(
      mode === "variation"
        ? `Nghiệm gần đúng: ${r.allRealRoots ? "mọi x trong miền" : r.roots.map(fmt).join(", ") || "chưa tìm thấy"}; điểm tới hạn ước lượng: ${r.critical.map((p) => `(${fmt(p.x)}; ${fmt(p.y)})`).join(", ") || "chưa tìm thấy"}.`
        : `Nghiệm gần đúng: ${r.allRealRoots ? "mọi x trong miền" : r.roots.map(fmt).join(", ") || "chưa tìm thấy"}.`,
    );
    const cells = functionTable(object.expression, min, max, parameters, mode);
    onCommit(
      {
        ...s,
        boardItems: [
          ...(s.boardItems || []),
          {
            id: uid(),
            kind: "table",
            ...freeBoardPosition(
              s.boardItems || [],
              Math.min(440, Math.max(100, (stage?.clientWidth || 1200) - 36)),
              170,
              stage?.clientWidth,
              stage?.clientHeight,
            ),
            width: Math.min(
              440,
              Math.max(100, (stage?.clientWidth || 1200) - 36),
            ),
            height: 170,
            text: `Khảo sát gần đúng trên [${min}; ${max}]. Không thay thế chứng minh; gián đoạn cần đối chiếu.`,
            fontSize: 15,
            visible: true,
            cells,
            graphLink: { sourceId: object.id, mode, min, max, manual: false },
          },
        ],
      },
      "Đã lập bảng khảo sát (gần đúng)",
    );
  }
  const current = getRuntime()?.serialized(),
    functions =
      current?.dimension === "2d"
        ? current.objects.filter((o) => o.type === "functionGraph")
        : [];
  const angleId =
      current?.dimension === "2d"
        ? current.objects.find((o) => o.angleParameter)?.angleParameter
        : undefined,
    theta = current?.parameters.find((p) => p.id === angleId)?.value;
  return (
    <div className="explore-spatial-tools">
      <button aria-expanded={open} onClick={() => setOpen(!open)}>
        <FunctionSquare size={14} />
        Hàm số
      </button>
      {open && (
        <div className="explore-spatial-menu">
          <button className="tool-menu-close" aria-label="Đóng công cụ hàm số" onClick={()=>setOpen(false)}><X size={14}/></button>
          <b>
            <ChartNoAxesCombined size={15} />
            Đồ thị và khảo sát
          </b>
          <button
            onClick={() =>
              run(() =>
                onCommit(
                  pasteSceneObjects(snapshot(), pattern("unit-circle")),
                  "Đã thêm vòng lượng giác. Kéo P hoặc đổi góc để quan sát.",
                ),
              )
            }
          >
            Thêm đường tròn lượng giác
          </button>
          {theta !== undefined && angleId && (
            <div>
              <small>
                θ = {Number(theta.toFixed(5))} rad ={" "}
                {Number(((theta * 180) / Math.PI).toFixed(3))}° · sin ={" "}
                {Number(Math.sin(theta).toFixed(5))} · cos ={" "}
                {Number(Math.cos(theta).toFixed(5))} · tan ={" "}
                {Math.abs(Math.cos(theta)) < 1e-8
                  ? "không xác định"
                  : Number(Math.tan(theta).toFixed(5))}{" "}
                · cot ={" "}
                {Math.abs(Math.sin(theta)) < 1e-8
                  ? "không xác định"
                  : Number((1 / Math.tan(theta)).toFixed(5))}
              </small>
              <div className="spatial-form">
                {[0, 30, 45, 60, 90, 120, 135, 150, 180, 270, 360].map(
                  (degrees) => (
                    <button
                      key={degrees}
                      onClick={() =>
                        run(() => {
                          const s = snapshot();
                          onCommit(
                            {
                              ...s,
                              parameters: s.parameters.map((p) =>
                                p.id === angleId
                                  ? { ...p, value: (degrees * Math.PI) / 180 }
                                  : p,
                              ),
                            },
                            `Góc ${degrees}°`,
                          );
                        })
                      }
                    >
                      {degrees}°
                    </button>
                  ),
                )}
              </div>
            </div>
          )}
          <select
            aria-label="Dạng đồ thị"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              if (e.target.value === "parametric") setExpression("cos(t)");
              if (e.target.value === "implicit") setExpression("x^2+y^2-4");
              if (e.target.value === "inequality") setExpression("x+y-2");
              if (e.target.value === "sequence") setExpression("1/t");
            }}
          >
            <option value="functionGraph">Hàm y = f(x)</option>
            <option value="parametric">Đường tham số x(t), y(t)</option>
            <option value="implicit">Phương trình F(x,y) = 0</option>
            <option value="inequality">Miền F(x,y) ≤ 0</option>
            <option value="sequence">Dãy số u(t), t nguyên</option>
          </select>
          <input
            aria-label="Biểu thức đồ thị"
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
          />
          {kind === "parametric" && (
            <input
              aria-label="Biểu thức y(t)"
              value={expressionY}
              onChange={(e) => setExpressionY(e.target.value)}
            />
          )}
          <small>
            Hỗ trợ sin, cos, tan, log, exp, abs, sqrt. Nhánh: x^2 @ x &lt; 0; x
            @ x &gt;= 0. Dùng dấu * khi nhân. Biến khác tự tạo thanh trượt.
          </small>
          <div className="spatial-form">
            <label>
              Từ
              <input
                aria-label="Đầu miền"
                type="number"
                value={min}
                onChange={(e) => setMin(Number(e.target.value))}
              />
            </label>
            <label>
              Đến
              <input
                aria-label="Cuối miền"
                type="number"
                value={max}
                onChange={(e) => setMax(Number(e.target.value))}
              />
            </label>
            <button onClick={() => run(add)}>Thêm đồ thị</button>
          </div>
          <select
            aria-label="Hàm khảo sát"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
          >
            <option value="">Chọn hàm</option>
            {functions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label || o.expression}
              </option>
            ))}
          </select>
          <div className="spatial-tool-grid">
            <button onClick={() => run(() => analyze("variation"))}>
              Bảng biến thiên ≈
            </button>
            <button onClick={() => run(() => analyze("sign"))}>
              Bảng xét dấu ≈
            </button>
            <button onClick={() => run(() => analyze("integral"))}>
              Tích phân số ≈
            </button>
            <button onClick={() => run(() => analyze("area"))}>
              Diện tích số ≈
            </button>
          </div>
          <div className="spatial-form">
            <label>
              x tiếp xúc
              <input
                type="number"
                value={at}
                onChange={(e) => setAt(Number(e.target.value))}
              />
            </label>
            <button onClick={() => run(() => analyze("tangent"))}>
              Dựng tiếp tuyến
            </button>
          </div>
          {report && <p role="status">{report}</p>}
          {current?.parameters.length ? (
            <details>
              <summary>Phạm vi và chuyển động tham số</summary>
              {current.parameters.map((parameter) => (
                <form
                  key={parameter.id}
                  className="spatial-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    run(() => {
                      const min = Number(data.get("min")),
                        max = Number(data.get("max")),
                        step = Number(data.get("step")),
                        value = Number(data.get("value"));
                      if (
                        ![min, max, step, value].every(Number.isFinite) ||
                        min >= max ||
                        step <= 0
                      )
                        throw Error("Cần min < max và bước > 0.");
                      const s = getRuntime()?.serialized();
                      if (s)
                        onCommit(
                          {
                            ...s,
                            parameters: s.parameters.map((p) =>
                              p.id === parameter.id
                                ? {
                                    ...p,
                                    min,
                                    max,
                                    step,
                                    value: Math.max(
                                      min,
                                      Math.min(max, value),
                                    ),
                                  }
                                : p,
                            ),
                          },
                          "Đã đổi phạm vi tham số",
                        );
                    });
                  }}
                >
                  <b>{parameter.label}</b>
                  <label>
                    Giá trị
                    <input name="value" type="number" step="any" required defaultValue={parameter.value} />
                  </label>
                  <label>
                    Min
                    <input
                      name="min"
                      type="number"
                      step="any"
                      defaultValue={parameter.min}
                    />
                  </label>
                  <label>
                    Max
                    <input
                      name="max"
                      type="number"
                      step="any"
                      defaultValue={parameter.max}
                    />
                  </label>
                  <label>
                    Bước
                    <input
                      name="step"
                      type="number"
                      step="any"
                      min=".000001"
                      defaultValue={parameter.step}
                    />
                  </label>
                  <button type="submit">Áp dụng</button>
                  <button
                    type="button"
                    onClick={() =>
                      run(() =>
                        getRuntime()?.actions([
                          {
                            type: "animateParameter",
                            parameter: parameter.id,
                            from: parameter.min,
                            to: parameter.max,
                            durationMs: 4000,
                            loop: true,
                          },
                        ]),
                      )
                    }
                  >
                    Chạy
                  </button>
                  <button type="button" onClick={() => getRuntime()?.stop()}>
                    Dừng
                  </button>
                </form>
              ))}
            </details>
          ) : null}
          {error && (
            <p role="alert" style={{ color: "#ac4a24" }}>
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
