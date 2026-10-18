import raw from "@/config/train-parts.json";

export type Vec3 = [number, number, number];
export type Criticality = "safety" | "high" | "medium" | "low";

export interface ZoneBox {
  min: Vec3;
  max: Vec3;
  /** Repeat the box `count` times, offset by `step` each time (seat rows, axles). */
  repeat?: { count: number; step: Vec3 };
}

export interface TrainPart {
  id: string;
  label: string;
  group: string;
  profile: string;
  criticality: Criticality;
  /** One or two sentences for the part panel. */
  description?: string;
  /** Hotspot anchor in the normalized train frame (metres, rail y=0, nose +x). */
  position: Vec3;
  /** GLB object names whose triangles belong to this part. */
  meshNames: string[];
  glb?: { carve?: ZoneBox[]; outline?: ZoneBox[] };
}

export interface ModelConfig {
  file: string;
  credit: string;
  transform?: { rotationDeg?: Vec3; scale?: number };
  edgeThresholdDeg?: number;
}

interface RawConfig {
  model: ModelConfig;
  parts: TrainPart[];
}

const config = raw as unknown as RawConfig;

export const MODEL: ModelConfig = config.model;
export const PARTS: TrainPart[] = config.parts;
export const PART_BY_ID: Record<string, TrainPart> = Object.fromEntries(PARTS.map((p) => [p.id, p]));

export const GROUP_LABEL: Record<string, string> = {
  running_gear: "Running gear",
  structure: "Structure",
  traction: "Traction and power",
  body_systems: "Body systems",
  control: "Control",
};

export const PROFILE_LABEL: Record<string, string> = {
  safety_critical: "Safety critical",
  strategic_system: "Strategic system",
  commodity: "Commodity",
  lksg_due_diligence: "LkSG due diligence",
  default: "Default",
};

export const CRITICALITY_LABEL: Record<Criticality, string> = {
  safety: "Safety relevant",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Expand repeat specs into plain boxes. */
export function expandZones(zones: ZoneBox[] | undefined): Array<{ min: Vec3; max: Vec3 }> {
  if (!zones) return [];
  const out: Array<{ min: Vec3; max: Vec3 }> = [];
  for (const z of zones) {
    const n = Math.max(1, z.repeat?.count ?? 1);
    const s = z.repeat?.step ?? [0, 0, 0];
    for (let i = 0; i < n; i++) {
      out.push({
        min: [z.min[0] + s[0] * i, z.min[1] + s[1] * i, z.min[2] + s[2] * i],
        max: [z.max[0] + s[0] * i, z.max[1] + s[1] * i, z.max[2] + s[2] * i],
      });
    }
  }
  return out;
}
