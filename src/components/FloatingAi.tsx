import { Bot, Sparkles, X } from "lucide-react";
import type { Ref } from "react";

export function FloatingAiTrigger({ onOpen, className = "", buttonRef, controls, label }: {
  onOpen: () => void; className?: string; buttonRef?: Ref<HTMLButtonElement>; controls?: string; label?: string;
}) {
  return <button type="button" ref={buttonRef} className={`floating-ai-trigger ${className}`} onClick={onOpen}
    aria-haspopup="dialog" aria-controls={controls} aria-label={label}>
    <Bot size={17} /> Hỏi đáp &amp; Phân tích AI <Sparkles size={13} />
  </button>;
}

export function FloatingAiHeader({ title, onClose, closeLabel = "Đóng trợ giảng AI" }: {
  title: string; onClose: () => void; closeLabel?: string;
}) {
  return <header className="floating-ai-header">
    <span><Bot size={18} /> {title}</span>
    <button type="button" aria-label={closeLabel} onClick={onClose}><X size={15} /></button>
  </header>;
}
