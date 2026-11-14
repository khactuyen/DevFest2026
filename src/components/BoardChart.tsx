"use client";
import { useId, useState } from "react";
import {
  descriptiveStatistics,
  histogramBins,
  type BoardItem,
} from "@/lib/board-content";
const colors = [
  "#2d8065",
  "#e8ac56",
  "#6196b4",
  "#b37d94",
  "#7da563",
  "#857eb4",
];
export function BoardChart({
  item,
  onRegions,
  onEdges,
}: {
  item: BoardItem;
  onRegions?: (r: number[]) => void;
  onEdges?: (edges: [number, number][]) => void;
}) {
  const [first, setFirst] = useState<number | null>(null);
  const raw = item.data || [3, 5, 2],
    bins = item.kind === "histogram" ? histogramBins(raw) : null;
  const clip = useId().replaceAll(":", ""),
    data = bins ? bins.map((b) => b.count) : raw,
    labels = bins
      ? bins.map((b) => `${+b.from.toFixed(2)}–${+b.to.toFixed(2)}`)
      : item.labels || data.map((_, i) => String(i + 1)),
    max = Math.max(1, ...data.map(Math.abs));
  const x = (i: number) => 40 + (i * 330) / Math.max(1, data.length - 1),
    y = (v: number) => 210 - (v / max) * 150;
  let chart: React.ReactNode;
  if (item.kind === "pie") {
    const total = data.reduce((a, b) => a + b, 0);
    if (total <= 0 || data.some((v) => v < 0))
      return (
        <p role="alert">
          Biểu đồ quạt cần các giá trị không âm, tổng lớn hơn 0.
        </p>
      );
    let angle = -Math.PI / 2;
    chart = data.map((v, i) => {
      const start = angle;
      angle += (v / total) * Math.PI * 2;
      const end = angle;
      if (v === total)
        return <circle key={i} cx="160" cy="130" r="85" fill={colors[i % 6]} />;
      return (
        <path
          key={i}
          d={`M160,130 L${160 + 85 * Math.cos(start)},${130 + 85 * Math.sin(start)} A85,85 0 ${end - start > Math.PI ? 1 : 0} 1 ${160 + 85 * Math.cos(end)},${130 + 85 * Math.sin(end)} Z`}
          fill={colors[i % 6]}
          stroke="white"
        />
      );
    });
  } else if (item.kind === "boxplot") {
    const s = descriptiveStatistics(data),
      px = (v: number) => 40 + (320 * (v - s.min)) / (s.max - s.min || 1);
    chart = (
      <>
        <line x1="40" y1="120" x2="360" y2="120" stroke="#245541" />
        <rect
          x={px(s.q1)}
          y="85"
          width={Math.max(1, px(s.q3) - px(s.q1))}
          height="70"
          fill="#cde9dc"
          stroke="#245541"
        />
        {[s.min, s.median, s.max].map((v, i) => (
          <g key={i}>
            <line x1={px(v)} x2={px(v)} y1="85" y2="155" stroke="#245541" />
            <text x={px(v)} y="178" textAnchor="middle">
              {+v.toFixed(3)}
            </text>
          </g>
        ))}
      </>
    );
  } else if (item.kind === "venn") {
    const circles = [
        [155, 110],
        [245, 110],
        [200, 170],
      ].slice(0, item.setCount || 3),
      regions = item.regions || [3];
    chart = (
      <>
        <defs>
          {circles.map(([cx, cy], i) => (
            <clipPath key={i} id={`${clip}-${i}`}>
              <circle cx={cx} cy={cy} r="67" />
            </clipPath>
          ))}
        </defs>
        <defs>
          {Array.from({ length: 1 << circles.length }, (_, mask) => (
            <mask
              key={mask}
              id={`${clip}-outside-${mask}`}
              maskUnits="userSpaceOnUse"
              x="65"
              y="20"
              width="280"
              height="225"
            >
              <rect x="65" y="20" width="280" height="225" fill="white" />
              {circles
                .filter((_, i) => !(mask & (1 << i)))
                .map(([cx, cy], i) => (
                  <circle key={i} cx={cx} cy={cy} r="67" fill="black" />
                ))}
            </mask>
          ))}
        </defs>
        <rect
          x="65"
          y="20"
          width="280"
          height="225"
          fill="white"
          stroke="#afc7ba"
        />
        {regions
          .filter((mask) => mask < 1 << circles.length)
          .map((mask) => {
            let region: React.ReactNode = (
              <rect x="65" y="20" width="280" height="225" fill="#94ccb5" />
            );
            circles.forEach((_, i) => {
              if (mask & (1 << i))
                region = <g clipPath={`url(#${clip}-${i})`}>{region}</g>;
            });
            return (
              <g
                key={mask}
                mask={`url(#${clip}-outside-${mask})`}
                style={{ pointerEvents: "none" }}
              >
                {region}
              </g>
            );
          })}
        {circles.map(([cx, cy], i) => (
          <g key={i}>
            <circle
              cx={cx}
              cy={cy}
              r="67"
              fill="none"
              stroke={colors[i]}
              strokeWidth="2"
            />
            <text x={cx + (i === 0 ? -40 : 40)} y={cy - 45}>
              {["A", "B", "C"][i]}
            </text>
          </g>
        ))}
        {Array.from({ length: (1 << circles.length) - 1 }, (_, i) => i + 1).map(
          (mask) => {
            const inside = circles.map((_, i) => Boolean(mask & (1 << i))),
              coords: Record<number, [number, number]> = {
                1: [110, 95],
                2: [290, 95],
                3: [200, 65],
                4: [200, 215],
                5: [150, 155],
                6: [250, 155],
                7: [200, 135],
              };
            const [cx, cy] = coords[mask];
            return (
              <g
                key={mask}
                role="button"
                tabIndex={0}
                aria-label={`Miền ${mask}`}
                onClick={() =>
                  onRegions?.(
                    regions.includes(mask)
                      ? regions.filter((r) => r !== mask)
                      : [...regions, mask],
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter")
                    onRegions?.(
                      regions.includes(mask)
                        ? regions.filter((r) => r !== mask)
                        : [...regions, mask],
                    );
                }}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={cx}
                  cy={cy}
                  r="15"
                  fill={regions.includes(mask) ? "#2d8065" : "#edf5f0"}
                />
                <text
                  x={cx}
                  y={cy + 4}
                  textAnchor="middle"
                  fill={regions.includes(mask) ? "white" : "#244e3b"}
                >
                  {inside
                    .map((v, i) => (v ? ["A", "B", "C"][i] : ""))
                    .join("∩")}
                </text>
              </g>
            );
          },
        )}
      </>
    );
  } else if (item.kind === "tree") {
    const prior = data[0] ?? 0.5,
      a = data[1] ?? 0.8,
      b = data[2] ?? 0.1;
    if ([prior, a, b].some((v) => v < 0 || v > 1))
      return <p>Xác suất nhánh phải thuộc [0,1].</p>;
    chart = (
      <>
        {[
          [40, 130, 180, 65],
          [40, 130, 180, 195],
          [180, 65, 330, 35],
          [180, 65, 330, 95],
          [180, 195, 330, 165],
          [180, 195, 330, 225],
        ].map(([a, b, c, d], i) => (
          <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="#2d8065" />
        ))}
        {[
          [90, 65, `A: ${prior}`],
          [90, 205, `¬A: ${1 - prior}`],
          [260, 24, `B: ${a}`],
          [260, 115, `¬B: ${+(1 - a).toFixed(3)}`],
          [260, 150, `B: ${b}`],
          [260, 247, `¬B: ${+(1 - b).toFixed(3)}`],
        ].map(([x, y, t], i) => (
          <text key={i} x={x} y={y}>
            {t}
          </text>
        ))}
      </>
    );
  } else if (item.kind === "intervals") {
    const [a, b] = [data[0] ?? -2, data[1] ?? 3].sort((a, b) => a - b),
      px = (v: number) => 200 + v * 22;
    chart = (
      <>
        <line x1="20" x2="380" y1="130" y2="130" stroke="#294d3e" />
        <line
          x1={px(a)}
          x2={px(b)}
          y1="130"
          y2="130"
          stroke="#2d8065"
          strokeWidth="6"
        />
        {[a, b].map((v, i) => (
          <g key={i}>
            <circle cx={px(v)} cy="130" r="6" fill="white" stroke="#2d8065" />
            <text x={px(v)} y="155">
              {v}
            </text>
          </g>
        ))}
      </>
    );
  } else if (item.kind === "network") {
    const count = Math.max(3, Math.min(12, data.length)),
      points = Array.from({ length: count }, (_, i) => [
        200 + 90 * Math.cos((i * 2 * Math.PI) / count),
        130 + 90 * Math.sin((i * 2 * Math.PI) / count),
      ]);
    const edges =
      item.graphEdges ||
      points.map((_, i) => [i, (i + 1) % count] as [number, number]);
    const connect = (i: number) => {
      if (first === null) {
        setFirst(i);
        return;
      }
      if (first !== i) {
        const exists = edges.some(
          ([a, b]) => (a === first && b === i) || (b === first && a === i),
        );
        onEdges?.(
          exists
            ? edges.filter(
                ([a, b]) =>
                  !((a === first && b === i) || (b === first && a === i)),
              )
            : [...edges, [first, i]],
        );
      }
      setFirst(null);
    };
    chart = (
      <>
        {edges
          .filter(([a, b]) => a < count && b < count)
          .map(([a, b], i) => (
            <line
              key={i}
              x1={points[a][0]}
              y1={points[a][1]}
              x2={points[b][0]}
              y2={points[b][1]}
              stroke="#2d8065"
            />
          ))}
        {points.map(([a, b], i) => (
          <g
            key={i}
            role="button"
            tabIndex={0}
            aria-label={`Đỉnh ${labels[i] || String.fromCharCode(65 + i)}`}
            onClick={() => connect(i)}
            onKeyDown={(e) => {
              if (e.key === "Enter") connect(i);
            }}
            style={{ cursor: "pointer" }}
          >
            <circle
              cx={a}
              cy={b}
              r="10"
              fill={first === i ? "#d98d2f" : "#2d8065"}
            />
            <text x={a + 15} y={b + 4}>
              {labels[i] || String.fromCharCode(65 + i)}
            </text>
          </g>
        ))}
        <text x="20" y="260">
          {first === null
            ? "Chọn hai đỉnh để thêm / bỏ cạnh"
            : "Chọn đỉnh tiếp theo"}
        </text>
      </>
    );
  } else if (item.kind === "line")
    chart = (
      <>
        <polyline
          points={data.map((v, i) => `${x(i)},${y(v)}`).join(" ")}
          fill="none"
          stroke="#2d8065"
          strokeWidth="3"
        />
        {data.map((v, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(v)} r="4" fill="#2d8065" />
            <text x={x(i)} y="235" textAnchor="middle">
              {labels[i]}
            </text>
          </g>
        ))}
      </>
    );
  else {
    const min = Math.min(0, ...data),
      range = max - min,
      baseline = 210 + (min / range) * 150;
    chart = data.map((v, i) => {
      const top = 210 - ((v - min) / range) * 150,
        zero = 210 - ((0 - min) / range) * 150;
      return (
        <g key={i}>
          <rect
            x={35 + (i * 340) / data.length}
            y={Math.min(top, zero)}
            width={Math.max(2, 300 / data.length)}
            height={Math.max(1, Math.abs(zero - top))}
            fill={colors[i % 6]}
          />
          <text x={45 + (i * 340) / data.length} y="235">
            {labels[i]}
          </text>
          <text
            x={45 + (i * 340) / data.length}
            y={Math.min(top, baseline) - 5}
          >
            {v}
          </text>
        </g>
      );
    });
  }
  return (
    <svg
      viewBox="0 0 400 270"
      width="100%"
      height="100%"
      role="img"
      aria-label={item.text || item.kind}
      style={{ fontFamily: "Arial, sans-serif", fontSize: 11 }}
    >
      {chart}
    </svg>
  );
}
