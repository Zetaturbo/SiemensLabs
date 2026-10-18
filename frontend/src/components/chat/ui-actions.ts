import { z } from "zod/v4";
import parts from "@/config/train-parts.json";
import { pinToShortlist, setProfile } from "@/lib/cases/actions";
import { useCases } from "@/lib/cases/store";
import type { Owner, Stage } from "@/lib/cases/types";

/**
 * UI actions the chat (or a block) can raise (ARCHITECTURE.md section 7, plus assign_part and set_case_stage).
 * A superset of UiAction in src/skills/types.ts (what the chat route sends as data-ui-actions); the parser is
 * lenient about aliases (supplier_id/id, supplier_ids/ids, profile/profile_id, owner_name) because the model,
 * the skills and the blocks all produce them.
 */
export type UiAction =
  | { type: "add_to_shortlist"; ids: string[] }
  | { type: "remove_from_shortlist"; ids: string[] }
  | { type: "set_profile"; profile_id: string }
  | { type: "open_supplier"; id: string }
  | { type: "open_compare"; ids?: string[] }
  /** From the route: the job already runs and result_id is the handle RiskFlagList polls. From a block: a request to start one. */
  | { type: "start_research"; supplier_id?: string; company_name?: string; country?: string; website?: string; job_id?: string; result_id?: string }
  /** Assign a train part (its sourcing case) to a buyer. */
  | { type: "assign_part"; part_id: string; owner?: Owner; supplier_id?: string }
  | { type: "set_case_stage"; stage: Stage; case_id?: string };

export type UiActionType = UiAction["type"];

const ids = z.preprocess((v) => (typeof v === "string" ? [v] : v), z.array(z.string()).min(1));
const STAGES = ["none", "long_list", "shortlist", "finalists", "awarded"] as const;

const raw = z
  .object({
    type: z.string(),
    ids: z.unknown().optional(),
    supplier_ids: z.unknown().optional(),
    id: z.unknown().optional(),
    supplier_id: z.unknown().optional(),
    profile_id: z.unknown().optional(),
    profile: z.unknown().optional(),
    company_name: z.unknown().optional(),
    country: z.unknown().optional(),
    website: z.unknown().optional(),
    part_id: z.unknown().optional(),
    stage: z.unknown().optional(),
    case_id: z.unknown().optional(),
    job_id: z.unknown().optional(),
    result_id: z.unknown().optional(),
    owner: z.unknown().optional(),
    owner_name: z.unknown().optional(),
    department: z.unknown().optional(),
  })
  .loose();

const optStr = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);

function normalize(input: unknown): UiAction | null {
  const r = raw.safeParse(input);
  if (!r.success) return null;
  const a = r.data;
  const idList = ids.safeParse(a.ids ?? a.supplier_ids ?? a.id ?? a.supplier_id);
  switch (a.type) {
    case "add_to_shortlist":
    case "remove_from_shortlist":
      return idList.success ? { type: a.type, ids: idList.data } : null;
    case "set_profile": {
      const profile_id = optStr(a.profile_id) ?? optStr(a.profile);
      return profile_id ? { type: "set_profile", profile_id } : null;
    }
    case "open_supplier": {
      const id = optStr(a.id) ?? optStr(a.supplier_id) ?? (idList.success ? idList.data[0] : undefined);
      return id ? { type: "open_supplier", id } : null;
    }
    case "open_compare":
      return { type: "open_compare", ids: idList.success ? idList.data : undefined };
    case "start_research":
      return {
        type: "start_research",
        supplier_id: optStr(a.supplier_id) ?? optStr(a.id),
        company_name: optStr(a.company_name),
        country: optStr(a.country),
        website: optStr(a.website),
        job_id: optStr(a.job_id),
        result_id: optStr(a.result_id),
      };
    case "assign_part": {
      const part_id = optStr(a.part_id);
      const o = (a.owner && typeof a.owner === "object" ? a.owner : {}) as Record<string, unknown>;
      const name = optStr(o.name) ?? optStr(a.owner_name);
      const owner = name ? { name, department: optStr(o.department) ?? optStr(a.department) ?? "" } : undefined;
      return part_id ? { type: "assign_part", part_id, owner, supplier_id: optStr(a.supplier_id) ?? optStr(a.id) } : null;
    }
    case "set_case_stage": {
      const stage = optStr(a.stage);
      return stage && (STAGES as readonly string[]).includes(stage) ? { type: "set_case_stage", stage: stage as Stage, case_id: optStr(a.case_id) } : null;
    }
    default:
      return null;
  }
}

/**
 * Accepts any of: an action, an array of actions, { ui_actions: [...] }, { actions: [...] }.
 * Invalid entries are dropped.
 */
export function parseUiActions(value: unknown): UiAction[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.map(normalize).filter((a): a is UiAction => a !== null);
  if (typeof value === "object") {
    const o = value as Record<string, unknown>;
    if (Array.isArray(o.ui_actions)) return parseUiActions(o.ui_actions);
    if (Array.isArray(o.actions)) return parseUiActions(o.actions);
    const one = normalize(value);
    return one ? [one] : [];
  }
  return [];
}

/** Actions the case store applies itself; the rest go to the page through onAction. */
export const STORE_ACTIONS: ReadonlySet<UiActionType> = new Set(["add_to_shortlist", "remove_from_shortlist", "set_profile", "set_case_stage", "assign_part"]);

const partProfile = (partId: string) => parts.parts.find((p) => p.id === partId)?.profile ?? "default";

/**
 * Apply an action to the shared case store. Returns true when the store handled it.
 * Uses the case screens' helpers in src/lib/cases/actions.ts, so chat changes land in the same store and log.
 */
export function applyUiActionToStore(action: UiAction, caseId: string | null | undefined, who: string): boolean {
  const store = useCases.getState();
  if (action.type === "assign_part") {
    if (!action.owner) return false;
    const owner = action.owner;
    const existing = store.byPart(action.part_id);
    if (!existing) {
      store.createCase(action.part_id, partProfile(action.part_id), owner);
      return true;
    }
    useCases.setState((s) => {
      const c = s.cases[existing.id];
      const at = new Date().toISOString();
      return { cases: { ...s.cases, [c.id]: { ...c, owner, log: [...c.log, { at, who, what: `assigned to ${owner.name}` }], updatedAt: at } } };
    });
    return true;
  }
  if (action.type === "set_case_stage" && (action.case_id ?? caseId)) {
    store.setStage((action.case_id ?? caseId)!, action.stage, who);
    return true;
  }
  if (!caseId) return false;
  switch (action.type) {
    case "add_to_shortlist":
      // Same helper the case screens use: pins (max 20) and opens the shortlist stage.
      action.ids.forEach((id) => pinToShortlist(caseId, id, who));
      return true;
    case "remove_from_shortlist":
      action.ids.forEach((id) => store.unpin(caseId, id, who));
      return true;
    case "set_profile":
      setProfile(caseId, action.profile_id, who);
      return true;
    default:
      return false;
  }
}

/** One-line receipt shown under the assistant message. */
export function describeUiAction(a: UiAction): string {
  switch (a.type) {
    case "add_to_shortlist":
      return `Added ${a.ids.join(", ")} to the shortlist`;
    case "remove_from_shortlist":
      return `Removed ${a.ids.join(", ")} from the shortlist`;
    case "set_profile":
      return `Switched profile to ${a.profile_id}`;
    case "open_supplier":
      return `Opened ${a.id}`;
    case "open_compare":
      return a.ids?.length ? `Opened comparison of ${a.ids.length} suppliers` : "Opened comparison";
    case "start_research":
      return `Started research on ${a.company_name ?? a.supplier_id ?? "the company"}`;
    case "assign_part":
      return a.owner ? `Assigned ${a.part_id.replace(/_/g, " ")} to ${a.owner.name}` : `Assigned part ${a.part_id}`;
    case "set_case_stage":
      return `Moved case to ${a.stage.replace("_", " ")}`;
  }
}
