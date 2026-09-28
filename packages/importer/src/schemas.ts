import type { FieldDefinition, ImportEntity } from "./types";

const commonContact: FieldDefinition[] = [
  { key: "name", label: "Name", required: true, aliases: ["name","full name","client name","contact name"], type: "string" },
  { key: "email", label: "Email", aliases: ["email","email address","client email","contact email"], type: "email" },
  { key: "phone", label: "Phone", aliases: ["phone","phone number","mobile","cell","telephone"], type: "phone" },
  { key: "company", label: "Company", aliases: ["company","business","organization","company name"], type: "string" }
];

export const importSchemas: Record<ImportEntity, FieldDefinition[]> = {
  clients: [
    ...commonContact,
    { key: "notes", label: "Notes", aliases: ["notes","note","details"], type: "string" }
  ],
  inquiries: [
    ...commonContact,
    { key: "event_name", label: "Event name", aliases: ["event","event name","project","project name","job"], type: "string" },
    { key: "event_type", label: "Event type", aliases: ["event type","type","project type"], type: "string" },
    { key: "proposed_date", label: "Proposed date", aliases: ["event date","date","proposed date","start date"], type: "date" },
    { key: "guest_count", label: "Guests", aliases: ["guests","guest count","attendance","attendees"], type: "integer" },
    { key: "estimated_amount", label: "Estimated amount", aliases: ["estimate","estimated amount","value","project value","total"], type: "money" },
    { key: "status", label: "Status", aliases: ["status","project status","lead status","stage"], type: "string" },
    { key: "source", label: "Lead source", aliases: ["source","lead source","referral source"], type: "string" }
  ],
  events: [
    ...commonContact,
    { key: "event_name", label: "Event name", required: true, aliases: ["event","event name","project","project name","job"], type: "string" },
    { key: "event_type", label: "Event type", aliases: ["event type","type","project type"], type: "string" },
    { key: "starts_at", label: "Starts at", required: true, aliases: ["start","start time","starts at","event date","date"], type: "datetime" },
    { key: "ends_at", label: "Ends at", aliases: ["end","end time","ends at"], type: "datetime" },
    { key: "guest_count", label: "Guests", aliases: ["guests","guest count","attendance","attendees"], type: "integer" },
    { key: "booking_amount", label: "Booking amount", aliases: ["booking amount","total","value","project value"], type: "money" },
    { key: "status", label: "Status", aliases: ["status","project status","stage"], type: "string" }
  ],
  invoices: [
    { key: "invoice_number", label: "Invoice number", required: true, aliases: ["invoice","invoice number","invoice #","number"], type: "string" },
    { key: "client_name", label: "Client name", required: true, aliases: ["client","client name","customer","customer name"], type: "string" },
    { key: "client_email", label: "Client email", aliases: ["email","client email","customer email"], type: "email" },
    { key: "issued_date", label: "Issued date", aliases: ["issued","issued date","invoice date","date"], type: "date" },
    { key: "due_date", label: "Due date", aliases: ["due","due date"], type: "date" },
    { key: "total_amount", label: "Total", required: true, aliases: ["total","amount","invoice total"], type: "money" },
    { key: "status", label: "Status", aliases: ["status","invoice status"], type: "string" }
  ],
  payments: [
    { key: "reference", label: "Reference", aliases: ["reference","transaction","transaction id","payment id","receipt"], type: "string" },
    { key: "client_name", label: "Client name", aliases: ["client","client name","customer","customer name"], type: "string" },
    { key: "invoice_number", label: "Invoice number", aliases: ["invoice","invoice number","invoice #"], type: "string" },
    { key: "received_date", label: "Received date", required: true, aliases: ["date","payment date","received date","paid date"], type: "date" },
    { key: "amount", label: "Amount", required: true, aliases: ["amount","payment","payment amount","total"], type: "money" },
    { key: "method", label: "Method", aliases: ["method","payment method","type"], type: "string" }
  ],
  vendors: [
    { key: "name", label: "Vendor name", required: true, aliases: ["name","vendor","vendor name","company"], type: "string" },
    { key: "contact_name", label: "Contact", aliases: ["contact","contact name"], type: "string" },
    { key: "email", label: "Email", aliases: ["email","email address"], type: "email" },
    { key: "phone", label: "Phone", aliases: ["phone","phone number","mobile"], type: "phone" },
    { key: "category", label: "Category", aliases: ["category","type","vendor type"], type: "string" },
    { key: "notes", label: "Notes", aliases: ["notes","details"], type: "string" }
  ],
  staff: [
    { key: "name", label: "Staff name", required: true, aliases: ["name","staff","staff name","employee","employee name"], type: "string" },
    { key: "email", label: "Email", aliases: ["email","email address"], type: "email" },
    { key: "phone", label: "Phone", aliases: ["phone","phone number","mobile"], type: "phone" },
    { key: "role", label: "Role", aliases: ["role","title","position","job title"], type: "string" },
    { key: "active", label: "Active", aliases: ["active","enabled","status"], type: "boolean" }
  ]
};
