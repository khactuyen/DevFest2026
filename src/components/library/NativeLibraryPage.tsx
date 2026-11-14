"use client";
import { request } from "@/lib/client";
import type { Material } from "@/lib/contracts";
import { loadVisualPatternCatalog } from "@/lib/visual-pattern-catalog";
import {
  filterLibrary,
  initialLibraryFilters,
  libraryEntries,
  type LibraryEntry,
} from "@/lib/workspace/library";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../AuthProvider";
import { useLatestTask } from "../useLatestTask";
import "./library.css";
import { LibraryEntryCard } from "./LibraryEntryCard";
import { LibraryLayout } from "./LibraryLayout";
import type { LibraryLayoutModel } from "./view-contracts";
const favoritesKey = "mathstudio-library-favorites";
export function NativeLibraryPage() {
  const catalogTask = useLatestTask();
  const user = useAuth(),
    router = useRouter();
  const [entries, setEntries] = useState<LibraryEntry[]>([]),
    [filters, setFilters] = useState(initialLibraryFilters);
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(new Set()),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    try {
      const raw: unknown = JSON.parse(
        localStorage.getItem(favoritesKey) || "[]",
      );
      if (Array.isArray(raw))
        setFavorites(
          new Set(raw.filter((v): v is string => typeof v === "string")),
        );
    } catch {}
  }, []);
  useEffect(() => {
    const load = () => {
      const ticket = catalogTask.begin();
      setLoading(true);
      setError("");
      Promise.all([
        request<Material[]>("/api/materials", { signal: ticket.signal }),
        loadVisualPatternCatalog(),
      ])
        .then(([materials, patterns]) => {
          if (ticket.isCurrent())
            setEntries(libraryEntries(materials, patterns));
        })
        .catch((reason) => {
          if (ticket.isCurrent()) {
            setEntries([]);
            setError(
              reason instanceof Error
                ? reason.message
                : "Không thể tải dữ liệu thư viện.",
            );
          }
        })
        .finally(() => {
          if (ticket.isCurrent()) setLoading(false);
        });
    };
    load();
    window.addEventListener("auth-change", load);
    return () => {
      catalogTask.cancel();
      window.removeEventListener("auth-change", load);
    };
  }, [user?.id]);
  const visible = useMemo(
    () => filterLibrary(entries, filters, favorites),
    [entries, filters, favorites],
  );
  const materials = entries.filter((e) => e.kind === "material"),
    patterns = entries.filter((e) => e.kind === "pattern");
  const resume =
    materials.find((e) => e.statusLabel === "Bản nháp") || materials[0];
  function favorite(id: string) {
    setFavorites((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(favoritesKey, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  }
  const model: LibraryLayoutModel = {
    ...filters,
    loading,
    empty: !loading && !error && !visible.length,
    hasMaterials: materials.length > 0,
    resumeTitle: resume?.title || "",
    entries: error ? (
      <div
        role="alert"
        className="md:col-span-2 xl:col-span-3 py-16 text-center"
      >
        <strong>Không thể tải dữ liệu thật của thư viện.</strong>
        <p>{error}</p>
      </div>
    ) : loading ? (
      <p role="status">Đang tải thư viện…</p>
    ) : (
      visible.map((entry) => (
        <LibraryEntryCard
          key={entry.id}
          entry={entry}
          favorite={favorites.has(entry.id)}
          onFavorite={() => favorite(entry.id)}
        />
      ))
    ),
    resultLabel: `${visible.length} mục phù hợp`,
    draftLabel: `${materials.filter((e) => e.statusLabel === "Bản nháp").length} học liệu`,
    patternLabel: `${patterns.length} mô hình`,
    catalogLabel: `${materials.length} học liệu cá nhân · ${patterns.length} mô hình tương tác`,
    onQuery: (query) => setFilters((f) => ({ ...f, query })),
    onType: (type) => setFilters((f) => ({ ...f, type })),
    onSort: (sort) => setFilters((f) => ({ ...f, sort })),
    onSubject: (subject) => setFilters((f) => ({ ...f, subject })),
    onLevel: (level) => setFilters((f) => ({ ...f, level })),
    onToggleFavorites: () =>
      setFilters((f) => ({ ...f, favoritesOnly: !f.favoritesOnly })),
    onReset: () => setFilters(initialLibraryFilters),
    onResume: () => {
      if (resume) router.push(resume.url);
    },
    subjectClass: (subject) =>
      `filter-subject-btn px-space-md py-1 rounded-full font-label-sm text-label-sm transition-all ${filters.subject === subject ? "bg-primary-container text-on-primary font-bold shadow-xs" : "bg-surface-container-low text-on-surface-variant hover:text-on-surface hover:bg-surface-container font-semibold"}`,
    levelClass: (level) =>
      `filter-level-btn px-space-sm py-0.5 rounded-full font-code-badge text-code-badge ${filters.level === level ? "bg-primary-fixed text-primary font-bold" : "bg-surface-container-low text-on-surface-variant hover:bg-surface-container font-medium"}`,
  };
  return <LibraryLayout model={model} />;
}
