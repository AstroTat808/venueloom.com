import type { ProviderDefinition } from "./types";

const v = "2026-09-27";

export const providerCatalog: ProviderDefinition[] = [
  {
    id: "generic-file",
    name: "CSV / XLSX Import",
    shortName: "FILE",
    category: "data",
    description: "Universal migration fallback for contacts, inquiries, events, invoices, payments, vendors and staff.",
    implementation: "ready",
    connectionMethod: "file",
    launchWave: 0,
    capabilities: [
      { object: "clients", modes: ["migration"] },
      { object: "inquiries", modes: ["migration"] },
      { object: "events", modes: ["migration"] },
      { object: "invoices", modes: ["migration"] },
      { object: "payments", modes: ["migration"] },
      { object: "vendors", modes: ["migration"] },
      { object: "staff", modes: ["migration"] }
    ]
  },
  {
    id: "airbnb",
    name: "Airbnb",
    shortName: "AB",
    category: "lodging",
    description: "House reservation availability sync using Airbnb host iCal export/import links.",
    implementation: "ready",
    connectionMethod: "file",
    launchWave: 1,
    capabilities: [
      { object: "lodging_reservations", modes: ["inbound", "outbound", "two_way"] },
      { object: "calendar", modes: ["inbound", "outbound", "two_way"] }
    ],
    docsUrl: "https://www.airbnb.com/help/article/99",
    verifiedAt: "2026-09-27",
    notes: "Host-level coexistence uses iCal. Airbnb refreshes imported calendars on its own schedule, so availability sync is eventual rather than instant."
  },
  {
    id: "vrbo",
    name: "Vrbo",
    shortName: "VR",
    category: "lodging",
    description: "House reservation availability sync using Vrbo reservation-calendar iCal feeds.",
    implementation: "ready",
    connectionMethod: "file",
    launchWave: 1,
    capabilities: [
      { object: "lodging_reservations", modes: ["inbound", "outbound", "two_way"] },
      { object: "calendar", modes: ["inbound", "outbound", "two_way"] }
    ],
    docsUrl: "https://help.vrbo.com/articles/How-do-I-import-my-iCal-or-Google-calendar",
    verifiedAt: "2026-09-27",
    notes: "Vrbo supports iCal import/export and currently states calendars sync every 30 minutes."
  },
  {
    id: "honeybook",
    name: "HoneyBook",
    shortName: "HB",
    category: "crm",
    description: "Migrate existing business data and coexist through supported automation triggers/actions.",
    implementation: "bridge",
    connectionMethod: "webhook_bridge",
    launchWave: 1,
    capabilities: [
      { object: "contacts", modes: ["migration", "inbound", "outbound"] },
      { object: "inquiries", modes: ["migration", "inbound", "outbound"] },
      { object: "events", modes: ["migration", "inbound"] }
    ],
    docsUrl: "https://help.honeybook.com/en/articles/2209205-automate-tasks-with-zapier",
    verifiedAt: v,
    notes: "Automation capabilities are narrower than a general-purpose public CRM API; custom HoneyBook fields are not currently exposed through its Zapier integration."
  },
  {
    id: "dubsado",
    name: "Dubsado",
    shortName: "DB",
    category: "crm",
    description: "CSV migration plus automation-driven coexistence for leads, projects, payments and status changes.",
    implementation: "bridge",
    connectionMethod: "webhook_bridge",
    launchWave: 1,
    capabilities: [
      { object: "contacts", modes: ["migration", "inbound"] },
      { object: "inquiries", modes: ["migration", "inbound", "outbound"] },
      { object: "events", modes: ["migration", "inbound"] },
      { object: "payments", modes: ["migration", "inbound"] },
      { object: "contracts", modes: ["inbound"] }
    ],
    docsUrl: "https://help.dubsado.com/en/articles/15920601-dubsado-triggers-and-actions-in-zapier",
    verifiedAt: v,
    notes: "Outbound actions are capability-limited; VenueLoom never labels the whole connection two-way."
  },
  {
    id: "quicken",
    name: "Quicken",
    shortName: "QN",
    category: "accounting",
    description: "Controlled file migration for financial history without password-based scraping.",
    implementation: "migration",
    connectionMethod: "file",
    launchWave: 3,
    capabilities: [
      { object: "invoices", modes: ["migration"] },
      { object: "payments", modes: ["migration"] }
    ],
    docsUrl: "https://www.quicken.com/support/what-quicken-data-access-guarantee/",
    verifiedAt: v
  },
  {
    id: "quickbooks-online",
    name: "QuickBooks Online",
    shortName: "QBO",
    category: "accounting",
    description: "OAuth accounting connector for customers, estimates, invoices and payments with reconciliation.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "clients", modes: ["inbound", "outbound", "two_way"] },
      { object: "estimates", modes: ["outbound"] },
      { object: "invoices", modes: ["inbound", "outbound", "two_way"] },
      { object: "payments", modes: ["inbound", "outbound", "two_way"] }
    ],
    docsUrl: "https://developer.intuit.com/app/developer/qbo/docs/develop/webhooks/configure-webhooks",
    verifiedAt: v
  },
  {
    id: "xero",
    name: "Xero",
    shortName: "XR",
    category: "accounting",
    description: "Accounting synchronization for contacts, invoices and payments.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "clients", modes: ["inbound", "outbound", "two_way"] },
      { object: "invoices", modes: ["inbound", "outbound", "two_way"] },
      { object: "payments", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://developer.xero.com/documentation/"
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    shortName: "GC",
    category: "calendar",
    description: "Calendar availability and event synchronization using Google Calendar API notifications.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 1,
    capabilities: [
      { object: "calendar", modes: ["inbound", "outbound", "two_way"] },
      { object: "events", modes: ["inbound", "outbound", "two_way"] }
    ],
    docsUrl: "https://developers.google.com/workspace/calendar/api/guides/push",
    verifiedAt: v
  },
  {
    id: "outlook-calendar",
    name: "Microsoft Outlook Calendar",
    shortName: "OC",
    category: "calendar",
    description: "Microsoft Graph calendar sync for events and scheduling availability.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 1,
    capabilities: [
      { object: "calendar", modes: ["inbound", "outbound", "two_way"] },
      { object: "events", modes: ["inbound", "outbound", "two_way"] }
    ],
    docsUrl: "https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview",
    verifiedAt: v
  },
  {
    id: "gmail",
    name: "Gmail",
    shortName: "GM",
    category: "email",
    description: "Email activity, lead capture and communication linkage using authorized Gmail access.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "email", modes: ["inbound", "outbound", "two_way"] },
      { object: "contacts", modes: ["inbound"] }
    ],
    docsUrl: "https://developers.google.com/gmail/api/guides/push"
  },
  {
    id: "outlook-mail",
    name: "Microsoft Outlook Mail",
    shortName: "OM",
    category: "email",
    description: "Microsoft 365 email linkage and change notifications through Microsoft Graph.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "email", modes: ["inbound", "outbound", "two_way"] },
      { object: "contacts", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview",
    verifiedAt: v
  },
  {
    id: "stripe",
    name: "Stripe",
    shortName: "ST",
    category: "payments",
    description: "Payment and refund event reconciliation for VenueLoom-managed financial workflows.",
    implementation: "foundation",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "payments", modes: ["inbound", "outbound", "two_way"] },
      { object: "invoices", modes: ["inbound", "outbound"] },
      { object: "clients", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://docs.stripe.com/webhooks"
  },
  {
    id: "square",
    name: "Square",
    shortName: "SQ",
    category: "payments",
    description: "Customer, payment, refund and booking event synchronization through Square APIs.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "clients", modes: ["inbound", "outbound"] },
      { object: "payments", modes: ["inbound", "outbound", "two_way"] },
      { object: "appointments", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://developer.squareup.com/docs/webhooks/overview",
    verifiedAt: v
  },
  {
    id: "paypal",
    name: "PayPal",
    shortName: "PP",
    category: "payments",
    description: "Payment/refund status synchronization and reconciliation using PayPal REST APIs.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [{ object: "payments", modes: ["inbound", "outbound"] }],
    docsUrl: "https://developer.paypal.com/api/rest/webhooks",
    verifiedAt: v
  },
  {
    id: "mailchimp",
    name: "Mailchimp",
    shortName: "MC",
    category: "marketing",
    description: "Audience/contact synchronization, segmentation events and campaign activity.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound", "two_way"] },
      { object: "audiences", modes: ["inbound", "outbound", "two_way"] },
      { object: "campaigns", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://mailchimp.com/developer/marketing/",
    verifiedAt: v
  },
  {
    id: "constant-contact",
    name: "Constant Contact",
    shortName: "CC",
    category: "marketing",
    description: "Contact list and campaign integration for venue marketing workflows.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound"] },
      { object: "campaigns", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://developer.constantcontact.com/"
  },
  {
    id: "zapier",
    name: "Zapier",
    shortName: "ZP",
    category: "automation",
    description: "Universal trigger/action bridge for providers without sufficient direct APIs.",
    implementation: "foundation",
    connectionMethod: "webhook_bridge",
    launchWave: 1,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound", "two_way"] },
      { object: "inquiries", modes: ["inbound", "outbound", "two_way"] },
      { object: "events", modes: ["inbound", "outbound", "two_way"] },
      { object: "notifications", modes: ["outbound"] }
    ],
    docsUrl: "https://docs.zapier.com/platform"
  },
  {
    id: "make",
    name: "Make",
    shortName: "MK",
    category: "automation",
    description: "Webhook/API automation bridge for custom workflows and long-tail applications.",
    implementation: "foundation",
    connectionMethod: "webhook_bridge",
    launchWave: 1,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound", "two_way"] },
      { object: "inquiries", modes: ["inbound", "outbound", "two_way"] },
      { object: "events", modes: ["inbound", "outbound", "two_way"] },
      { object: "notifications", modes: ["outbound"] }
    ],
    docsUrl: "https://developers.make.com/"
  },
  {
    id: "calendly",
    name: "Calendly",
    shortName: "CL",
    category: "scheduling",
    description: "Scheduling event and invitee synchronization using API and signed webhooks.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "appointments", modes: ["inbound", "outbound"] },
      { object: "contacts", modes: ["inbound"] }
    ],
    docsUrl: "https://developer.calendly.com/docs/getting-started/introduction",
    verifiedAt: v
  },
  {
    id: "acuity",
    name: "Acuity Scheduling",
    shortName: "AS",
    category: "scheduling",
    description: "Appointment and client synchronization for tours and planning meetings.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "appointments", modes: ["inbound", "outbound"] },
      { object: "contacts", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://developers.acuityscheduling.com/"
  },
  {
    id: "docusign",
    name: "DocuSign",
    shortName: "DS",
    category: "documents",
    description: "Envelope delivery, signer status and executed-document evidence.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [
      { object: "contracts", modes: ["inbound", "outbound", "two_way"] },
      { object: "files", modes: ["inbound", "outbound"] }
    ],
    docsUrl: "https://developers.docusign.com/"
  },
  {
    id: "google-drive",
    name: "Google Drive",
    shortName: "GD",
    category: "storage",
    description: "Authorized file import/export and document linkage.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [{ object: "files", modes: ["inbound", "outbound", "two_way"] }],
    docsUrl: "https://developers.google.com/drive/api/guides/about-sdk"
  },
  {
    id: "dropbox",
    name: "Dropbox",
    shortName: "DX",
    category: "storage",
    description: "File synchronization for event assets and business documents.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [{ object: "files", modes: ["inbound", "outbound", "two_way"] }],
    docsUrl: "https://developers.dropbox.com/"
  },
  {
    id: "onedrive",
    name: "OneDrive / SharePoint",
    shortName: "OD",
    category: "storage",
    description: "Microsoft Graph file integration for venue documents and shared assets.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 2,
    capabilities: [{ object: "files", modes: ["inbound", "outbound", "two_way"] }],
    docsUrl: "https://learn.microsoft.com/en-us/graph/onedrive-concept-overview"
  },
  {
    id: "box",
    name: "Box",
    shortName: "BX",
    category: "storage",
    description: "Enterprise document and file synchronization.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [{ object: "files", modes: ["inbound", "outbound"] }]
  },
  {
    id: "hubspot",
    name: "HubSpot",
    shortName: "HS",
    category: "crm",
    description: "CRM contact, deal and activity synchronization for larger venue sales teams.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound", "two_way"] },
      { object: "inquiries", modes: ["inbound", "outbound", "two_way"] }
    ]
  },
  {
    id: "salesforce",
    name: "Salesforce",
    shortName: "SF",
    category: "crm",
    description: "Enterprise CRM connector for accounts, contacts and venue sales opportunities.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "contacts", modes: ["inbound", "outbound", "two_way"] },
      { object: "inquiries", modes: ["inbound", "outbound", "two_way"] }
    ]
  },
  {
    id: "eventbrite",
    name: "Eventbrite",
    shortName: "EB",
    category: "venue",
    description: "Ticketed event and attendee data integration for public venue events.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "events", modes: ["inbound", "outbound"] },
      { object: "contacts", modes: ["inbound"] }
    ]
  },
  {
    id: "slack",
    name: "Slack",
    shortName: "SL",
    category: "communications",
    description: "Operational notifications, assignments and event-day alerts.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "notifications", modes: ["outbound"] },
      { object: "tasks", modes: ["outbound"] }
    ]
  },
  {
    id: "microsoft-teams",
    name: "Microsoft Teams",
    shortName: "MT",
    category: "communications",
    description: "Team notifications and operational workflow delivery.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "notifications", modes: ["outbound"] },
      { object: "tasks", modes: ["outbound"] }
    ]
  },
  {
    id: "twilio",
    name: "Twilio",
    shortName: "TW",
    category: "communications",
    description: "SMS reminders and operational messaging with delivery events.",
    implementation: "planned",
    connectionMethod: "api_key",
    launchWave: 3,
    capabilities: [{ object: "notifications", modes: ["outbound", "inbound"] }]
  },
  {
    id: "airtable",
    name: "Airtable",
    shortName: "AT",
    category: "data",
    description: "Flexible migration/sync bridge for venue teams with operational bases.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "clients", modes: ["migration", "inbound", "outbound"] },
      { object: "events", modes: ["migration", "inbound", "outbound"] },
      { object: "tasks", modes: ["migration", "inbound", "outbound"] }
    ]
  },
  {
    id: "notion",
    name: "Notion",
    shortName: "NT",
    category: "data",
    description: "Document/task migration and selected operational synchronization.",
    implementation: "planned",
    connectionMethod: "oauth",
    launchWave: 3,
    capabilities: [
      { object: "tasks", modes: ["migration", "inbound", "outbound"] },
      { object: "files", modes: ["migration", "inbound"] }
    ]
  },
  {
    id: "the-knot",
    name: "The Knot",
    shortName: "TK",
    category: "venue",
    description: "Lead migration/automation path for wedding-marketplace inquiries when supported.",
    implementation: "planned",
    connectionMethod: "partner_api",
    launchWave: 3,
    capabilities: [{ object: "inquiries", modes: ["migration", "inbound"] }]
  },
  {
    id: "weddingwire",
    name: "WeddingWire",
    shortName: "WW",
    category: "venue",
    description: "Lead migration/automation path for wedding-marketplace inquiries when supported.",
    implementation: "planned",
    connectionMethod: "partner_api",
    launchWave: 3,
    capabilities: [{ object: "inquiries", modes: ["migration", "inbound"] }]
  },
  {
    id: "tripleseat",
    name: "Tripleseat",
    shortName: "TS",
    category: "venue",
    description: "Migration and coexistence candidate for hospitality event sales workflows.",
    implementation: "planned",
    connectionMethod: "partner_api",
    launchWave: 3,
    capabilities: [
      { object: "contacts", modes: ["migration"] },
      { object: "inquiries", modes: ["migration"] },
      { object: "events", modes: ["migration"] }
    ]
  },
  {
    id: "event-temple",
    name: "Event Temple",
    shortName: "ET",
    category: "venue",
    description: "Migration/coexistence candidate for venue CRM and event operations.",
    implementation: "planned",
    connectionMethod: "partner_api",
    launchWave: 3,
    capabilities: [
      { object: "contacts", modes: ["migration"] },
      { object: "inquiries", modes: ["migration"] },
      { object: "events", modes: ["migration"] }
    ]
  }
];

export const providerCategories = [
  "all",
  "crm",
  "accounting",
  "calendar",
  "email",
  "payments",
  "marketing",
  "automation",
  "scheduling",
  "documents",
  "storage",
  "communications",
  "data",
  "venue",
  "lodging"
] as const;
