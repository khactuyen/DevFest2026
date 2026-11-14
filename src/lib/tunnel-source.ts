import { AppError } from "./app-error";

/** Notation changes only: no correction of OCR point names or invented givens. */
function normalizeSource(source: string) {
  let text = source
    .normalize("NFC")
    .replace(
      /\\(?:dfrac|tfrac|frac)\{([A-Z]{2})\}\{([A-Z]{2})\}\s*=\s*(\d+(?:[.,]\d+)?)/g,
      "$1=$3$2",
    )
    .replace(/\\(?:parallel|Vert)/g, "∥")
    .replace(/\\in\b/g, "∈")
    .replace(/\\(?:cdot|times)/g, "·")
    .replace(/\\(?:left|right|bigl|bigr)\b/g, "")
    .replace(/\\(?:\(|\)|\[|\]|[,;:! ])/g, " ");
  for (let i = 0; i < 4; i++) {
    text = text.replace(
      /\\(?:mathrm|text|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g,
      "$1",
    );
  }
  return text
    .replace(/\\(?:quad|qquad|enspace|thinspace)\b/g, " ")
    .replace(/mét/giu, "m")
    .replace(/[\s{}()$]/g, "")
    .replace(/[·×](?=[A-Z]{2})/g, "");
}

/** A proposed OCR repair, never applied by the renderer without user consent. */
export function tunnelSourceCorrection(source: string) {
  const text = normalizeSource(source);
  if (
    !/đườnghầm/iu.test(text) ||
    !/parabol/iu.test(text) ||
    !/hìnhthang(?:vuông)?ACDE/iu.test(text) ||
    !/AF(?:\|\||\/\/|∥|songsong(?:với)?)CD/iu.test(text) ||
    !/AF=2CD/u.test(text)
  )
    return null;
  const corrected = source.replace(
    /(hình\s+thang\s+(?:vuông\s+)?)(?:\\(?:mathrm|text)\{)?ACDE(?:\})?/iu,
    "$1ACDF",
  );
  if (corrected === source) return null;
  return {
    corrected,
    explanation:
      "Phần chữ đang ghi đáy ACDE nhưng dùng cạnh AF và CD. Ảnh gốc có thể là ACDF (OCR nhầm F thành E). Đối chiếu ảnh trước khi xác nhận; E vẫn là chân parabol.",
  };
}

type Term =
  { segment: string; coefficient: number } | { value: number; unit?: string };
const number = "-?\\d+(?:[.,]\\d+)?";
const termPattern = `(?:${number})?[A-Z]{2}|${number}(?:mm|cm|m)?`;
const close = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
const segmentName = (name: string) => name.split("").sort().join("");
function parseTerm(text: string): Term {
  const segment = new RegExp(`^(${number})?([A-Z]{2})$`).exec(text);
  if (segment)
    return {
      segment: segmentName(segment[2]),
      coefficient: segment[1] ? Number(segment[1].replace(",", ".")) : 1,
    };
  const value = new RegExp(`^(${number})(mm|cm|m)?$`).exec(text)!;
  return { value: Number(value[1].replace(",", ".")), unit: value[2] };
}
function reject(detail: string): never {
  throw new AppError(
    422,
    `Chưa dựng được đường hầm: ${detail} Đối chiếu và sửa phần chữ nhận diện theo ảnh gốc rồi dựng lại.`,
    "unsupported",
  );
}

/** Reviewed ACDF/BE/BG family. Equivalent notation does not bypass geometry checks. */
export function readTunnelSource(prompt: string) {
  if (tunnelSourceCorrection(prompt))
    reject(
      "đáy đang ghi ACDE nhưng các cạnh là AF/CD; có khả năng OCR nhầm ACDF thành ACDE. Chọn “Xác nhận đáy là ACDF” sau khi đối chiếu ảnh.",
    );
  const text = normalizeSource(prompt);
  const equations = [
    ...text.matchAll(
      new RegExp(
        `(?<![A-Z0-9])(?:${termPattern})(?:=(?:${termPattern}))+(?![A-Z0-9])`,
        "g",
      ),
    ),
  ].map((m) => m[0].split("=").map(parseTerm));
  if (equations.length > 64 || equations.some((chain) => chain.length > 16))
    reject(
      "có quá nhiều đẳng thức trong một bài; hãy chọn riêng câu cần dựng.",
    );
  const measurements = new Map<string, number>();
  const ratios: { a: string; b: string; ratio: number }[] = [];
  for (const chain of equations) {
    const units = chain.flatMap((t) => ("unit" in t && t.unit ? [t.unit] : []));
    const uniqueUnits = [...new Set(units)];
    for (const a of chain)
      for (const b of chain) {
        if (!("segment" in a)) continue;
        if ("segment" in b) {
          if (a.coefficient <= 0 || b.coefficient <= 0)
            reject("tỉ lệ độ dài phải dương.");
          ratios.push({
            a: a.segment,
            b: b.segment,
            ratio: b.coefficient / a.coefficient,
          });
        } else {
          const unit =
            b.unit || (uniqueUnits.length === 1 ? uniqueUnits[0] : undefined);
          if (!unit)
            reject(
              `số đo ${a.segment} chưa có đơn vị rõ ràng (m, cm hoặc mm).`,
            );
          const meters =
            (b.value * (unit === "cm" ? 0.01 : unit === "mm" ? 0.001 : 1)) /
            a.coefficient;
          const old = measurements.get(a.segment);
          if (old !== undefined && !close(old, meters))
            reject(`các số đo của ${a.segment} không khớp nhau.`);
          measurements.set(a.segment, meters);
        }
      }
  }
  const hasRatio = (a: string, b: string, expected: number) => {
    const relations = ratios.filter(
      (r) => r.a === segmentName(a) && r.b === segmentName(b),
    );
    if (relations.some((r) => !close(r.ratio, expected)))
      reject(
        `quan hệ ${a} = ${expected === 1 ? "" : expected}${b} không khớp mẫu mặt cắt này.`,
      );
    return relations.length > 0;
  };
  const required: [string, boolean][] = [
    ["đáy hình thang ACDF", /hìnhthang(?:vuông)?ACDF/iu.test(text)],
    [
      "hai góc vuông tại A và C",
      /vuông(?:góc)?tại(?:hai(?:đỉnh|góc))?(?:A(?:,|và)(?:tại)?C|C(?:,|và)(?:tại)?A)/iu.test(
        text,
      ) && !/khôngvuông/iu.test(text),
    ],
    [
      "AF song song CD",
      /(?:AF(?:\|\||\/\/|∥|songsong(?:với)?)CD|CD(?:\|\||\/\/|∥|songsong(?:với)?)AF)/iu.test(
        text,
      ),
    ],
    ["SH = 2EH", hasRatio("SH", "EH", 2)],
    ["BE = BG", hasRatio("BE", "BG", 1)],
    [
      "B thuộc đoạn AC",
      /B(?:thuộc(?:đoạn|cạnh)?|nằm(?:trên|trong)(?:đoạn|cạnh)?|∈)(?:AC|CA)/iu.test(
        text,
      ),
    ],
    ["S là đỉnh parabol", /(?:đỉnhS|Slàđỉnh)/iu.test(text)],
    [
      "H là hình chiếu của S trên mặt đáy",
      /(?:hìnhchiếu(?:vuônggóc)?(?:của)?S[^.;!?]{0,65}(?:làH|tạiH)|Hlàhìnhchiếu(?:vuônggóc)?(?:của)?S)/iu.test(
        text,
      ),
    ],
    [
      "B là hình chiếu của G trên mặt đáy",
      /(?:Blàhìnhchiếu(?:vuônggóc)?(?:của)?G(?:xuống|trên)mặt(?:phẳng)?(?:đáy|nền)|hìnhchiếu(?:vuônggóc)?(?:của)?G(?:xuống|trên)mặt(?:phẳng)?(?:đáy|nền)(?:là|tại)B)/iu.test(
        text,
      ),
    ],
    [
      "thiết diện vuông góc AC",
      /(?:thiết|mặt|tiết)diện[^.;!?]{0,100}vuônggóc(?:với)?AC/iu.test(text),
    ],
    [
      "E thuộc parabol và mặt đáy",
      /EthuộcP(?:và|,)mặt(?:phẳng)?(?:đáy|nền)/iu.test(text) ||
        /Elàchân(?:của)?parabol/iu.test(text),
    ],
    ["G thuộc parabol", /G(?:thuộc|∈)P/iu.test(text)],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([label]) => label);
  if (missing.length) reject(`chưa đọc được ${missing.join("; ")}.`);

  let wide = measurements.get("AF"),
    narrow = measurements.get("CD");
  const ratio = hasRatio("AF", "CD", 2);
  if (ratio && wide !== undefined && narrow === undefined) narrow = wide / 2;
  if (ratio && narrow !== undefined && wide === undefined) wide = narrow * 2;
  const length = measurements.get("AC");
  if (length === undefined || wide === undefined || narrow === undefined)
    reject(
      "chưa đọc đủ số đo AC, AF, CD hoặc quan hệ AF = 2CD kèm số đo một đáy.",
    );
  if (!close(wide, narrow * 2))
    reject(
      "số đo AF và CD không thỏa AF = 2CD; bộ dựng hiện hỗ trợ mặt cắt này.",
    );
  if (![length, wide, narrow].every((n) => n > 0 && n <= 1000))
    reject("kích thước phải dương và không vượt 1000 m.");
  if (
    [...measurements.keys()].some((name) => !["AC", "AF", "CD"].includes(name))
  )
    reject("có số đo bổ sung ngoài AC, AF, CD chưa được đối chiếu.");
  return { length, wide, narrow };
}
