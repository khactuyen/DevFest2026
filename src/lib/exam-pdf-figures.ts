export type FigureBox = [left: number, top: number, right: number, bottom: number];

export function pdfImageBoxes(coordinates: ArrayLike<number> | null, width: number, height: number): FigureBox[] {
  const boxes: FigureBox[] = [];
  if (!coordinates) return boxes;
  for (let index = 0; index + 5 < coordinates.length; index += 6) {
    const x = [coordinates[index], coordinates[index + 2], coordinates[index + 4]];
    const y = [coordinates[index + 1], coordinates[index + 3], coordinates[index + 5]];
    // The renderer records three corners of each image's parallelogram.
    x.push(x[1] + x[2] - x[0]);
    y.push(y[1] + y[2] - y[0]);
    const box: FigureBox = [Math.floor(Math.min(...x) * width), Math.floor(Math.min(...y) * height),
      Math.ceil(Math.max(...x) * width), Math.ceil(Math.max(...y) * height)];
    const imageWidth = box[2] - box[0], imageHeight = box[3] - box[1];
    if (imageWidth >= width * .035 && imageHeight >= width * .03
      && imageWidth * imageHeight < width * height * .85) boxes.push(box);
  }
  return boxes;
}

const area = ([left, top, right, bottom]: FigureBox) => (right - left) * (bottom - top);

function overlap(a: FigureBox, b: FigureBox) {
  return Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]))
    * Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
}

// Short white gaps can occur between labels and the rest of a drawing.
function inkBands(ink: Uint8Array, gap: number): Array<[number, number]> {
  const bands: Array<[number, number]> = [];
  for (let index = 0; index < ink.length; index++) {
    if (!ink[index]) continue;
    const last = bands.at(-1);
    if (last && index - last[1] <= gap) last[1] = index + 1;
    else bands.push([index, index + 1]);
  }
  return bands;
}

export function resolvePdfFigureBoxes({ width, height, data }: Pick<ImageData, "width" | "height" | "data">,
  hints: FigureBox[], embedded: FigureBox[] = []) {
  const figures: FigureBox[] = [];
  let unresolved = false;
  const gap = Math.max(2, Math.round(width * .005));
  const isInk = (index: number) => data[index + 3] > 0 && Math.min(data[index], data[index + 1], data[index + 2]) < 224;
  const rows = new Uint8Array(height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isInk((y * width + x) * 4)) { rows[y] = 1; break; }
    }
  }
  const bands = inkBands(rows, gap);
  function add(box: FigureBox) {
    if (figures.some((other) => overlap(other, box) > Math.min(area(other), area(box)) * .7)) return;
    figures.push(box);
  }
  for (const box of embedded) add(box);
  for (const hint of hints) {
    const pixels = hint.map((coord, index) => Math.round(coord * (index % 2 ? height : width) / 1000)) as FigureBox;
    if (embedded.some((box) => overlap(box, pixels) >= Math.min(area(box), area(pixels)) * .45)) continue;
    const candidates: FigureBox[] = [];
    for (const [top, bottom] of bands) {
      if (bottom <= pixels[1] || top >= pixels[3] || top === 0 || bottom === height
        || bottom - top < Math.max(12, width * .028)) continue;
      const columns = new Uint8Array(width);
      for (let y = top; y < bottom; y++) {
        for (let x = 0; x < width; x++) {
          if (isInk((y * width + x) * 4)) columns[x] = 1;
        }
      }
      const horizontalGap = Math.max(gap, Math.round(width * .014));
      for (const [left, right] of inkBands(columns, horizontalGap)) {
        if (left === 0 || right === width || right - left < width * .035) continue;
        const candidate: FigureBox = [left, top, right, bottom];
        if (overlap(candidate, pixels) >= Math.min(area(candidate), area(pixels)) * .14
          && area(candidate) < width * height * .85) candidates.push(candidate);
      }
    }
    candidates.sort((a, b) => overlap(b, pixels) - overlap(a, pixels));
    if (candidates.length) add(candidates[0]);
    else unresolved = true;
  }
  return { figures: figures.sort((a, b) => a[1] - b[1] || a[0] - b[0]).slice(0, 4), unresolved };
}
