"use client";
import type { StrokePatch } from "@/lib/visual-edge-style";
const colors = [
  { value: "#168265", label: "Xanh lá" },
  { value: "#2563eb", label: "Xanh dương" },
  { value: "#dc2626", label: "Đỏ" },
  { value: "#d97706", label: "Cam" },
  { value: "#7c3aed", label: "Tím" },
  { value: "#1f2937", label: "Đen" },
];
export function EdgeStyleControls({
  color,
  strokeWidth,
  lineStyle = "solid",
  onChange,
}: {
  color: string;
  strokeWidth: number;
  lineStyle?: "solid" | "dashed";
  onChange: (patch: StrokePatch) => void;
}) {
  return (
    <div
      className="edge-style-controls"
      role="group"
      aria-label="Kiểu hiển thị cạnh"
    >
      <div className="edge-style-colors">
        <span>Màu cạnh</span>
        {colors.map((c) => (
          <button
            key={c.value}
            type="button"
            aria-label={`Màu cạnh ${c.label}`}
            aria-pressed={color.toLowerCase() === c.value}
            style={{ backgroundColor: c.value }}
            onClick={() => onChange({ color: c.value })}
          />
        ))}
        <label title="Chọn màu khác">
          <input
            aria-label="Màu cạnh tùy chọn"
            type="color"
            value={color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </label>
      </div>
      <div className="edge-style-widths">
        <span>Độ dày</span>
        {[
          { value: 2.25, label: "Thường" },
          { value: 4, label: "Đậm" },
          { value: 6, label: "Rất đậm" },
        ].map((s) => (
          <button
            type="button"
            key={s.value}
            aria-label={`Nét ${s.label.toLowerCase()}`}
            aria-pressed={strokeWidth === s.value}
            onClick={() => onChange({ strokeWidth: s.value })}
          >
            <i style={{ height: s.value }} />
            {s.label}
          </button>
        ))}
      </div>
      <div className="edge-style-widths"><span>Kiểu nét</span>{(["solid", "dashed"] as const).map(value => <button key={value} type="button" aria-label={value === "solid" ? "Cạnh nét liền" : "Cạnh nét đứt"} aria-pressed={lineStyle === value} onClick={() => onChange({ lineStyle: value })}>{value === "solid" ? "Liền" : "Đứt"}</button>)}</div>
      <small>Chỉ đổi cạnh đang chọn · Không thay mặc định hình mới.</small>
    </div>
  );
}
