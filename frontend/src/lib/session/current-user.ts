/**
 * The signed-in user and workspace. Static for the demo; this is the one place a login provider replaces
 * (return the session's user from here and every surface follows: sidebar, account menu, settings, team).
 */
export interface SessionUser {
  /** Matches the roster id in src/lib/cases/team.ts when the user is on the roster. */
  id: string;
  name: string;
  initials: string;
  role: string;
  department: string;
  email: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
}

export const currentUser: SessionUser = {
  id: "marcel",
  name: "Marcel-Felix Krause",
  initials: "MK",
  role: "Lead buyer",
  department: "Rail procurement",
  email: "marcel.krause@example.com",
};

export const WORKSPACES: Workspace[] = [
  { id: "sm-procurement", name: "Siemens Mobility · Procurement", plan: "Enterprise" },
  { id: "sm-service", name: "Siemens Mobility · Rail Service", plan: "Enterprise" },
];

export const currentWorkspace: Workspace = WORKSPACES[0];
