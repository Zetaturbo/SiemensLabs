import type { Owner } from "./types";

/**
 * The procurement team working the train's sourcing cases: the six buyers who own cases (one or two per
 * part group, departments consistent per group) plus a category manager who reviews awards and a supplier
 * risk analyst who runs research. Case owners, log authors and presence all refer to this roster.
 */
export interface TeamMember {
  id: string;
  name: string;
  /** Avatar initials (the design system's Avatar derives the same from the name). */
  initials: string;
  department: string;
  role: string;
  /** Index into the design system's avatar palette (src/design-system/react/components/avatar.tsx); never a raw colour. */
  colorIndex: number;
}

/** Number of avatar gradients in the design system palette; colorIndex is always below this. */
export const AVATAR_PALETTE_SIZE = 5;

export const TEAM: TeamMember[] = [
  { id: "marcel", name: "Marcel K.", initials: "MK", department: "Running gear", role: "Senior buyer", colorIndex: 1 },
  { id: "jonas", name: "Jonas B.", initials: "JB", department: "Structure", role: "Buyer", colorIndex: 2 },
  { id: "lena", name: "Lena K.", initials: "LK", department: "Traction", role: "Senior buyer", colorIndex: 3 },
  { id: "priya", name: "Priya S.", initials: "PS", department: "Traction", role: "Buyer", colorIndex: 0 },
  { id: "tom", name: "Tom R.", initials: "TR", department: "Body systems", role: "Buyer", colorIndex: 4 },
  { id: "aisha", name: "Aisha M.", initials: "AM", department: "Control", role: "Senior buyer", colorIndex: 1 },
  { id: "sophie", name: "Sophie W.", initials: "SW", department: "Procurement", role: "Category manager", colorIndex: 2 },
  { id: "david", name: "David L.", initials: "DL", department: "Supplier risk", role: "Risk analyst", colorIndex: 3 },
];

export const memberById = (id: string): TeamMember | undefined => TEAM.find((m) => m.id === id);
export const memberByName = (name: string): TeamMember | undefined => TEAM.find((m) => m.name === name);

/** A team member as a case owner (the shape SourcingCase.owner uses). */
export function ownerOf(id: string): Owner {
  const m = memberById(id);
  if (!m) throw new Error(`unknown team member ${id}`);
  return { name: m.name, department: m.department };
}
