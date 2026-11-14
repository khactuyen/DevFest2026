"use client";

import dynamic from "next/dynamic";
import { Box } from "lucide-react";
import { useState } from "react";
import type { SpatialControlProps } from "./ExploreSpatialTools";

const SpatialPanel = dynamic(
  () => import("./ExploreSpatialTools").then((module) => module.ExploreSpatialTools),
  { loading: () => <span role="status">Đang mở công cụ không gian…</span> },
);

export function ExploreSpatialControls(props: SpatialControlProps) {
  const [open, setOpen] = useState(false);
  const [requested, setRequested] = useState(false);
  return (
    <div className="explore-spatial-tools">
      <button type="button" aria-expanded={open} onClick={() => {
        setRequested(true);
        setOpen((current) => !current);
      }}>
        <Box size={15} />
        Không gian
      </button>
      {(requested || props.visual?.dimension === "3d") && (
        <SpatialPanel {...props} open={open} setOpen={setOpen} />
      )}
    </div>
  );
}
