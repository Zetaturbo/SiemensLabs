import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page";
import { ResearchJobs } from "@/components/shell/pages/research-jobs";
import { researchMode } from "@/lib/research/client";

export const metadata: Metadata = { title: "Research · Supplier Risk Intelligence" };

export default function ResearchPage() {
  return (
    <PageBody>
      <PageHeader title="Research" context="Public record checks on real companies linked to suppliers in your cases." />
      <ResearchJobs mode={researchMode()} />
    </PageBody>
  );
}
