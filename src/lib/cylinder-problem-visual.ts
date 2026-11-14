import { AppError } from "./app-error";
import type { AgentResult, ThreeVisualSpec, TwoDVisualSpec } from "./contracts";
import { compileExpression } from "./expression";
import { validateAgent, validateVisual } from "./validation";
import type { ModelReadout } from "./model-inspector";

export const CYLINDER_DIMENSIONS_KEY = "cylinder-dimensions";
type Unit = "mm" | "cm" | "dm" | "m";
const units: Record<Unit, number> = { mm: 0.001, cm: 0.01, dm: 0.1, m: 1 };
type Measure = { value: number; unit?: Unit; expression?: string };
type Dimensions = { radius?: Measure; height?: Measure; diameter?: Measure };
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(1, a, b);
function fail(message: string): never {
  throw new AppError(422, message, "needs_review");
}
export const mentionsCylinder = (source: string) =>
  /(?:hình|khối)\s*trụ|cylinder/iu.test(source.normalize("NFC"));

function normalizedSource(source: string) {
  return source
    .normalize("NFC")
    .replace(/\\(?:mathrm|text|mathbf|mathit)\{([^{}]*)\}/g, "$1")
    .replace(
      /\\(?:dfrac|tfrac|frac)\{(-?\d+(?:[.,]\d+)?)\}\{(\d+(?:[.,]\d+)?)\}/g,
      "($1/$2)",
    )
    .replace(/\\sqrt\{(\d+(?:[.,]\d+)?)\}/g, "sqrt($1)")
    .replace(/√\s*(\d+(?:[.,]\d+)?)/g, "sqrt($1)")
    .replace(/\\(?:cdot|times)/g, "*")
    .replace(/\\(?:left|right)/g, "")
    .replace(/\\(?:\(|\)|\[|\]|[,;:! ])/g, " ")
    .replace(/mét/giu, "m")
    .replace(/[{}$]/g, "")
    .replace(/[−–]/g, "-");
}

/** Right circular cylinder only. Source lengths, not pixels or guessed defaults. */
export function readCylinderDimensions(prompt: string): Dimensions | null {
  if (!mentionsCylinder(prompt)) return null;
  const text = normalizedSource(prompt);
  // Revolutions with named rectangle vertices have a separate reviewed builder.
  if (/hình\s*chữ\s*nhật|quay/iu.test(text)) return null;
  if (
    /(?<!\p{L})[rRhH][_₁₂12]|bán\s*kính\s*(?:trong|ngoài)|[A-Z]{2}\s*(?:=|bằng)|giao\s*điểm|tiếp\s*tuyến|điểm\s*[A-Z]/u.test(
      text,
    )
  )
    fail(
      "Đề hình trụ có điểm/cạnh có tên, nhiều bán kính hoặc quan hệ bổ sung chưa được bộ dựng r/d/h đối chiếu. Không bỏ các dữ kiện này để dựng mẫu trụ khác.",
    );
  if (
    /rỗng|trụ\s*xiên|ống\s*trụ|bề\s*dày|độ\s*dày|thiết\s*diện|mặt\s*cắt|cắt\s*(?:bỏ|đi|bởi)|khoan|hình\s*(?:nón|cầu|chóp)|lăng\s*trụ|(?:hai|ba|2|3)\s*(?:hình|khối)\s*trụ/iu.test(
      text,
    )
  )
    fail(
      "Đề có hình trụ rỗng/xiên, nhiều khối hoặc mặt cắt. Chưa có bộ dựng kiểm chứng cho cấu trúc này; không thay bằng hình trụ đặc hay đa giác.",
    );
  const role = String.raw`(?<![\p{L}\p{N}_])(?:bán\s*kính(?:\s*đáy)?(?:\s*[rR])?|đường\s*kính(?:\s*đáy)?(?:\s*[dD])?|chiều\s*cao(?:\s*[hH])?|[rRhHdD])`;
  const assignment = String.raw`\s*(?:=|:|là|bằng|dài|cao)?\s*`;
  const numeric = String.raw`[+-]?\d+(?:[.,]\d+)?`;
  const atomic = String.raw`(?:${numeric}|sqrt\(${numeric}\)|\(${numeric}\s*\/\s*${numeric}\))`;
  const value = String.raw`(${atomic}(?:\s*(?:\*|\/)\s*${atomic}|\s*sqrt\(${numeric}\))?)`;
  const matches = [
    ...text.matchAll(
      new RegExp(
        `(${role})${assignment}${value}\\s*(mm|cm|dm|m)?(?![\\p{L}\\p{N}_]|[.,]\\d)`,
        "giu",
      ),
    ),
  ];
  const byRole: Record<string, Measure[]> = {
    radius: [],
    height: [],
    diameter: [],
  };
  for (const match of matches) {
    const suffix = text.slice(match.index! + match[0].length);
    if (/^\s*(?:[+*/^²³-]|sqrt\(|pi\b)/u.test(suffix))
      fail(
        "Số đo hình trụ có biểu thức chưa được bộ dựng đọc đầy đủ; hãy ghi giá trị hoặc phân số/căn đơn giản, không dùng phần đầu biểu thức làm số đo.",
      );
    const expression = match[2]
      .replace(/,/g, ".")
      .replace(/\s+/g, "")
      .replace(/(\d|\))sqrt/g, "$1*sqrt");
    let numericValue: number;
    try {
      numericValue = compileExpression(expression)({});
    } catch {
      fail("Biểu thức số đo hình trụ chưa hợp lệ.");
    }
    if (
      !Number.isFinite(numericValue) ||
      numericValue <= 0 ||
      numericValue > 1000
    )
      fail(
        "Bán kính, đường kính và chiều cao hình trụ phải dương, hữu hạn và không vượt 1000 đơn vị.",
      );
    const name = match[1].toLocaleLowerCase("vi");
    const key =
      name.startsWith("bán") || name === "r"
        ? "radius"
        : name.startsWith("đường") || name === "d"
          ? "diameter"
          : "height";
    byRole[key].push({
      value: numericValue,
      unit: match[3] as Unit | undefined,
      ...(/[*/]|sqrt/u.test(expression) ? { expression } : {}),
    });
  }
  // A stated but unreadable assignment is not a missing datum to be guessed.
  for (const match of text.matchAll(
    new RegExp(`${role}\\s*(?:=|:|là|bằng)`, "giu"),
  ))
    if (
      !matches.some(
        (found) =>
          match.index! >= found.index! &&
          match.index! < found.index! + found[0].length,
      )
    )
      fail(
        "Chưa đọc được số đo r/d/h trong đề hình trụ. Hãy đối chiếu ký hiệu, dấu thập phân, căn/phân số và đơn vị trong phần chữ nhận diện.",
      );
  const all = Object.values(byRole).flat();
  if (all.some((m) => m.unit) && all.some((m) => !m.unit))
    fail(
      "Một số số đo hình trụ có đơn vị, số khác chưa rõ đơn vị. Hãy ghi đơn vị cho từng số đo để không dựng sai tỉ lệ.",
    );
  const unit =
    byRole.radius[0]?.unit ||
    byRole.diameter[0]?.unit ||
    byRole.height[0]?.unit;
  const convert = (m: Measure): Measure => {
    const factor = m.unit && unit ? units[m.unit] / units[unit] : 1;
    return {
      value: m.value * factor,
      unit,
      ...(m.expression
        ? {
            expression: close(factor, 1)
              ? m.expression
              : `(${m.expression})*${factor}`,
          }
        : {}),
    };
  };
  const dimensions: Dimensions = {};
  for (const key of ["radius", "height", "diameter"] as const) {
    const converted = byRole[key].map(convert);
    if (converted.some((m) => !close(m.value, converted[0].value)))
      fail(
        `Các số đo ${key === "height" ? "chiều cao" : key === "radius" ? "bán kính" : "đường kính"} trong đề không khớp nhau.`,
      );
    if (converted.length) dimensions[key] = converted[0];
  }
  if (dimensions.diameter) {
    const derived = {
      value: dimensions.diameter.value / 2,
      unit,
      ...(dimensions.diameter.expression
        ? { expression: `(${dimensions.diameter.expression})/2` }
        : {}),
    };
    if (dimensions.radius && !close(dimensions.radius.value, derived.value))
      fail(
        "Bán kính và đường kính mâu thuẫn: cần d = 2r. Không dựng hình từ số đo tùy chọn.",
      );
    dimensions.radius ??= derived;
  }
  const known = [dimensions.radius, dimensions.height].filter(
    (m): m is Measure => !!m,
  );
  if (known.some((m) => m.value > 1000 || m.value < 0.001))
    fail(
      "Kích thước sau đổi đơn vị vượt phạm vi dựng hình (0,001–1000). Hãy dùng một đơn vị phù hợp hơn.",
    );
  return dimensions;
}

const format = (m: Measure) =>
  `${m.expression ? m.expression.replace(/\*?sqrt\(/g, "√(") : Number(m.value.toPrecision(10))}${m.unit ? ` ${m.unit}` : ""}`;
export function cylinderDimensions2d(d: Dimensions): TwoDVisualSpec {
  const radius = d.radius?.value ?? (d.height ? (d.height.value * 2) / 3 : 2);
  const height = d.height?.value ?? radius * 1.5;
  const minor = Math.min(radius * 0.3, height * 0.2);
  const point = (id: string, x: number, y: number) => ({
    id,
    type: "point",
    x,
    y,
    visible: false,
    free: false,
  });
  const objects: Record<string, unknown>[] = [
    point("center_bottom", 0, 0),
    point("center_top", 0, height),
    point("right_top", radius, height),
    point("right_bottom", radius, 0),
    point("left_top", -radius, height),
    point("left_bottom", -radius, 0),
    {
      id: "generator_left",
      type: "segment",
      parents: ["left_bottom", "left_top"],
    },
    {
      id: "generator_right",
      type: "segment",
      parents: ["right_bottom", "right_top"],
    },
    {
      id: "radius_dimension",
      type: "segment",
      parents: ["center_top", "right_top"],
      label: "r",
      ...(d.radius ? { measurement: format(d.radius) } : {}),
      annotationKind: "length",
    },
    {
      id: "height_dimension",
      type: "segment",
      parents: ["right_bottom", "right_top"],
      strokeOpacity: 0,
      label: "h",
      ...(d.height ? { measurement: format(d.height) } : {}),
      annotationKind: "length",
    },
  ];
  for (const [name, y, sign, dashed] of [
    ["bottom_back", 0, 1, true],
    ["bottom_front", 0, -1, false],
    ["top_back", height, 1, false],
    ["top_front", height, -1, false],
  ] as const)
    objects.push({
      id: name,
      type: "functionGraph",
      expression: `${y}+${sign * minor}*sqrt(abs(1-(x/${radius})^2))`,
      domain: [-radius, radius],
      ...(dashed ? { lineStyle: "dashed" } : {}),
    });
  if (d.diameter)
    objects.push({
      id: "diameter_source",
      type: "text",
      x: -radius,
      y: -minor - radius * 0.25,
      text: `d = ${format(d.diameter)}; r = d/2`,
      annotationKind: "length",
    });
  const note =
    !d.radius || !d.height
      ? "Chưa đủ số đo r và h. Hình chỉ minh họa dáng trụ; không suy ra số đo thiếu từ hình, không hiển thị thể tích/diện tích số."
      : d.radius.unit
        ? `Kích thước dựng dùng cùng đơn vị ${d.radius.unit}; hai đáy tròn được chiếu thành elip trong bản 2D.`
        : "Đề chưa ghi đơn vị; không tự gán cm hoặc m. Bản 2D chiếu hai đáy tròn thành elip.";
  return validateVisual({
    id: "cylinder_source_dimensions",
    version: 1,
    dimension: "2d",
    engine: "jsxgraph",
    kind: "geometry",
    source: { key: CYLINDER_DIMENSIONS_KEY, version: 1 },
    parameters: [],
    objects: objects.map((o) => ({ ...o, color: "#17835e" })),
    surfaceFill: false,
    viewport: {
      x: [-radius * 1.6, radius * 2.1],
      y: [-minor - radius * 0.65, height + minor + radius * 0.65],
    },
    accessibility: {
      description:
        note +
        (Math.max(radius / height, height / radius) > 100
          ? " Tỉ lệ r/h chênh lệch; dùng zoom để quan sát. Giữ đúng số đo, không kéo giãn hình cho vừa khung."
          : ""),
    },
  }) as TwoDVisualSpec;
}

export function cylinderDimensions3d(source: TwoDVisualSpec): ThreeVisualSpec {
  const p = (id: string) => source.objects.find((o) => o.id === id);
  const radius = p("right_top")?.x,
    height = p("center_top")?.y;
  if (
    source.source?.key !== CYLINDER_DIMENSIONS_KEY ||
    typeof radius !== "number" ||
    typeof height !== "number" ||
    radius <= 0 ||
    height <= 0
  )
    fail("Cấu trúc hình trụ thiếu bán kính hoặc chiều cao dựng hình hợp lệ.");
  const radiusText = p("radius_dimension")?.measurement,
    heightText = p("height_dimension")?.measurement;
  const labelValue = (text: string | undefined, expected: number) => {
    if (!text) return undefined;
    const match = /^(.*?)\s*(mm|cm|dm|m)?$/.exec(text.trim())!;
    const expression = match[1]
      .trim()
      .replace(/√\(/g, "sqrt(")
      .replace(/(\d|\))sqrt/g, "$1*sqrt")
      .replace(/,/g, ".");
    let value: number;
    try {
      value = compileExpression(expression)({});
    } catch {
      fail(
        "Nhãn số đo hình trụ đã sửa không còn là số đo hợp lệ; không dựng 3D với nhãn và hình mâu thuẫn.",
      );
    }
    if (!close(value, expected))
      fail(
        "Nhãn r/h không khớp kích thước hình trụ đã lưu. Hãy phân tích lại số đo nguồn, không chỉ thay nhãn.",
      );
    return match[2];
  };
  const rUnit = labelValue(radiusText, radius),
    hUnit = labelValue(heightText, height);
  if (rUnit !== hUnit && radiusText && heightText)
    fail(
      "Nhãn r/h đã thay đơn vị nhưng hình chưa đổi tỉ lệ; hãy phân tích lại dữ kiện để đổi đơn vị trước khi dựng 3D.",
    );
  const objects: Record<string, unknown>[] = [
    {
      id: "cylinder",
      type: "cylinder",
      radius,
      height,
      position: [0, height / 2, 0],
      label: "Hình trụ theo dữ kiện nguồn",
    },
    {
      id: "radius_line",
      type: "curve3d",
      points3d: [
        [0, height, 0],
        [radius, height, 0],
      ],
      annotationKind: "length",
    },
    {
      id: "height_line",
      type: "curve3d",
      points3d: [
        [radius, 0, 0],
        [radius, height, 0],
      ],
      annotationKind: "length",
    },
    {
      id: "radius_label",
      type: "label3d",
      text: radiusText ? `r = ${radiusText}` : "r chưa cho (dáng minh họa)",
      position: [radius * 0.4, height + radius * 0.12, 0],
      annotationKind: "length",
    },
    {
      id: "height_label",
      type: "label3d",
      text: heightText ? `h = ${heightText}` : "h chưa cho (dáng minh họa)",
      position: [radius * 1.2, height / 2, 0],
      annotationKind: "length",
    },
  ];
  for (const [id, x] of [
    ["generator_left", -radius],
    ["generator_right", radius],
  ] as const)
    objects.push({
      id,
      type: "curve3d",
      points3d: [
        [x, 0, 0],
        [x, height, 0],
      ],
    });
  const diameter = p("diameter_source");
  if (diameter?.text)
    objects.push({
      id: "diameter_label",
      type: "label3d",
      text: diameter.text,
      position: [0, -radius * 0.2, 0],
      annotationKind: "length",
    });
  return validateVisual({
    id: source.id,
    version: 1,
    dimension: "3d",
    engine: "threejs",
    kind: "solid",
    source: { key: CYLINDER_DIMENSIONS_KEY, version: 1 },
    parameters: [],
    objects,
    surfaceFill: true,
    derivedFrom2d: { source, mode: "cylinder" },
    camera: {
      position: [radius * 3, height * 0.9 + radius, radius * 4],
      target: [0, height / 2, 0],
    },
    accessibility: source.accessibility,
  }) as ThreeVisualSpec;
}

export function cylinderSourceReadout(source: TwoDVisualSpec): ModelReadout {
  const radius = source.objects.find((o) => o.id === "radius_dimension");
  const height = source.objects.find((o) => o.id === "height_dimension");
  return {
    heading: "Hình trụ theo dữ kiện đề",
    formula: "V = πr²h · S toàn phần = 2πr(r + h)",
    metrics: [
      {
        label: "Bán kính",
        value: radius?.measurement || "Chưa cho; dáng minh họa",
      },
      {
        label: "Chiều cao",
        value: height?.measurement || "Chưa cho; dáng minh họa",
      },
    ],
    observations: [
      "Hai đáy là hai đường tròn bằng nhau, không phải đa giác; bản 2D biểu diễn hình chiếu bằng elip.",
      "Số đo không thay đổi khi chuyển 2D/3D. Đơn vị khác nhau được quy đổi trước khi dựng.",
    ],
    focus: [],
    note: source.accessibility?.description,
  };
}

export function cylinderProblemResult(prompt: string): AgentResult | null {
  const d = readCylinderDimensions(prompt);
  if (!d) return null;
  const source = cylinderDimensions2d(d);
  return validateAgent({
    title: "Hình trụ theo dữ kiện đề",
    explanation: source.accessibility?.description || "",
    visual: cylinderDimensions3d(source),
    entities: [],
    methods: [],
    steps: [],
    suggestions: ["Đối chiếu r và h với ảnh nguồn", "Chuyển 2D/3D để quan sát"],
    source: "template",
  });
}
