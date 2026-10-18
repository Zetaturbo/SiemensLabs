import type { Metadata } from "next";
import { AppShell } from "@/components/shell/app-shell";
import { DevBlocksGallery } from "@/components/ui-blocks/dev-gallery";

export const metadata: Metadata = { title: "UI blocks · dev" };

/** Visual check for every OpenUI block against fixture results (and the chat panel in demo mode). */
export default function DevBlocksPage() {
  return (
    <AppShell fullBleed>
      <DevBlocksGallery />
    </AppShell>
  );
}
