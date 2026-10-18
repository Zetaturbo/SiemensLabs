"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Check } from "lucide-react";
import { Button } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import type { FilterCondition } from "@/lib/data-api/types";
import { useBlockEnv } from "./block-context";
import { conditionKey, conditionLabel, mergeConditions } from "./condition-label";
import { labelOf, num, str } from "./fields";
import { BlockEmpty, BlockFrame, Num, WithResult } from "./primitives";
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
    dimensions: [...dimensions].sort((a, b) => b.weight - a.weight),
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

/** "Quality Risk" (title case from get_metadata) -> "Quality risk"; falls back to the field label. */
const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

function GuidanceBody({ value, title }: { value: unknown; title?: string | null }) {
  const g = parseGuidance(value);
  const { dispatch } = useBlockEnv();
  const { caseId, current, applied } = useApplied(g.filters);
  const heading = title ?? `What matters for ${g.subject.toLowerCase()}`;
  if (!g.dimensions.length && !g.filters.length) return <BlockEmpty block="guidance" title={heading} message="No weighted dimensions or filters for this part." />;
  const max = Math.max(...g.dimensions.map((d) => d.weight), 0.01);
  const note = [`Profile: ${g.profileLabel}.`, g.why].filter(Boolean).join(" ");

  const apply = () => {
    // Suggested filters replace the case's filters on the same field; others stay.
    dispatch({ type: "set_hard_requirements", conditions: mergeConditions(current, g.filters) });
  };

  return (
    <BlockFrame block="guidance" title={heading} note={note}>
      {g.dimensions.length > 0 && (
        <ol className="-mx-2">
          {g.dimensions.map((d) => (
            <li key={d.field} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_3rem] items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover" title={d.description || undefined}>
              <span className="truncate text-sm text-ink">{d.label ? sentenceCase(d.label) : labelOf(d.field)}</span>
              <span className="relative h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
                <span className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${(d.weight / max) * 100}%` }} />
              </span>
              <Num className="text-right text-sm text-ink">{Math.round(d.weight * 100)}%</Num>
            </li>
          ))}
        </ol>
      )}
      {g.filters.length > 0 && (
        <div className={g.dimensions.length ? "mt-4 flex flex-wrap items-center gap-2 border-t border-subtle pt-4" : "flex flex-wrap items-center gap-2"}>
          {g.filters.map((f) => (
            <span key={conditionKey(f)} className="inline-flex h-8 items-center rounded-full border border-line px-3 text-sm text-ink">
              {conditionLabel(f)}
            </span>
          ))}
          <Button
            size="sm"
            variant={applied ? "ghost" : "primary"}
            pill
            className="ml-auto"
            disabled={!caseId || applied}
            leading={applied ? <Check /> : undefined}
            onClick={apply}
            title={caseId ? undefined : "Open a sourcing case to apply filters"}
          >
            {applied ? "Applied" : "Apply filters"}
          </Button>
        </div>
      )}
    </BlockFrame>
  );
}

export const GuidanceBlock: ComponentRenderer<BlockProps<"Guidance">> = ({ props }) => <GuidanceView resultId={props.resultId} title={props.title} />;
