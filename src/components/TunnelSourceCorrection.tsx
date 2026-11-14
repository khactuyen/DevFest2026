"use client";

import { tunnelSourceCorrection } from "@/lib/tunnel-source";

export function TunnelSourceCorrection({
  source,
  disabled,
  onConfirm,
}: {
  source: string;
  disabled?: boolean;
  onConfirm: (corrected: string) => void;
}) {
  const correction = tunnelSourceCorrection(source);
  if (!correction) return null;
  return (
    <div className="tunnel-source-correction" role="status">
      <span>{correction.explanation}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onConfirm(correction.corrected)}
      >
        Xác nhận đáy là ACDF
      </button>
    </div>
  );
}
