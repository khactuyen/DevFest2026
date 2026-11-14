"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Clock3, Route, Search, Calculator } from "lucide-react";
import type { Material } from "@/lib/contracts";
import type { Curriculum } from "@/lib/curriculum-contracts";
import { request } from "@/lib/client";
import { learnerSessionId } from "@/lib/learner";
import type { SolveSession } from "@/lib/solve-contracts";
import { solveMethodLabel } from "@/lib/solve-label";
import { solveModeLabel } from "@/lib/solve-mode";

type Activity = {
  id: string;
  title: string;
  description: string;
  type: "material" | "curriculum" | "solve";
  updatedAt: string;
  href: string;
};

export function ActivityHistory() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [curricula, setCurricula] = useState<Curriculum[]>([]);
  const [solves, setSolves] = useState<SolveSession[]>([]);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | Activity["type"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.allSettled([
      request<Material[]>("/api/materials"),
      request<Curriculum[]>("/api/curricula"),
      request<SolveSession[]>(
        `/api/solve-sessions?ownerKey=${learnerSessionId()}`,
      ),
    ])
      .then(([materialItems, curriculumItems, solveItems]) => {
        if (materialItems.status === "fulfilled")
          setMaterials(materialItems.value);
        if (curriculumItems.status === "fulfilled")
          setCurricula(curriculumItems.value);
        if (solveItems.status === "fulfilled") setSolves(solveItems.value);
        const failures = [materialItems, curriculumItems, solveItems].filter(
          (item) => item.status === "rejected",
        );
        if (failures.length)
          setError(
            `Không tải được ${failures.length} nguồn lịch sử. Các nguồn còn lại vẫn hiển thị.`,
          );
      })
      .finally(() => setLoading(false));
  }, []);

  const activities = useMemo<Activity[]>(
    () =>
      [
        ...materials.map((material) => ({
          id: `material-${material.id}`,
          title: material.title,
          description:
            material.status === "published"
              ? "Học liệu đã xuất bản"
              : "Học liệu đang ở bản nháp",
          type: "material" as const,
          updatedAt: material.updatedAt,
          href:
            material.status === "published"
              ? `/material/${material.slug}`
              : `/studio?material=${material.id}`,
        })),
        ...curricula.map((curriculum) => ({
          id: `curriculum-${curriculum.id}`,
          title: curriculum.title,
          description:
            curriculum.status === "published"
              ? "Lộ trình đã xuất bản"
              : "Lộ trình đang biên soạn",
          type: "curriculum" as const,
          updatedAt: curriculum.updatedAt,
          href: `/curricula/${curriculum.id}`,
        })),
        ...solves.map((s) => ({
          id: `solve-${s.id}`,
          title: s.title,
          description:
            s.phase === "solution"
              ? `${solveModeLabel(s.solveMode || "standard")} · bước ${s.activeStep + 1} · ${solveMethodLabel(s)}`
              : "Đề bài đã lưu",
          type: "solve" as const,
          updatedAt: s.updatedAt,
          href: `/space?session=${s.id}`,
        })),
      ]
        .filter(
          (activity) =>
            (kind === "all" || activity.type === kind) &&
            (!query ||
              `${activity.title} ${activity.description}`
                .toLocaleLowerCase("vi")
                .includes(query.toLocaleLowerCase("vi"))),
        )
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [materials, curricula, solves, query, kind],
  );

  return (
    <main className="real-history-page">
      <header>
        <span className="eyebrow">LỊCH SỬ THỰC</span>
        <h1>Lịch sử học liệu, lộ trình và bài giải</h1>
        <p>Trang này chỉ hiển thị dữ liệu đang tồn tại trong hệ thống.</p>
      </header>
      <section className="real-history-filters">
        <label>
          <Search size={17} />
          <input
            aria-label="Tìm trong lịch sử"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm theo tên…"
          />
        </label>
        <select
          aria-label="Loại hoạt động"
          value={kind}
          onChange={(event) => setKind(event.target.value as typeof kind)}
        >
          <option value="all">Tất cả</option>
          <option value="material">Học liệu</option>
          <option value="curriculum">Lộ trình</option>
          <option value="solve">Bài giải</option>
        </select>
      </section>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="empty">Đang tải lịch sử…</p>
      ) : activities.length ? (
        <section className="real-history-list">
          {activities.map((activity) => (
            <Link href={activity.href} key={activity.id}>
              <span className="real-history-icon">
                {activity.type === "material" ? (
                  <BookOpen size={18} />
                ) : activity.type === "solve" ? (
                  <Calculator size={18} />
                ) : (
                  <Route size={18} />
                )}
              </span>
              <span>
                <strong>{activity.title}</strong>
                <small>{activity.description}</small>
              </span>
              <time dateTime={activity.updatedAt}>
                <Clock3 size={14} />{" "}
                {new Date(activity.updatedAt).toLocaleString("vi-VN")}
              </time>
            </Link>
          ))}
        </section>
      ) : (
        <div className="curriculum-empty">
          <Clock3 size={30} />
          <h3>Chưa có lịch sử</h3>
          <p>
            Khi bạn tạo hoặc chỉnh sửa dữ liệu thật, hoạt động sẽ xuất hiện ở
            đây.
          </p>
        </div>
      )}
    </main>
  );
}
