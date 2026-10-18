"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { UiAction } from "@/components/chat/ui-actions";

/**
 * What a block knows about where it is rendered: the current sourcing case (for pins),
 * who acts (for the case log), and how to raise UI actions or ask a follow-up question.
 * ChatPanel provides it; outside a provider blocks still render, pins are disabled.
 */
export interface BlockEnv {
  caseId: string | null;
  who: string;
  /** Raise a UI action (open_supplier, start_research, ...). ChatPanel routes it like a model ui_action. */
  dispatch: (action: UiAction) => void;
  /** Send a follow-up question to the chat, when there is one. */
  ask?: (text: string) => void;
}

const DEFAULT_ENV: BlockEnv = { caseId: null, who: "buyer", dispatch: () => {} };
const BlockEnvContext = createContext<BlockEnv>(DEFAULT_ENV);

export function BlockEnvProvider({ caseId, who, dispatch, ask, children }: Partial<BlockEnv> & { children: ReactNode }) {
  const value = useMemo<BlockEnv>(
    () => ({ caseId: caseId ?? null, who: who ?? DEFAULT_ENV.who, dispatch: dispatch ?? DEFAULT_ENV.dispatch, ask }),
    [caseId, who, dispatch, ask],
  );
  return <BlockEnvContext.Provider value={value}>{children}</BlockEnvContext.Provider>;
}

export const useBlockEnv = () => useContext(BlockEnvContext);
