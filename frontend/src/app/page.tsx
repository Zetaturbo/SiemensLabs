import Link from "next/link";
import { ArrowRight, MessageSquare, TrainFront } from "lucide-react";
import { AppShell } from "@/components/shell/app-shell";
import { Card } from "@/design-system/react";

const ENTRIES = [
  { href: "/train", icon: TrainFront, title: "Train map", text: "Every part, its stage and owner." },
  { href: "/cases/case_brake_system", icon: MessageSquare, title: "Brake system case", text: "Source a safety-critical part by chat." },
];

export default function Home() {
  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-[-0.035em] text-ink">Smart supplier selection for trains</h1>
        <p className="mt-2 text-md text-subtext">10,000 suppliers. One conversation per part.</p>
      </div>
      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {ENTRIES.map(({ href, icon: Icon, title, text }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full p-5 transition-colors hover:bg-surface-hover">
              <Icon className="size-5 text-subtext" />
              <div className="mt-3 text-lg font-medium text-ink">{title}</div>
              <p className="mt-1 text-sm text-subtext">{text}</p>
              <span className="mt-4 inline-flex items-center gap-1 text-sm text-ink">
                Open <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Card>
          </Link>
        ))}
      </div>
    </AppShell>
  );
}
