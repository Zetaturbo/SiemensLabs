import Link from "next/link";
import { ArrowRight, TrainFront, Scale } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card, Badge } from "@/design-system/react";

export default function Home() {
  return (
    <AppShell>
      <div className="max-w-2xl">
        <Badge>Siemens challenge · hackathon build</Badge>
        <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-ink">Smart supplier selection for trains</h1>
        <p className="mt-2 text-md text-subtext">
          Explore 10,000 suppliers, compare up to 20 side by side, re-weight risk for the part you are sourcing and leave with a justified shortlist.
        </p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Link href="/train" className="group">
          <Card className="h-full p-5 transition-colors hover:bg-surface-hover">
            <TrainFront className="size-5 text-subtext" />
            <div className="mt-3 text-lg font-medium text-ink">Train map</div>
            <p className="mt-1 text-sm text-subtext">Every part of the vehicle with its sourcing status and owner.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-ink">Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
          </Card>
        </Link>
        <Link href="/cases/case_brake_system" className="group">
          <Card className="h-full p-5 transition-colors hover:bg-surface-hover">
            <Scale className="size-5 text-subtext" />
            <div className="mt-3 text-lg font-medium text-ink">Brake system case</div>
            <p className="mt-1 text-sm text-subtext">Long list, shortlist, finalists and the award memo for a safety-critical part.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm text-ink">Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" /></span>
          </Card>
        </Link>
      </div>
    </AppShell>
  );
}
