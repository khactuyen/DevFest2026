/** Remove a uniform border-connected background while retaining enclosed regions. */
export async function removeFlatImageBackground(url: string): Promise<Blob | null> {
  const image = new Image();
  image.src = url;
  await image.decode();
  const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  const width = canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  if (width < 3 || height < 3) return null;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const color = pixels.data.slice(0, 3);
  const tolerance = 18;
  function matches(pixel: number) {
    const offset = pixel * 4;
    return pixels.data[offset + 3] >= 250 && color.every((channel, index) => Math.abs(pixels.data[offset + index] - channel) <= tolerance);
  }
  const total = width * height;
  if (![0, width - 1, total - width, total - 1].every(matches)) return null;
  const queue = new Int32Array(total);
  let read = 0;
  let write = 0;
  function visit(pixel: number) {
    if (!matches(pixel)) return;
    pixels.data[pixel * 4 + 3] = 0;
    queue[write++] = pixel;
  }
  for (let x = 0; x < width; x++) {
    visit(x);
    visit(total - width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    visit(y * width);
    visit(y * width + width - 1);
  }
  while (read < write) {
    const pixel = queue[read++];
    const x = pixel % width;
    if (x > 0) visit(pixel - 1);
    if (x < width - 1) visit(pixel + 1);
    if (pixel >= width) visit(pixel - width);
    if (pixel < total - width) visit(pixel + width);
  }
  if (write === total) return null;
  context.putImageData(pixels, 0, 0);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
