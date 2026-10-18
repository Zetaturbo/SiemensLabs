"use client";
import { create } from "zustand";
import { memberById } from "@/lib/cases/team";
import type { Owner } from "@/lib/cases/types";
import { currentUser } from "@/lib/session/current-user";

/** The signed-in user's roster id (team.ts), for presence. */
export const CURRENT_USER_ID: string = currentUser.id;

const member = memberById(currentUser.id);

/**
 * The signed-in user (src/lib/session) as a case owner and the `who` in the case log. Written with the roster's
 * name and department ("Marcel K.", "Running gear") when the user is on the roster, so log authors, owners and
 * presence match the seeded team; otherwise the session's own name and department.
 */
export const CURRENT_USER: Owner = member
  ? { name: member.name, department: member.department }
  : { name: currentUser.name || "Marcel K.", department: currentUser.department || "Running gear" };

export type DrawerTab = "risk" | "public_record";

interface CaseUiState {
  /** supplier shown in the drawer (also the chat's selected_supplier) */
  selectedSupplier: string | null;
  drawerTab: DrawerTab;
  openSupplier: (id: string, tab?: DrawerTab) => void;
  closeSupplier: () => void;
  setDrawerTab: (tab: DrawerTab) => void;
}

/**
 * View state of the case screens (not case data). The chat's `open_supplier` ui_action can call
 * `useCaseUi.getState().openSupplier(id)`.
 */
export const useCaseUi = create<CaseUiState>((set) => ({
  selectedSupplier: null,
  drawerTab: "risk",
  openSupplier: (id, tab = "risk") => set({ selectedSupplier: id, drawerTab: tab }),
  closeSupplier: () => set({ selectedSupplier: null }),
  setDrawerTab: (drawerTab) => set({ drawerTab }),
}));
