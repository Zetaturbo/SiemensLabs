import type { Metadata } from "next";
import Link from "next/link";
import { TrainFront } from "lucide-react";
import { LINK_BUTTON, PageBody, PageHeader } from "@/components/shell/page";
import { CasesList } from "@/components/shell/pages/cases-list";

export const metadata: Metadata = { title: "Cases · Supplier Risk Intelligence" };

export default function CasesPage() {
  return (
    <PageBody>
      <PageHeader
        title="Cases"
        context="One sourcing case per train part, most recent activity first."
        actions={
          <Link href="/train" className={LINK_BUTTON}>
            <TrainFront aria-hidden /> Train map
          </Link>
        }
      />
      <CasesList />
    </PageBody>
  );
}
