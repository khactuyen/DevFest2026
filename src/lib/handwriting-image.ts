const MAX_ENCODED_IMAGE_LENGTH = 4_500_000;
const MAX_IMAGE_BYTES = 3_300_000;

export function hasHandwritingInk(pixels: Uint8ClampedArray): boolean {
  let inkPixels = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 16) continue;
    if (pixels[index] < 235 || pixels[index + 1] < 235 || pixels[index + 2] < 235) {
      inkPixels += 1;
      if (inkPixels >= 8) return true;
    }
  }
  return false;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Không đọc được ảnh nét viết trong trình duyệt."));
    reader.onabort = () => reject(new Error("Đã hủy xử lý ảnh nét viết."));
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Không chuyển được nét viết thành ảnh."));
    };
    reader.readAsDataURL(blob);
  });
}

/** Flatten the transparent drawing canvas onto white before JPEG encoding. */
export async function createHandwritingImageDataUrl(source: HTMLCanvasElement): Promise<string> {
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) throw new Error("Không đọc được bảng viết trong trình duyệt.");
  if (!hasHandwritingInk(sourceContext.getImageData(0, 0, source.width, source.height).data)) {
    throw new Error("Bảng viết đang trống. Hãy viết đề hoặc công thức trước khi nhận dạng.");
  }

  const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
  const flattened = document.createElement("canvas");
  flattened.width = Math.max(1, Math.round(source.width * scale));
  flattened.height = Math.max(1, Math.round(source.height * scale));
  const context = flattened.getContext("2d");
  if (!context) throw new Error("Không chuẩn bị được ảnh để nhận dạng.");

  context.fillStyle = "#fff";
  context.fillRect(0, 0, flattened.width, flattened.height);
  context.drawImage(source, 0, 0, flattened.width, flattened.height);

  const blob = await new Promise<Blob | null>((resolve) => flattened.toBlob(resolve, "image/jpeg", 0.84));
  if (!blob) throw new Error("Không xuất được nét viết thành ảnh.");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("Ảnh nét viết quá lớn. Hãy xóa bớt nét rồi thử lại.");

  const imageDataUrl = await readAsDataUrl(blob);
  if (imageDataUrl.length > MAX_ENCODED_IMAGE_LENGTH) {
    throw new Error("Ảnh nét viết sau khi tối ưu vẫn quá lớn.");
  }
  return imageDataUrl;
}
