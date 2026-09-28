import type { ImportEntity } from "./types";

export type ImportProviderProfileId = "generic" | "honeybook" | "dubsado";

export interface ImportProviderProfile {
  id: ImportProviderProfileId;
  name: string;
  headerSignals: string[];
  entityAliases: Partial<Record<ImportEntity, Record<string, string[]>>>;
  preserveUnmappedFields?: boolean;
}

export const importProviderProfiles: ImportProviderProfile[] = [
  {
    id: "dubsado",
    name: "Dubsado",
    headerSignals: [
      "lead or job",
      "project status",
      "project title",
      "client first name",
      "client last name",
      "primary invoice paid",
      "all invoices paid",
      "contract status"
    ],
    preserveUnmappedFields: true,
    entityAliases: {
      clients: {
        name: ["client name","client first name","client last name"],
        email: ["client email"],
        phone: ["client phone"],
        company: ["company name"]
      },
      inquiries: {
        name: ["client name","client first name","client last name"],
        email: ["client email"],
        phone: ["client phone"],
        company: ["company name"],
        event_name: ["project title"],
        event_type: ["lead or job"],
        proposed_date: ["start date","project date"],
        status: ["project status"],
        source: ["source"]
      },
      events: {
        name: ["client name","client first name","client last name"],
        email: ["client email"],
        phone: ["client phone"],
        company: ["company name"],
        event_name: ["project title"],
        event_type: ["lead or job"],
        starts_at: ["start date"],
        ends_at: ["end date"],
        status: ["project status"]
      },
      invoices: {
        client_name: ["client name","client first name","client last name"],
        client_email: ["client email"],
        total_amount: ["primary invoice paid","all invoices paid"]
      },
      payments: {
        client_name: ["client name","client first name","client last name"],
        amount: ["primary invoice paid","all invoices paid"]
      }
    }
  },
  {
    id: "honeybook",
    name: "HoneyBook",
    headerSignals: [
      "contact name",
      "contact email",
      "contact phone",
      "date created",
      "project name",
      "project type",
      "pipeline stage",
      "lead source"
    ],
    preserveUnmappedFields: true,
    entityAliases: {
      clients: {
        name: ["contact name","client name","full name"],
        email: ["contact email","email"],
        phone: ["contact phone","phone"],
        notes: ["notes"],
        company: ["company","company name"]
      },
      inquiries: {
        name: ["contact name","client name","full name"],
        email: ["contact email","email"],
        phone: ["contact phone","phone"],
        company: ["company","company name"],
        event_name: ["project name"],
        event_type: ["project type"],
        proposed_date: ["project date","event date"],
        status: ["pipeline stage","stage"],
        source: ["lead source"]
      },
      events: {
        name: ["contact name","client name","full name"],
        email: ["contact email","email"],
        phone: ["contact phone","phone"],
        event_name: ["project name"],
        event_type: ["project type"],
        starts_at: ["project date","event date","start date"],
        ends_at: ["end date"],
        status: ["pipeline stage","stage"]
      },
      invoices: {
        client_name: ["contact name","client name"],
        client_email: ["contact email","email"],
        invoice_number: ["invoice number","invoice #"],
        total_amount: ["invoice total","total amount","amount"],
        issued_date: ["invoice date"],
        due_date: ["due date"],
        status: ["payment status","invoice status"]
      },
      payments: {
        client_name: ["contact name","client name"],
        reference: ["transaction id","payment id"],
        received_date: ["payment date","date"],
        amount: ["payment amount","amount"],
        method: ["payment method","method"]
      }
    }
  }
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

export function detectImportProvider(headers: string[]): ImportProviderProfile | null {
  const normalizedHeaders = new Set(headers.map(normalize));
  let best: { profile: ImportProviderProfile; score: number } | null = null;
  for (const profile of importProviderProfiles) {
    const score = profile.headerSignals.reduce((sum, signal) => sum + (normalizedHeaders.has(normalize(signal)) ? 1 : 0), 0);
    if (score >= 2 && (!best || score > best.score)) best = { profile, score };
  }
  return best?.profile ?? null;
}
