import type { LibraryEntry } from "@/lib/workspace/library";
import Link from "next/link";
export function LibraryEntryCard({
  entry,
  favorite,
  onFavorite,
}: {
  entry: LibraryEntry;
  favorite: boolean;
  onFavorite(): void;
}) {
  const dimension = entry.dimension.toUpperCase();
  return (
    <article
      className="math-card bg-surface-container-lowest rounded-DEFAULT overflow-hidden shadow-sm hover:shadow-md transition-all flex flex-col group"
      data-entry-id={entry.id}
    >
      <div className="relative w-full h-48 bg-surface-container overflow-hidden flex flex-col items-center justify-center gap-2">
        <span className="material-symbols-outlined text-[54px] text-primary">
          {entry.dimension === "3d" ? "view_in_ar" : "functions"}
        </span>
        <span className="font-code-badge text-code-badge text-on-surface-variant">
          {dimension} · {entry.engine}
        </span>
        <div className="absolute top-3 left-3 flex items-center gap-1.5">
          <span className="font-code-badge text-code-badge px-2 py-0.5 rounded-full bg-primary-container text-on-primary font-bold">
            {entry.topic}
          </span>
          <span className="font-code-badge text-code-badge px-2 py-0.5 rounded-full bg-surface-container-lowest/90 text-primary font-bold">
            {entry.grade}
          </span>
        </div>
        <button
          className={`library-favorite absolute top-3 right-3 w-8 h-8 rounded-full bg-surface-container-lowest/90 flex items-center justify-center hover:scale-110 transition-all ${favorite ? "text-error" : "text-outline"}`}
          type="button"
          aria-pressed={favorite}
          aria-label={`${favorite ? "Bỏ lưu" : "Lưu"} ${entry.title}`}
          onClick={onFavorite}
        >
          <span
            className="material-symbols-outlined text-[18px]"
            style={favorite ? { fontVariationSettings: "'FILL' 1" } : undefined}
          >
            favorite
          </span>
        </button>
      </div>
      <div className="p-space-md flex flex-col flex-1 justify-between gap-space-sm">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-on-surface-variant font-code-badge text-code-badge">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">
                {entry.kind === "material" ? "description" : "widgets"}
              </span>
              {entry.sourceLabel}
            </span>
            <span>{entry.statusLabel}</span>
          </div>
          <h2 className="font-headline-sm text-headline-sm text-primary">
            {entry.title}
          </h2>
          <p className="font-body-sm text-body-sm text-on-surface-variant line-clamp-2">
            {entry.description || "Chưa có mô tả."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {entry.tags.length ? (
            entry.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="font-code-badge text-code-badge px-2 py-0.5 rounded bg-surface-container text-on-surface-variant"
              >
                {tag}
              </span>
            ))
          ) : (
            <span className="font-code-badge text-code-badge px-2 py-0.5 rounded bg-surface-container text-on-surface-variant">
              {dimension} tương tác
            </span>
          )}
        </div>
        <div className="flex justify-end pt-space-xs">
          <Link
            className="library-open px-space-md py-1.5 rounded-full bg-primary-container text-on-primary hover:bg-primary transition-colors font-label-sm text-label-sm font-bold flex items-center gap-1 shadow-sm"
            href={entry.url}
          >
            <span>
              {entry.kind === "material" ? "Mở học liệu" : "Mở mô hình"}
            </span>
            <span className="material-symbols-outlined text-[16px]">
              arrow_forward
            </span>
          </Link>
        </div>
      </div>
    </article>
  );
}
