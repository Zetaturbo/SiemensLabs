"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Badge, Card, CardHeader, TBody, THead, Table, Td, Th, Tr } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { startCasePersistence } from "@/lib/cases/actions";
import { PARTS } from "./case-context";
import { LevelChip } from "./primitives";

const STAGE_LABEL: Record<string, string> = { none: "Not started", long_list: "Long list", shortlist: "Shortlist", finalists: "Finalists", awarded: "Awarded" };

/** All train parts with their sourcing case (or a link that opens one). */
export function CaseIndex() {
  const cases = useCases((s) => s.cases);
  useEffect(() => startCasePersistence(), []);
  return (
    <Card>
      <CardHeader title="Sourcing cases" description="One case per train part. Opening a part without a case starts one with the part's default profile." />
      <Table>
        <THead>
          <tr>
            <Th>Part</Th>
            <Th>Stage</Th>
            <Th>Profile</Th>
            <Th>Owner</Th>
            <Th className="text-right">Shortlist</Th>
            <Th>Risk</Th>
          </tr>
        </THead>
        <TBody>
          {PARTS.map((p) => {
            const c = Object.values(cases).find((x) => x.partId === p.id);
            return (
              <Tr key={p.id}>
                <Td>
                  <Link className="font-medium text-ink hover:underline" href={`/cases/${c?.id ?? `case_${p.id}`}`}>
                    {p.label}
                  </Link>
                </Td>
                <Td>{c ? <Badge size="sm" tone={c.stage === "awarded" ? "success" : "neutral"}>{STAGE_LABEL[c.stage]}</Badge> : <span className="text-tertiary">–</span>}</Td>
                <Td className="text-subtext">{c?.profileId ?? p.profile}</Td>
                <Td>{c?.owner?.name ?? <span className="text-tertiary">–</span>}</Td>
                <Td className="text-right font-mono tabular-nums">{c ? `${c.shortlist.length}/20` : "–"}</Td>
                <Td>{c?.riskSummary.level ? <LevelChip level={c.riskSummary.level} /> : <span className="text-tertiary">–</span>}</Td>
              </Tr>
            );
          })}
        </TBody>
      </Table>
    </Card>
  );
}
