import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { MODEL } from "@/components/train/config";
import { TrainScreen } from "@/components/train/TrainScreen";

export const metadata: Metadata = {
  title: "Supplier Risk Intelligence",
  description: "Procurement copilot for rail buyers: a blueprint of the train where every part is a sourcing case.",
};

/** The GLB is optional: without it the scene renders the procedural placeholder. */
function modelUrl(): string | null {
  const file = path.join(process.cwd(), "public", MODEL.file.replace(/^\//, ""));
  return fs.existsSync(file) ? MODEL.file : null;
}

export default function TrainPage() {
  return (
    // the app shell (sidebar and top bar) comes from the layout; the screen fills the content area
    <TrainScreen modelUrl={modelUrl()} />
  );
}
