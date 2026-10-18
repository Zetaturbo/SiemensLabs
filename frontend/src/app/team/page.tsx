import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page";
import { TeamRoster } from "@/components/shell/pages/team-roster";

export const metadata: Metadata = { title: "Team · Supplier Risk Intelligence" };

export default function TeamPage() {
  return (
    <PageBody>
      <PageHeader title="Team" context="Buyers and reviewers working the train's sourcing cases." />
      <TeamRoster />
    </PageBody>
  );
}
