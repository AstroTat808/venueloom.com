"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ProviderDefinition, ProviderCategory } from "@venueloom/integrations";
import { importSchemas } from "@venueloom/importer/schemas";
import type { ImportEntity } from "@venueloom/importer/types";

type DashboardTab = "catalog" | "migration" | "sync" | "conflicts";

type WorkspaceSummary = {
  organizationId: string;
  organizationName: string;
  role: string;
  userName: string;
  venues: Array<{ id: string; name: string; timezone: string; currency: string }>;
};

type PreviewResponse = {
  error?: string;
  file?: { name: string; size: number };
  sheets?: Array<{ sheetName: string; rowCount: number; headers: string[] }>;
  selectedSheet?: string;
  providerProfile?: { id: string; name: string | null } | null;
  entity?: ImportEntity;
  mapping?: Record<string, string | null>;
  coverage?: {
    totalFields: number;
    mappedFields: number;
    requiredFields: number;
    requiredMapped: number;
    canPreview: boolean;
  };
  preview?: {
    totals: { discovered: number; create: number; skip: number; error: number };
    rows: Array<{
      rowNumber: number;
      normalized: Record<string, unknown>;
      outcome: "create" | "skip" | "error";
      issues: Array<{ message: string }>;
    }>;
  } | null;
};

const tabs: Array<{ id: DashboardTab; label: string; hint: string }> = [
  { id: "catalog", label: "Integrations", hint: "Connect systems" },
  { id: "migration", label: "Migration", hint: "Bring your data" },
  { id: "sync", label: "Sync Center", hint: "Watch data flow" },
  { id: "conflicts", label: "Conflicts", hint: "Resolve changes" }
];

const importEntities: Array<{ id: ImportEntity; label: string; description: string }> = [
  { id: "clients", label: "Clients", description: "People and companies that book your venue." },
  { id: "inquiries", label: "Inquiries", description: "Leads, projects and sales opportunities." },
  { id: "events", label: "Events", description: "Booked and historical venue events." },
  { id: "invoices", label: "Invoices", description: "Issued billing history and balances." },
  { id: "payments", label: "Payments", description: "Received payment history and references." },
  { id: "vendors", label: "Vendors", description: "Preferred and event-specific partners." },
  { id: "staff", label: "Staff", description: "Venue team contacts and roles." }
];

const categoryLabels: Record<string, string> = {
  all: "All",
  crm: "CRM",
  accounting: "Accounting",
  calendar: "Calendar",
  email: "Email",
  payments: "Payments",
  marketing: "Marketing",
  automation: "Automation",
  scheduling: "Scheduling",
  documents: "Documents",
  storage: "Storage",
  communications: "Communications",
  data: "Data",
  venue: "Venue systems"
};

function implementationLabel(provider: ProviderDefinition) {
  switch (provider.implementation) {
    case "ready": return "Ready";
    case "foundation": return "Foundation";
    case "bridge": return "Bridge";
    case "migration": return "Migration";
    default: return "Planned";
  }
}

function formatObject(object: string) {
  return object.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatMode(mode: string) {
  if (mode === "two_way") return "Two-way";
  if (mode === "inbound") return "Into VenueLoom";
  if (mode === "outbound") return "From VenueLoom";
  return "Migration";
}

export function IntegrationsDashboard({ providers, workspace }: { providers: ProviderDefinition[]; workspace: WorkspaceSummary }) {
  const [tab, setTab] = useState<DashboardTab>("catalog");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedProvider, setSelectedProvider] = useState<ProviderDefinition | null>(null);

  const categories = useMemo(
    () => ["all", ...Array.from(new Set(providers.map((provider) => provider.category)))],
    [providers]
  );

  const filteredProviders = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return providers.filter((provider) => {
      const categoryMatch = category === "all" || provider.category === category;
      const queryMatch =
        !normalized ||
        provider.name.toLowerCase().includes(normalized) ||
        provider.description.toLowerCase().includes(normalized) ||
        provider.capabilities.some((capability) => capability.object.includes(normalized));
      return categoryMatch && queryMatch;
    });
  }, [providers, category, query]);

  const readyCount = providers.filter((provider) => ["ready", "foundation", "bridge", "migration"].includes(provider.implementation)).length;
  const twoWayCount = providers.filter((provider) => provider.capabilities.some((capability) => capability.modes.includes("two_way"))).length;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">V</div>
          <div>
            <strong>VenueLoom</strong>
            <span>Venue OS</span>
          </div>
        </div>

        <nav className="primary-nav" aria-label="VenueLoom">
          <a href="#overview">Overview</a>
          <a href="#calendar">Calendar</a>
          <a href="#sales">Sales & CRM</a>
          <a href="#events">Events</a>
          <a href="#finance">Finance</a>
          <a href="#team">Team</a>
          <a href="#reports">Reports</a>
          <a className="active" href="/integrations">Integrations</a>
        </nav>

        <div className="sidebar-foot">
          <div className="workspace-avatar">KE</div>
          <div>
            <strong>{workspace.organizationName}</strong>
            <span>{workspace.role} workspace</span>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="eyebrow">Settings / Integrations & Migration</div>
          <div className="top-actions">
            <button className="icon-button" aria-label="Help">?</button>
            <div className="user-avatar">{workspace.userName.split(/\s|@/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "VL"}</div>
          </div>
        </header>

        <section className="hero-panel">
          <div>
            <span className="pill pill-gold">Connected business, without the hard cutover</span>
            <h1>Bring your business with you.</h1>
            <p>
              Migrate historical data, keep the systems you still need, and let VenueLoom become the operating layer
              at your pace.
            </p>
            <div className="hero-actions">
              <button className="button primary" onClick={() => setTab("migration")}>Start a migration</button>
              <button className="button secondary" onClick={() => setTab("catalog")}>Browse integrations</button>
            </div>
          </div>
          <div className="hero-metric-grid">
            <div className="metric-card">
              <span>Integration catalog</span>
              <strong>{providers.length}</strong>
              <small>providers & migration paths</small>
            </div>
            <div className="metric-card">
              <span>Two-way candidates</span>
              <strong>{twoWayCount}</strong>
              <small>capability-gated providers</small>
            </div>
            <div className="metric-card wide">
              <span>Onboarding philosophy</span>
              <strong>No forced cutover</strong>
              <small>Migration, one-way, or two-way per object.</small>
            </div>
          </div>
        </section>

        <div className="tabbar" role="tablist">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={tab === item.id ? "tab active" : "tab"}
              onClick={() => setTab(item.id)}
              role="tab"
              aria-selected={tab === item.id}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>

        {tab === "catalog" && (
          <section className="content-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Integration catalog</span>
                <h2>Connect what your team already uses.</h2>
                <p>{readyCount} providers already have a migration, bridge, or connector foundation defined.</p>
              </div>
              <div className="search-wrap">
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search QuickBooks, calendar, payments..."
                  aria-label="Search integrations"
                />
              </div>
            </div>

            <div className="category-row">
              {categories.map((item) => (
                <button
                  key={item}
                  onClick={() => setCategory(item)}
                  className={category === item ? "chip active" : "chip"}
                >
                  {categoryLabels[item] ?? item}
                </button>
              ))}
            </div>

            <div className="provider-grid">
              {filteredProviders.map((provider) => {
                const hasTwoWay = provider.capabilities.some((capability) => capability.modes.includes("two_way"));
                return (
                  <article className="provider-card" key={provider.id}>
                    <div className="provider-card-top">
                      <div className="provider-logo">{provider.shortName}</div>
                      <div className="provider-status-wrap">
                        <span className={`status status-${provider.implementation}`}>
                          {implementationLabel(provider)}
                        </span>
                        {hasTwoWay && <span className="status status-two-way">2-way</span>}
                      </div>
                    </div>
                    <h3>{provider.name}</h3>
                    <p>{provider.description}</p>
                    <div className="capability-list">
                      {provider.capabilities.slice(0, 4).map((capability) => (
                        <span key={`${provider.id}-${capability.object}`}>
                          {formatObject(capability.object)}
                        </span>
                      ))}
                      {provider.capabilities.length > 4 && <span>+{provider.capabilities.length - 4}</span>}
                    </div>
                    <div className="provider-card-foot">
                      <small>Wave {provider.launchWave} · {provider.connectionMethod.replaceAll("_", " ")}</small>
                      <button className="text-button" onClick={() => setSelectedProvider(provider)}>
                        {provider.id === "generic-file" ? "Import" : provider.implementation === "planned" ? "View plan" : "Connect"} →
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {tab === "migration" && <MigrationWizard workspace={workspace} />}

        {tab === "sync" && <SyncCenter providers={providers} />}

        {tab === "conflicts" && <ConflictCenter />}

        {selectedProvider && (
          <div className="drawer-backdrop" role="presentation" onClick={() => setSelectedProvider(null)}>
            <aside className="provider-drawer" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
              <div className="drawer-head">
                <div className="provider-logo large">{selectedProvider.shortName}</div>
                <button className="icon-button" onClick={() => setSelectedProvider(null)} aria-label="Close">×</button>
              </div>
              <span className="eyebrow">{categoryLabels[selectedProvider.category]}</span>
              <h2>{selectedProvider.name}</h2>
              <p>{selectedProvider.description}</p>

              <div className="detail-block">
                <span>Connection path</span>
                <strong>{selectedProvider.connectionMethod.replaceAll("_", " ")}</strong>
              </div>
              <div className="detail-block">
                <span>Implementation</span>
                <strong>{implementationLabel(selectedProvider)}</strong>
              </div>

              <h3>Supported direction by object</h3>
              <div className="direction-table">
                {selectedProvider.capabilities.map((capability) => (
                  <div key={capability.object}>
                    <strong>{formatObject(capability.object)}</strong>
                    <span>{capability.modes.map(formatMode).join(" · ")}</span>
                  </div>
                ))}
              </div>

              {selectedProvider.notes && <div className="notice amber">{selectedProvider.notes}</div>}

              {selectedProvider.id === "generic-file" ? (
                <button className="button primary full" onClick={() => { setSelectedProvider(null); setTab("migration"); }}>
                  Start file migration
                </button>
              ) : selectedProvider.id === "google-calendar" ? (
                <a className="button primary full button-link" href="/api/integrations/calendar/connect/google">
                  Connect Google Calendar
                </a>
              ) : selectedProvider.id === "outlook-calendar" ? (
                <a className="button primary full button-link" href="/api/integrations/calendar/connect/microsoft">
                  Connect Outlook Calendar
                </a>
              ) : selectedProvider.id === "airbnb" || selectedProvider.id === "vrbo" ? (
                <a className="button primary full button-link" href={`/integrations/rentals?provider=${selectedProvider.id}`}>
                  Connect {selectedProvider.name} house calendar
                </a>
              ) : (
                <>
                  <button className="button secondary full" disabled>
                    Connect {selectedProvider.name} — adapter activation pending
                  </button>
                  <div className="notice">
                    This provider remains capability-defined but is not yet credential-enabled. VenueLoom will not request
                    credentials until its adapter has passed the provider-specific release gates.
                  </div>
                </>
              )}
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}

function MigrationWizard({ workspace }: { workspace: WorkspaceSummary }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [entity, setEntity] = useState<ImportEntity>("clients");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<PreviewResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [selectedSheet, setSelectedSheet] = useState("");
  const [busy, setBusy] = useState(false);
  const [venueId, setVenueId] = useState(workspace.venues[0]?.id ?? "");
  const [commitResult, setCommitResult] = useState<{ importRunId: string; replayed: boolean; totals: { discovered: number; create: number; skip: number; error: number } } | null>(null);

  async function preview(nextMapping?: Record<string, string | null>, sheetOverride?: string) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity", entity);
      const sheet = sheetOverride ?? selectedSheet;
      if (sheet) form.append("sheet", sheet);
      if (nextMapping) form.append("mapping", JSON.stringify(nextMapping));
      const response = await fetch("/api/import/preview", { method: "POST", body: form });
      const json = (await response.json()) as PreviewResponse;
      setResult(json);
      if (json.mapping) setMapping(json.mapping);
      if (json.selectedSheet) setSelectedSheet(json.selectedSheet);
    } finally {
      setBusy(false);
    }
  }

  function chooseFile(nextFile: File | null) {
    setFile(nextFile);
    setResult(null);
    setMapping({});
    setSelectedSheet("");
    setCommitResult(null);
  }

  async function commitMigration() {
    if (!file || !result?.preview) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("entity", entity);
      if (selectedSheet) form.append("sheet", selectedSheet);
      form.append("mapping", JSON.stringify(mapping));
      if (venueId) form.append("venueId", venueId);
      const response = await fetch("/api/import/commit", { method: "POST", body: form });
      const json = await response.json();
      if (!response.ok) {
        setResult((current) => ({ ...(current ?? {}), error: json.error ?? "Migration commit failed." }));
        return;
      }
      setCommitResult(json);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Migration studio</span>
          <h2>Preview everything before VenueLoom writes anything.</h2>
          <p>Upload CSV or XLSX. VenueLoom maps common columns automatically and flags uncertain rows for review.</p>
        </div>
        <span className="secure-badge">Private · dry-run first</span>
      </div>

      <div className="wizard-grid">
        <div className="wizard-main">
          <div className="step-card">
            <div className="step-number">1</div>
            <div className="step-body">
              <h3>What are you importing?</h3>
              <div className="entity-grid">
                {importEntities.map((item) => (
                  <button
                    key={item.id}
                    className={entity === item.id ? "entity-card active" : "entity-card"}
                    onClick={() => { setEntity(item.id); setResult(null); setMapping({}); }}
                  >
                    <strong>{item.label}</strong>
                    <span>{item.description}</span>
                  </button>
                ))}
              </div>
              {(entity === "inquiries" || entity === "events") && (
                <label className="venue-import-select">
                  <span>Import into venue</span>
                  <select value={venueId} onChange={(event) => setVenueId(event.target.value)} required>
                    {workspace.venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.timezone}</option>)}
                  </select>
                </label>
              )}
            </div>
          </div>

          <div className="step-card">
            <div className="step-number">2</div>
            <div className="step-body">
              <div className="upload-heading">
                <h3>Choose your export file</h3>
                <a className="text-button template-link" href={`/api/import/template?entity=${entity}`}>
                  Download {importEntities.find((item) => item.id === entity)?.label} template
                </a>
              </div>
              <button className="drop-zone" onClick={() => fileInput.current?.click()}>
                <span className="upload-icon">↑</span>
                <strong>{file ? file.name : "Choose CSV / XLSX"}</strong>
                <small>{file ? `${(file.size / 1024).toFixed(1)} KB selected` : "Up to 10 MB and 25,000 rows per sheet"}</small>
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx"
                hidden
                onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              />
              {file && (
                <button className="button primary" disabled={busy} onClick={() => void preview()}>
                  {busy ? "Analyzing…" : "Analyze & auto-map"}
                </button>
              )}
            </div>
          </div>

          {result?.sheets && result.sheets.length > 1 && (
            <div className="step-card">
              <div className="step-number">3</div>
              <div className="step-body">
                <h3>Select worksheet</h3>
                <div className="sheet-row">
                  {result.sheets.map((sheet) => (
                    <button
                      key={sheet.sheetName}
                      className={selectedSheet === sheet.sheetName ? "chip active" : "chip"}
                      onClick={() => {
                        setSelectedSheet(sheet.sheetName);
                        void preview(undefined, sheet.sheetName);
                      }}
                    >
                      {sheet.sheetName} · {sheet.rowCount}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {result?.mapping && result.sheets && (
            <div className="step-card">
              <div className="step-number">{result.sheets.length > 1 ? "4" : "3"}</div>
              <div className="step-body">
                {result.providerProfile && (
                  <div className="notice provider-detected">
                    <strong>{result.providerProfile.name} export detected.</strong> VenueLoom added provider-specific normalized fields before auto-mapping.
                  </div>
                )}
                <div className="mapping-head">
                  <div>
                    <h3>Confirm field mapping</h3>
                    <p>VenueLoom guessed the best match. Change any mapping before running the dry run.</p>
                  </div>
                  <span className={result.coverage?.canPreview ? "secure-badge" : "warning-badge"}>
                    {result.coverage?.mappedFields}/{result.coverage?.totalFields} mapped
                  </span>
                </div>
                <div className="mapping-table">
                  {importSchemas[entity].map((field) => {
                    const sheet = result.sheets?.find((item) => item.sheetName === selectedSheet) ?? result.sheets?.[0];
                    return (
                      <label key={field.key}>
                        <span>
                          <strong>{field.label}</strong>
                          {field.required && <small>Required</small>}
                        </span>
                        <select
                          value={mapping[field.key] ?? ""}
                          onChange={(event) => setMapping((current) => ({
                            ...current,
                            [field.key]: event.target.value || null
                          }))}
                        >
                          <option value="">Do not import</option>
                          {sheet?.headers.map((header) => <option key={header} value={header}>{header}</option>)}
                        </select>
                      </label>
                    );
                  })}
                </div>
                <button className="button primary" disabled={busy} onClick={() => void preview(mapping)}>
                  {busy ? "Running dry run…" : "Run dry run"}
                </button>
              </div>
            </div>
          )}

          {result?.preview && (
            <div className="step-card">
              <div className="step-number">{result.sheets && result.sheets.length > 1 ? "5" : "4"}</div>
              <div className="step-body">
                <h3>Dry-run results</h3>
                <div className="summary-grid">
                  <Summary label="Discovered" value={result.preview.totals.discovered} />
                  <Summary label="Ready to create" value={result.preview.totals.create} tone="good" />
                  <Summary label="Duplicates skipped" value={result.preview.totals.skip} tone="neutral" />
                  <Summary label="Needs attention" value={result.preview.totals.error} tone="bad" />
                </div>

                <div className="preview-table-wrap">
                  <table className="preview-table">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Outcome</th>
                        <th>Primary data</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.preview.rows.slice(0, 50).map((row) => (
                        <tr key={row.rowNumber}>
                          <td>{row.rowNumber}</td>
                          <td><span className={`row-outcome ${row.outcome}`}>{row.outcome}</span></td>
                          <td>
                            {Object.entries(row.normalized)
                              .filter(([, value]) => value !== null && value !== "")
                              .slice(0, 3)
                              .map(([key, value]) => <span className="data-token" key={key}>{formatObject(key)}: {String(value)}</span>)}
                          </td>
                          <td>{row.issues.length ? row.issues.map((issue) => issue.message).join(" · ") : "Ready"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {result.preview.rows.length > 50 && (
                  <p className="table-note">Showing the first 50 rows of {result.preview.rows.length}.</p>
                )}

                <div className="notice">
                  This commit is scoped to <strong>{workspace.organizationName}</strong>{(entity === "inquiries" || entity === "events") && venueId ? ` and ${workspace.venues.find((venue) => venue.id === venueId)?.name ?? "the selected venue"}` : ""}. Existing stable matches are skipped instead of duplicated.
                </div>
                <button className="button primary" disabled={busy || ((entity === "inquiries" || entity === "events") && !venueId)} onClick={() => void commitMigration()}>
                  {busy ? "Committing…" : "Commit migration"}
                </button>
                {commitResult && (
                  <div className="notice">
                    <strong>{commitResult.replayed ? "Already committed" : "Migration committed"}</strong><br />
                    Run {commitResult.importRunId} · {commitResult.totals.create} created · {commitResult.totals.skip} skipped · {commitResult.totals.error} errors.
                  </div>
                )}
              </div>
            </div>
          )}

          {result?.error && <div className="notice error">{result.error}</div>}
        </div>

        <aside className="wizard-aside">
          <div className="aside-card">
            <span className="eyebrow">Safe migration</span>
            <h3>Nothing is written during preview.</h3>
            <ul>
              <li>Headers are auto-matched, then confirmed by you.</li>
              <li>Amounts become integer cents to preserve financial precision.</li>
              <li>Likely duplicates are skipped, not silently merged.</li>
              <li>Invalid dates, emails and numbers are surfaced row-by-row.</li>
              <li>Bookings will still pass VenueLoom conflict checks when commit is enabled.</li>
            </ul>
          </div>
          <div className="aside-card soft">
            <span className="eyebrow">Built for messy exports</span>
            <p>Provider-specific templates can sit on top of this same engine without creating a second importer.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Summary({ label, value, tone = "plain" }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`summary-card ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SyncCenter({ providers }: { providers: ProviderDefinition[] }) {
  const examples = [
    { provider: "QuickBooks Online", object: "Invoices", direction: "VenueLoom → QBO", status: "Ready for adapter", count: "—" },
    { provider: "Google Calendar", object: "Events", direction: "↔ Two-way", status: "Ready for OAuth", count: "—" },
    { provider: "Dubsado", object: "Leads", direction: "Dubsado → VenueLoom", status: "Bridge planned", count: "—" },
    { provider: "CSV / XLSX", object: "All import types", direction: "File → VenueLoom", status: "Preview engine ready", count: "7 types" }
  ];

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Sync Center</span>
          <h2>One place to see every data movement.</h2>
          <p>Live run history appears here once a provider is authorized. Current rows show the connector foundation state.</p>
        </div>
        <span className="secure-badge">{providers.length} catalog providers</span>
      </div>

      <div className="sync-overview">
        <div className="sync-health-card">
          <span>Connection health</span>
          <strong>Not configured</strong>
          <small>No production credentials are stored.</small>
        </div>
        <div className="sync-health-card">
          <span>Failed records</span>
          <strong>0</strong>
          <small>Dead-letter queues begin with live adapters.</small>
        </div>
        <div className="sync-health-card">
          <span>Open conflicts</span>
          <strong>0</strong>
          <small>Protected-field conflicts require review.</small>
        </div>
      </div>

      <div className="sync-table">
        <div className="sync-table-head">
          <span>Provider</span><span>Object</span><span>Direction</span><span>State</span><span>Records</span>
        </div>
        {examples.map((row) => (
          <div className="sync-table-row" key={row.provider + row.object}>
            <strong>{row.provider}</strong>
            <span>{row.object}</span>
            <span>{row.direction}</span>
            <span className="sync-state">{row.status}</span>
            <span>{row.count}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ConflictCenter() {
  type Conflict = {
    id: string;
    providerCode: string;
    connectionName: string;
    fields: string[];
    local: Record<string, unknown>;
    external: Record<string, unknown>;
    createdAt: string;
  };

  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const response = await fetch("/api/integrations/conflicts", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Conflicts could not be loaded.");
      setConflicts(json.conflicts ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conflicts could not be loaded.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function resolve(id: string, resolution: "venueloom" | "external") {
    setResolving(id);
    setError("");
    try {
      const response = await fetch(`/api/integrations/conflicts/${id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolution })
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Conflict resolution failed.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conflict resolution failed.");
    } finally {
      setResolving("");
    }
  }

  return (
    <section className="content-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Conflict resolution</span>
          <h2>Protected changes never disappear into “last write wins.”</h2>
          <p>VenueLoom queues competing edits to mapped calendar events so event times and availability require an explicit choice.</p>
        </div>
        <span className="secure-badge">{loading ? "Checking…" : `${conflicts.length} open`}</span>
      </div>

      {error && <div className="notice error">{error}</div>}

      {!loading && conflicts.length === 0 ? (
        <div className="empty-state compact">
          <div className="empty-orbit">✓</div>
          <h3>No live conflicts.</h3>
          <p>Google and Outlook changes that disagree with a VenueLoom-origin booking will appear here automatically.</p>
        </div>
      ) : (
        <div className="conflict-list">
          {conflicts.map((conflict) => (
            <article className="conflict-demo" key={conflict.id}>
              <div className="conflict-demo-head">
                <div>
                  <span className="eyebrow">{conflict.connectionName}</span>
                  <h3>Calendar event changed outside VenueLoom</h3>
                  <p>Changed fields: {conflict.fields.map(formatObject).join(", ") || "calendar data"}</p>
                </div>
                <span className="warning-badge">{conflict.providerCode === "google-calendar" ? "Google" : "Outlook"}</span>
              </div>
              <div className="comparison-grid two">
                <div className="comparison-card selected">
                  <span>VenueLoom</span>
                  <strong>{String(conflict.local.summary ?? "VenueLoom booking")}</strong>
                  <small>{String(conflict.local.startsAt ?? "")} → {String(conflict.local.endsAt ?? "")}</small>
                </div>
                <div className="comparison-card">
                  <span>External calendar</span>
                  <strong>{String(conflict.external.summary ?? "External event")}</strong>
                  <small>{String(conflict.external.startsAt ?? "")} → {String(conflict.external.endsAt ?? "")}</small>
                </div>
              </div>
              <div className="conflict-actions">
                <button className="button primary" disabled={resolving === conflict.id} onClick={() => void resolve(conflict.id, "venueloom")}>
                  Keep VenueLoom
                </button>
                <button className="button secondary" disabled={resolving === conflict.id} onClick={() => void resolve(conflict.id, "external")}>
                  Use external change
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
