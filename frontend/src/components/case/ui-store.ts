"use client";
import { create } from "zustand";
import type { Owner } from "@/lib/cases/types";

/** Stub identity until login lands; used as owner of new cases and as `who` in the case log. */
export const CURRENT_USER: Owner = { name: "Marcel K.", department: "Running gear" };

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
