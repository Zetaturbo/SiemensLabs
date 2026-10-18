import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { MODEL } from "@/components/train/config";
import { TrainScreen } from "@/components/train/TrainScreen";

export const metadata: Metadata = {
  title: "Train map · Supplier Risk Intelligence",
  description: "Blueprint train where each part is a sourcing case.",
};

/** The GLB is optional: without it the scene renders the procedural placeholder. */
function modelUrl(): string | null {
  const file = path.join(process.cwd(), "public", MODEL.file.replace(/^\//, ""));
  return fs.existsSync(file) ? MODEL.file : null;
}

export default function TrainPage() {
  return (
    <AppShell fullBleed>
      <TrainScreen modelUrl={modelUrl()} />
    </AppShell>
  );
}
