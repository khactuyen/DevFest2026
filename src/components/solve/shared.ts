export const phases = [
  "Nhập đề",
  "Kiểm tra & chọn cách giải",
  "Theo dõi lời giải",
  "Lưu & sử dụng",
];

export const examples = [
  "x² - 5x + 6 = 0",
  "2x² + x = 0",
  "x² - 2 = 0",
  "-x² + 4 ≥ 0",
  "2x + 3 = 7",
];

export const message = (e: unknown) =>
  e && typeof e === "object" && "code" in e && e.code === "ai_timeout"
    ? "AI phản hồi quá thời gian chờ. Đề và bản nháp vẫn được giữ; hãy thử lại thao tác vừa thực hiện."
    : e instanceof Error
      ? e.message
      : "Không thực hiện được yêu cầu.";

export function tabDestination(key: string, ids: string[], current: string) {
  const i = ids.indexOf(current);
  return key === "ArrowRight"
    ? ids[(i + 1) % ids.length]
    : key === "ArrowLeft"
      ? ids[(i + ids.length - 1) % ids.length]
      : key === "Home"
        ? ids[0]
        : key === "End"
          ? ids.at(-1)
          : null;
}

export async function prepareImage(file: File) {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type) || file.size > 12_000_000)
    throw Error("Chọn ảnh PNG, JPEG hoặc WebP, tối đa 12 MB.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw Error(
      "Ảnh không đọc được hoặc bị hỏng. Hãy chọn ảnh PNG, JPEG hoặc WebP khác.",
    );
  }
  try {
    const scale = Math.min(1, 1800 / Math.max(bitmap.width, bitmap.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw Error("Không xử lý được ảnh.");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/jpeg", 0.84);
    if (image.length > 4_500_000)
      throw Error("Ảnh vẫn quá lớn, hãy cắt riêng câu cần giải.");
    return image;
  } finally {
    bitmap.close();
  }
}
