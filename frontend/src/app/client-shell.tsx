"use client";

import dynamic from "next/dynamic";

const WorkflowStudio = dynamic(
  () => import("@/components/workflow-studio").then((m) => ({ default: m.WorkflowStudio })),
  { ssr: false }
);

export function ClientShell() {
  return <WorkflowStudio />;
}
