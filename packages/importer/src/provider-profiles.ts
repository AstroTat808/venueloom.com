import type { CellValue, ImportEntity, ParsedSheet } from "./types";

export type ProviderProfileId = "honeybook" | "dubsado";

export interface ProviderProfile {
  id: ProviderProfileId;
  name: string;
  detect: string[][];
}

const profiles: ProviderProfile[] = [
  {
    id: "dubsado",
    name: "Dubsado",
    detect: [
      ["project title", "lead or job"],
      ["project status", "client first name"],
      ["primary invoice paid", "client email"]
    ]
  },
  {
    id: "honeybook",
    name: "HoneyBook",
    detect: [
      ["contact name", "email", "notes"],
      ["full name", "email", "phone", "created"],
      ["name", "email", "phone number", "notes"]
    ]
  }
];

function h(value: string) {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function pick(row: Record<string, CellValue>, aliases: string[]) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const found = entries.find(([key]) => h(key) === h(alias));
    if (found) return found[1];
  }
  return null;
}

function combine(...values: Array<CellValue | undefined>) {
  const joined = values.filter((value) => value !== null && value !== undefined && String(value).trim()).map(String).join(" ").trim();
  return joined || null;
}

export function detectProviderProfile(headers: string[]): ProviderProfile | null {
  const normalized = new Set(headers.map(h));
  let winner: { profile: ProviderProfile; score: number } | null = null;

  for (const profile of profiles) {
    let score = 0;
    for (const group of profile.detect) {
      const matches = group.filter((needle) => normalized.has(h(needle))).length;
      if (matches === group.length) score += matches * 3;
      else score += matches;
    }
    if (!winner || score > winner.score) winner = { profile, score };
  }

  return winner && winner.score >= 4 ? winner.profile : null;
}

function dubsadoSynthetic(entity: ImportEntity, row: Record<string, CellValue>) {
  const first = pick(row, ["Client first name"]);
  const last = pick(row, ["Client last name"]);
  const altFirst = pick(row, ["Alt contact first name"]);
  const altLast = pick(row, ["Alt contact last name"]);
  const projectTitle = pick(row, ["Project title"]);
  const leadOrJob = pick(row, ["Lead Or Job"]);
  const projectStatus = pick(row, ["Project status"]);
  const clientName = combine(first, last) ?? combine(altFirst, altLast) ?? pick(row, ["Company name"]);

  const base: Record<string, CellValue> = {
    "VenueLoom Name": clientName,
    "VenueLoom Email": pick(row, ["Client email", "Company email", "Alt contact email"]),
    "VenueLoom Phone": pick(row, ["Client phone", "Company phone", "Alt contact phone"]),
    "VenueLoom Company": pick(row, ["Company name"]),
    "VenueLoom Event Name": projectTitle,
    "VenueLoom Event Type": leadOrJob,
    "VenueLoom Status": projectStatus ?? leadOrJob,
    "VenueLoom Source": pick(row, ["Source"]),
    "VenueLoom Start": pick(row, ["Start date"]),
    "VenueLoom End": pick(row, ["End date"]),
    "VenueLoom Amount": pick(row, ["Primary invoice paid", "All invoices paid"])
  };

  if (entity === "clients") {
    base["VenueLoom Name"] = clientName;
  }
  return base;
}

function honeybookSynthetic(row: Record<string, CellValue>) {
  const fullName =
    pick(row, ["Contact name", "Full name", "Name", "Client name"]) ??
    combine(pick(row, ["First name"]), pick(row, ["Last name"]));
  return {
    "VenueLoom Name": fullName,
    "VenueLoom Email": pick(row, ["Email", "Email address", "Contact email"]),
    "VenueLoom Phone": pick(row, ["Phone", "Phone number", "Mobile"]),
    "VenueLoom Notes": pick(row, ["Notes", "Note"]),
    "VenueLoom Company": pick(row, ["Company", "Company name", "Business"])
  } satisfies Record<string, CellValue>;
}

export function applyProviderProfile(
  profileId: ProviderProfileId | null,
  entity: ImportEntity,
  sheet: ParsedSheet
): ParsedSheet {
  if (!profileId) return sheet;

  const rows = sheet.rows.map((row) => ({
    ...row,
    ...(profileId === "dubsado" ? dubsadoSynthetic(entity, row) : honeybookSynthetic(row))
  }));
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return { ...sheet, rows, headers };
}

export function profileAliases(entity: ImportEntity, profileId: ProviderProfileId | null) {
  if (!profileId) return {} as Record<string, string[]>;

  const common: Record<string, string[]> = {
    name: ["VenueLoom Name"],
    email: ["VenueLoom Email"],
    phone: ["VenueLoom Phone"],
    company: ["VenueLoom Company"],
    notes: ["VenueLoom Notes"]
  };

  if (profileId === "dubsado") {
    return {
      ...common,
      event_name: ["VenueLoom Event Name"],
      event_type: ["VenueLoom Event Type"],
      status: ["VenueLoom Status"],
      source: ["VenueLoom Source"],
      proposed_date: ["VenueLoom Start"],
      starts_at: ["VenueLoom Start"],
      ends_at: ["VenueLoom End"],
      estimated_amount: ["VenueLoom Amount"],
      booking_amount: ["VenueLoom Amount"],
      client_name: ["VenueLoom Name"],
      client_email: ["VenueLoom Email"]
    };
  }

  return common;
}

export function providerProfileName(id: ProviderProfileId | null) {
  return profiles.find((profile) => profile.id === id)?.name ?? null;
}
