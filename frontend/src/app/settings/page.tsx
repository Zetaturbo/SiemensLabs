import type { Metadata } from "next";
import { Suspense } from "react";
import { PageBody, PageHeader } from "@/components/shell/page";
import { SettingsTabs, SettingsView, type IntegrationsConfig } from "@/components/shell/pages/settings-view";
import { LLM_BASE_URL, MODEL_ID, REASONING, hasLlmKey } from "@/lib/llm/provider";
import { researchMode } from "@/lib/research/client";

export const metadata: Metadata = { title: "Settings · Supplier Risk Intelligence" };

const host = (url: string | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** What the server runs with, read from its environment; hosts and names only, never keys. */
function integrations(): IntegrationsConfig {
  const mock = process.env.DATA_API_MOCK === "1";
  const dataHost = host(process.env.DATA_API_URL) ?? "localhost:8000";
  return {
    model: { id: MODEL_ID, host: host(LLM_BASE_URL) ?? LLM_BASE_URL, keySet: hasLlmKey(), reasoning: REASONING },
    data: {
      mock,
      order: mock ? ["Mock engine (filters, ranking and ids against the sample)", "Static mock responses (src/lib/data-api/mocks)"] : [`Supplier data service at ${dataHost}`],
    },
    research: { mode: researchMode(), host: host(process.env.RESEARCH_API_URL) },
  };
}

export default function SettingsPage() {
  const config = integrations();
  return (
    <PageBody width="narrow">
      <PageHeader title="Settings" context="Your profile, the workspace and how it connects." />
      <Suspense fallback={<SettingsTabs tab="profile" config={config} />}>
        <SettingsView config={config} />
      </Suspense>
    </PageBody>
  );
}
