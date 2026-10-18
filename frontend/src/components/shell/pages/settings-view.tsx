"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { Avatar, Badge, Button, Card, Divider, Field, FieldRow, Input, Select, StatusDot, Switch, TBody, THead, Table, Tabs, Td, Th, Tr, useToast } from "@/design-system/react";
import { currentUser, currentWorkspace } from "@/lib/session/current-user";

export type SettingsTab = "profile" | "workspace" | "team" | "integrations" | "billing" | "notifications";

const TABS: Array<{ value: SettingsTab; label: string }> = [
  { value: "profile", label: "Profile" },
  { value: "workspace", label: "Workspace" },
  { value: "team", label: "Team" },
  { value: "integrations", label: "Integrations" },
  { value: "billing", label: "Billing" },
  { value: "notifications", label: "Notifications" },
];

/** Server-read configuration for the Integrations tab (no secrets, only what and where). */
export interface IntegrationsConfig {
  model: { id: string; host: string; keySet: boolean; reasoning: boolean };
  data: { mock: boolean; order: string[] };
  research: { mode: "replay" | "live"; host: string | null };
}

const isTab = (v: string | null): v is SettingsTab => TABS.some((t) => t.value === v);

/** Tabs from ?tab=; the static fallback (prerender) shows Profile. */
export function SettingsView({ config }: { config: IntegrationsConfig }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = params.get("tab");
  const tab: SettingsTab = isTab(q) ? q : "profile";
  return <SettingsTabs tab={tab} config={config} onTab={(t) => router.replace(`${pathname}?tab=${t}`, { scroll: false })} />;
}

export function SettingsTabs({ tab, config, onTab }: { tab: SettingsTab; config: IntegrationsConfig; onTab?: (t: SettingsTab) => void }) {
  return (
    <>
      <Tabs items={TABS} value={tab} onValueChange={onTab} variant="underline" aria-label="Settings" className="mb-6" />
      <div role="tabpanel" aria-label={TABS.find((t) => t.value === tab)?.label}>
        {tab === "profile" && <ProfileTab />}
        {tab === "workspace" && <WorkspaceTab />}
        {tab === "team" && <TeamTab />}
        {tab === "integrations" && <IntegrationsTab config={config} />}
        {tab === "billing" && <BillingTab />}
        {tab === "notifications" && <NotificationsTab />}
      </div>
    </>
  );
}

function Section({ title, description, children, save = true }: { title: string; description?: string; children: ReactNode; save?: boolean }) {
  const { toast } = useToast();
  return (
    <Card>
      <div className="px-5 pb-1 pt-4">
        <h2 className="text-md font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-subtext">{description}</p>}
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">{children}</div>
      {save && (
        <div className="flex justify-end border-t border-subtle px-5 py-3">
          <Button variant="primary" size="sm" onClick={() => toast({ tone: "success", title: "Changes saved" })}>
            Save
          </Button>
        </div>
      )}
    </Card>
  );
}

function ProfileTab() {
  return (
    <Section title="Profile" description="How you appear to your team and in case logs.">
      <div className="flex items-center gap-3">
        <Avatar name={currentUser.name} size="lg" className="rounded-full" />
        <div>
          <div className="text-base font-medium text-ink">{currentUser.name}</div>
          <div className="text-sm text-subtext">
            {currentUser.role} · {currentUser.department}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Full name" htmlFor="pf-name">
          <Input id="pf-name" defaultValue={currentUser.name} />
        </Field>
        <Field label="Email" htmlFor="pf-email" hint="Managed by single sign-on">
          <Input id="pf-email" defaultValue={currentUser.email} disabled />
        </Field>
        <Field label="Role" htmlFor="pf-role">
          <Input id="pf-role" defaultValue={currentUser.role} />
        </Field>
        <Field label="Department" htmlFor="pf-dept">
          <Input id="pf-dept" defaultValue={currentUser.department} />
        </Field>
      </div>
    </Section>
  );
}

function WorkspaceTab() {
  return (
    <Section title="Workspace" description="Defaults for every case in this workspace.">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Workspace name" htmlFor="ws-name">
          <Input id="ws-name" defaultValue={currentWorkspace.name} />
        </Field>
        <Field label="Workspace URL" htmlFor="ws-url">
          <Input id="ws-url" defaultValue="sm-procurement" leading={<span className="font-mono text-xs">app/</span>} />
        </Field>
        <Field label="Default weighting profile">
          <Select
            aria-label="Default weighting profile"
            defaultValue="default"
            options={[
              { value: "default", label: "Default (official Total Risk Index)" },
              { value: "safety_critical", label: "Safety critical" },
              { value: "strategic_system", label: "Strategic system" },
              { value: "commodity", label: "Commodity" },
              { value: "lksg_due_diligence", label: "LkSG due diligence" },
            ]}
          />
        </Field>
        <Field label="Currency">
          <Select aria-label="Currency" defaultValue="eur" options={[{ value: "eur", label: "EUR" }, { value: "usd", label: "USD" }, { value: "gbp", label: "GBP" }]} />
        </Field>
      </div>
    </Section>
  );
}

function TeamTab() {
  return (
    <Section title="Team" description="Who can do what in a case.">
      <FieldRow label="Default role for new members" description="Applies to invitations.">
        <Select
          aria-label="Default role"
          size="sm"
          align="end"
          defaultValue="buyer"
          options={[
            { value: "buyer", label: "Buyer" },
            { value: "viewer", label: "Viewer" },
          ]}
        />
      </FieldRow>
      <Divider />
      <FieldRow label="Awards need a second reviewer" description="A category manager confirms every award before the memo is final.">
        <Switch defaultChecked aria-label="Awards need a second reviewer" />
      </FieldRow>
      <Divider />
      <FieldRow label="Buyers can start research" description="Public record checks on linked legal entities.">
        <Switch defaultChecked aria-label="Buyers can start research" />
      </FieldRow>
    </Section>
  );
}

function ConfigRow({ label, status, tone, children }: { label: string; status: string; tone: "success" | "warning" | "neutral" | "brand"; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
      <div className="w-40 shrink-0 text-base font-medium text-ink">{label}</div>
      <div className="min-w-0 flex-1 text-sm text-subtext">{children}</div>
      <StatusDot size="sm" tone={tone} label={status} className="shrink-0" />
    </div>
  );
}

function IntegrationsTab({ config }: { config: IntegrationsConfig }) {
  return (
    <Section title="Integrations" description="Read from the server environment. Change it in the deployment's .env and restart." save={false}>
      <div className="flex flex-col divide-y divide-subtle">
        <ConfigRow label="Language model" status={config.model.keySet ? "Connected" : "No API key"} tone={config.model.keySet ? "success" : "warning"}>
          <div className="font-mono text-ink">{config.model.id}</div>
          <div className="mt-0.5">
            {config.model.host} · reasoning {config.model.reasoning ? "on" : "off"}
          </div>
        </ConfigRow>
        <ConfigRow label="Supplier data" status={config.data.mock ? "Mock data" : "Live"} tone={config.data.mock ? "warning" : "success"}>
          <ol className="flex flex-col gap-0.5">
            {config.data.order.map((s, i) => (
              <li key={s} className="flex gap-2">
                <span className="w-3 font-mono text-tertiary">{i + 1}</span>
                <span className={i === 0 ? "text-ink" : undefined}>{s}</span>
              </li>
            ))}
          </ol>
        </ConfigRow>
        <ConfigRow label="Research agent" status={config.research.mode === "live" ? "Live" : "Replay"} tone={config.research.mode === "live" ? "success" : "neutral"}>
          {config.research.mode === "live" ? (
            <span>
              Live research agent at <span className="font-mono text-ink">{config.research.host}</span>
            </span>
          ) : (
            <span>Replay mode: canned report for Knorr-Bremse AG; other companies need a live research agent.</span>
          )}
        </ConfigRow>
      </div>
    </Section>
  );
}

const INVOICES = [
  { no: "INV-2026-0010", date: "1 Oct 2026", amount: "€ 48,000.00" },
  { no: "INV-2025-0010", date: "1 Oct 2025", amount: "€ 42,000.00" },
  { no: "INV-2024-0010", date: "1 Oct 2024", amount: "€ 36,000.00" },
];

function BillingTab() {
  const { toast } = useToast();
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex items-center justify-between gap-4 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-md font-semibold text-ink">Enterprise · annual</span>
            <Badge size="sm" tone="success">
              Active
            </Badge>
          </div>
          <div className="mt-0.5 text-sm text-subtext">
            <span className="font-mono tabular-nums">40</span> seats · renews <span className="font-mono tabular-nums">1 Oct 2027</span>
          </div>
        </div>
        <Button size="sm" onClick={() => toast({ title: "Your account team will be in touch" })}>
          Contact sales
        </Button>
      </Card>
      <Card className="overflow-hidden">
        <div className="px-5 pb-2 pt-4">
          <h2 className="text-md font-semibold text-ink">Invoices</h2>
        </div>
        <Table>
          <THead>
            <tr>
              <Th className="pl-5">Invoice</Th>
              <Th>Date</Th>
              <Th className="text-right">Amount</Th>
              <Th className="pr-5">Status</Th>
            </tr>
          </THead>
          <TBody>
            {INVOICES.map((i) => (
              <Tr key={i.no}>
                <Td className="pl-5 font-mono text-sm">{i.no}</Td>
                <Td className="text-subtext">{i.date}</Td>
                <Td className="text-right font-mono text-sm tabular-nums">{i.amount}</Td>
                <Td className="pr-5">
                  <StatusDot size="sm" tone="success" label="Paid" />
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const rows: Array<[string, string, boolean]> = [
    ["Research finished", "A research job on a linked company completed.", true],
    ["Case assigned to me", "Someone made you the owner of a case.", true],
    ["Award needs review", "A case you review reached the awarded stage.", true],
    ["Weekly digest", "Monday email with stage changes across all cases.", false],
  ];
  return (
    <Section title="Notifications" description="In-app and email; email goes to the address on your profile.">
      {rows.map(([label, description, on], i) => (
        <div key={label} className="flex flex-col gap-4">
          {i > 0 && <Divider />}
          <FieldRow label={label} description={description}>
            <Switch defaultChecked={on} aria-label={label} />
          </FieldRow>
        </div>
      ))}
    </Section>
  );
}
