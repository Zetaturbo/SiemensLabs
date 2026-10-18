import { z } from "zod/v4";
import { useCases } from "@/lib/cases/store";
import type { Stage } from "@/lib/cases/types";

/**
 * UI actions the chat (or a block) can raise (ARCHITECTURE.md section 7, plus assign_part and set_case_stage).
 * The parser is lenient about aliases (supplier_id/id, supplier_ids/ids, profile/profile_id) because
 * both the model and the skills produce them.
 */
export type UiAction =
  | { type: "add_to_shortlist"; ids: string[] }
  | { type: "remove_from_shortlist"; ids: string[] }
  | { type: "set_profile"; profile_id: string }
  | { type: "open_supplier"; id: string }
  | { type: "open_compare"; ids?: string[] }
  | { type: "start_research"; supplier_id?: string; company_name?: string; country?: string; website?: string }
  | { type: "assign_part"; part_id: string; supplier_id?: string }
  | { type: "set_case_stage"; stage: Stage };

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
      };
    case "assign_part": {
      const part_id = optStr(a.part_id);
      return part_id ? { type: "assign_part", part_id, supplier_id: optStr(a.supplier_id) ?? optStr(a.id) } : null;
    }
    case "set_case_stage": {
      const stage = optStr(a.stage);
      return stage && (STAGES as readonly string[]).includes(stage) ? { type: "set_case_stage", stage: stage as Stage } : null;
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
export const STORE_ACTIONS: ReadonlySet<UiActionType> = new Set(["add_to_shortlist", "remove_from_shortlist", "set_profile", "set_case_stage"]);

/**
 * Apply an action to the shared case store. Returns true when the store handled it.
 * The store has no setProfile yet, so set_profile writes through setState in the store's own style.
 */
export function applyUiActionToStore(action: UiAction, caseId: string | null | undefined, who: string): boolean {
  if (!caseId) return false;
  const store = useCases.getState();
  switch (action.type) {
    case "add_to_shortlist":
      action.ids.forEach((id) => store.pin(caseId, id, who));
      return true;
    case "remove_from_shortlist":
      action.ids.forEach((id) => store.unpin(caseId, id, who));
      return true;
    case "set_case_stage":
      store.setStage(caseId, action.stage, who);
      return true;
    case "set_profile":
      useCases.setState((s) => {
        const c = s.cases[caseId];
        if (!c || c.profileId === action.profile_id) return s;
        const at = new Date().toISOString();
        return { cases: { ...s.cases, [caseId]: { ...c, profileId: action.profile_id, log: [...c.log, { at, who, what: `profile -> ${action.profile_id}` }], updatedAt: at } } };
      });
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
      return a.supplier_id ? `Assigned ${a.supplier_id} to ${a.part_id}` : `Assigned part ${a.part_id}`;
    case "set_case_stage":
      return `Moved case to ${a.stage.replace("_", " ")}`;
  }
}
