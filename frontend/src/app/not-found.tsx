import type { Metadata } from "next";
import Link from "next/link";
import { FolderKanban, TrainFront } from "lucide-react";
import { LINK_BUTTON } from "@/components/shell/page";

export const metadata: Metadata = { title: "Not found · Supplier Risk Intelligence" };

/** 404 inside the app frame (sidebar and top bar stay). */
export default function NotFound() {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="font-mono text-sm text-tertiary">404</div>
      <h1 className="text-xl font-semibold text-ink">This page does not exist</h1>
      <p className="max-w-sm text-base text-subtext">The link may be old, or the case was removed.</p>
      <div className="mt-4 flex items-center gap-2">
        <Link href="/train" className={LINK_BUTTON}>
          <TrainFront aria-hidden /> Train map
        </Link>
        <Link href="/cases" className={LINK_BUTTON}>
          <FolderKanban aria-hidden /> Cases
        </Link>
      </div>
    </div>
  );
}
