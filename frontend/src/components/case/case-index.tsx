"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useCases } from "@/lib/cases/store";
import { startCasePersistence } from "@/lib/cases/actions";
import { PARTS } from "./case-context";
import { Badge, LevelChip, cx, ui } from "./primitives";

const STAGE_LABEL: Record<string, string> = { none: "Not started", long_list: "Long list", shortlist: "Shortlist", finalists: "Finalists", awarded: "Awarded" };

/** All train parts with their sourcing case (or a link that opens one). */
export function CaseIndex() {
  const cases = useCases((s) => s.cases);
  useEffect(() => startCasePersistence(), []);
  return (
    <main className="mx-auto w-full max-w-4xl p-6">
      <h1 className="text-lg font-semibold">Sourcing cases</h1>
      <p className={cx("mt-1 text-xs", ui.muted)}>One case per train part. Opening a part without a case starts one with the part&apos;s default profile.</p>
      <table className={cx("mt-4 w-full text-xs", ui.panel)}>
        <thead>
          <tr className={cx("border-b", ui.border)}>
            <th className={ui.th}>Part</th>
            <th className={ui.th}>Stage</th>
            <th className={ui.th}>Profile</th>
            <th className={ui.th}>Owner</th>
            <th className={ui.th}>Shortlist</th>
            <th className={ui.th}>Risk</th>
          </tr>
        </thead>
        <tbody>
          {PARTS.map((p) => {
            const c = Object.values(cases).find((x) => x.partId === p.id);
            return (
              <tr key={p.id} className={cx("border-b last:border-0", ui.border)}>
                <td className={ui.td}>
                  <Link className="font-medium text-blue-700 hover:underline dark:text-blue-300" href={`/cases/${c?.id ?? `case_${p.id}`}`}>
                    {p.label}
                  </Link>
                </td>
                <td className={ui.td}>{c ? <Badge tone={c.stage === "awarded" ? "green" : "blue"}>{STAGE_LABEL[c.stage]}</Badge> : <span className={ui.faint}>–</span>}</td>
                <td className={cx(ui.td, ui.muted)}>{c?.profileId ?? p.profile}</td>
                <td className={ui.td}>{c?.owner?.name ?? <span className={ui.faint}>–</span>}</td>
                <td className={cx(ui.td, "tabular-nums")}>{c ? `${c.shortlist.length}/20` : "–"}</td>
                <td className={ui.td}>{c?.riskSummary.level ? <LevelChip level={c.riskSummary.level} /> : <span className={ui.faint}>–</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </main>
  );
}
