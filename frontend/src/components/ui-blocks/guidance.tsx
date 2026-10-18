"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Check } from "lucide-react";
import { Badge, Button } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import type { FilterCondition } from "@/lib/data-api/types";
import { useBlockEnv } from "./block-context";
import { conditionKey, conditionLabel, mergeConditions } from "./condition-label";
import { num, str } from "./fields";
import { BlockFrame, Num, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

interface Dimension {
  field: string;
  label: string;
  description: string;
  weight: number;
}

/** what_matters result: { part, profile_id, profile_label, dimensions[], filters[], why }. */
export function parseGuidance(data: unknown) {
  const d = (data ?? {}) as Rec;
  const part = (d.part ?? null) as Rec | null;
  const dimensions: Dimension[] = (Array.isArray(d.dimensions) ? (d.dimensions as Rec[]) : []).flatMap((x) =>
    typeof x?.field === "string" && num(x.weight) !== null
      ? [{ field: x.field, label: str(x.label) ?? x.field, description: str(x.description) ?? "", weight: num(x.weight)! }]
      : [],
  );
  const filters: FilterCondition[] = (Array.isArray(d.filters) ? (d.filters as Rec[]) : []).filter(
    (c): c is Rec & FilterCondition => typeof c?.field === "string" && typeof c?.op === "string" && c.value !== undefined,
  );
  return {
    subject: str(part?.label) ?? str(d.query) ?? "This part",
    profileLabel: str(d.profile_label) ?? str(d.profile_id) ?? "default",
    profileId: str(d.profile_id),
    dimensions,
    filters,
    why: str(d.why),
  };
}

/** Filters already on the case: a suggested filter counts as applied when the case has the same condition. */
function useApplied(filters: FilterCondition[]) {
  const { caseId } = useBlockEnv();
  const current = useCases((s) => (caseId ? s.cases[caseId]?.hardRequirements : undefined));
  const keys = new Set((current ?? []).map(conditionKey));
  return { caseId, current: (current ?? []) as FilterCondition[], applied: filters.length > 0 && filters.every((f) => keys.has(conditionKey(f))) };
}

export function GuidanceView({ resultId, data, title }: { resultId?: string | null; data?: unknown; title?: string | null }) {
  return (
    <WithResult block="guidance" resultId={resultId} data={data} title={title ?? undefined} skeletonRows={5}>
      {(value) => <GuidanceBody value={value} title={title} />}
    </WithResult>
  );
}

function GuidanceBody({ value, title }: { value: unknown; title?: string | null }) {
  const g = parseGuidance(value);
  const { dispatch } = useBlockEnv();
  const { caseId, current, applied } = useApplied(g.filters);
  const max = Math.max(...g.dimensions.map((d) => d.weight), 0.01);

  const apply = () => {
    // Suggested filters replace the case's filters on the same field; others stay.
    dispatch({ type: "set_hard_requirements", conditions: mergeConditions(current, g.filters) });
  };

  return (
    <BlockFrame block="guidance" title={title ?? `What matters for ${g.subject.toLowerCase()}`} subtitle={`Profile: ${g.profileLabel}`}>
      {g.why && <p className="mb-3 text-sm text-ink">{g.why}</p>}
      <ol className="space-y-2">
        {g.dimensions.map((d, i) => (
          <li key={d.field} className="grid grid-cols-[1rem_minmax(0,1fr)_5rem] items-start gap-x-2">
            <Num className="pt-px text-right text-2xs text-tertiary">{i + 1}</Num>
            <div className="min-w-0">
              <div className="text-sm font-medium text-ink">{d.label}</div>
              {d.description && <p className="text-xs text-subtext">{d.description}</p>}
            </div>
            <span className="flex items-center gap-1.5 pt-1" title={`Weight ${Math.round(d.weight * 100)} %`}>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${(d.weight / max) * 100}%` }} />
              </span>
              <Num className="w-8 text-right text-xs">{Math.round(d.weight * 100)}%</Num>
            </span>
          </li>
        ))}
      </ol>
      {g.filters.length > 0 && (
        <div className="mt-3 border-t border-subtle pt-3">
          <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-tertiary">Suggested filters</p>
          <div className="flex flex-wrap items-center gap-1.5">
            {g.filters.map((f) => (
              <Badge key={conditionKey(f)} tone="outline" pill className="h-6 px-2.5 text-xs">
                {conditionLabel(f)}
              </Badge>
            ))}
            <Button
              size="sm"
              variant={applied ? "secondary" : "primary"}
              pill
              className={cn("ml-auto h-7 px-3 text-xs")}
              disabled={!caseId || applied}
              leading={applied ? <Check /> : undefined}
              onClick={apply}
              title={caseId ? undefined : "Open a sourcing case to apply filters"}
            >
              {applied ? "Applied" : "Apply"}
            </Button>
          </div>
        </div>
      )}
    </BlockFrame>
  );
}

export const GuidanceBlock: ComponentRenderer<BlockProps<"Guidance">> = ({ props }) => <GuidanceView resultId={props.resultId} title={props.title} />;
