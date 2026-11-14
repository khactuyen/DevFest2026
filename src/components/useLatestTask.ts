"use client";
import { useEffect, useRef } from "react";
import { LatestTask } from "@/lib/workspace/latest-task";
export function useLatestTask() {
  const ref = useRef<LatestTask | null>(null);
  if (!ref.current) ref.current = new LatestTask();
  const task = ref.current;
  useEffect(() => () => task.cancel(), [task]);
  return task;
}
