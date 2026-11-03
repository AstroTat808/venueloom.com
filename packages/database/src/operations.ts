import { randomUUID } from "node:crypto";
import { assertVenueAccess, withTenantTransaction } from "./tenant";
import type { WorkspacePrincipal } from "./workspace";

const stages = ["new","contacted","qualified","proposal","won","lost"] as const;
const eventStages = ["tentative","confirmed","cancelled"] as const;
type LeadStage = typeof stages[number];
type EventStage = typeof eventStages[number];
function permitted(principal: WorkspacePrincipal) {
  if (!["owner","admin","sales","event_manager"].includes(principal.role)) {
    throw Object.assign(new Error("CRM write permission required."), { status: 403 });
  }
}
export async function operationsSnapshot(principal: WorkspacePrincipal) {
  return withTenantTransaction(principal, async (db) => {
    const venueIds = principal.venueIds;
    const [clients, leads, events] = await Promise.all([
      db.query<{id:string;name:string;email:string|null;phone:string|null;company:string|null;notes:string|null;created_at:string}>(
        "SELECT id,name,email,phone,company,notes,created_at FROM clients WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 250", [principal.organizationId]),
      db.query<{id:string;venue_id:string;client_id:string|null;name:string;email:string|null;event_name:string|null;event_type:string|null;proposed_date:string|null;estimated_minor:string|null;status:string;created_at:string}>(
        "SELECT id,venue_id,client_id,name,email,event_name,event_type,proposed_date,estimated_minor,status,created_at FROM inquiries WHERE organization_id=$1 AND venue_id=ANY($2::uuid[]) ORDER BY created_at DESC LIMIT 250",[principal.organizationId,venueIds]),
      db.query<{id:string;venue_id:string;client_id:string|null;name:string;starts_at:string;ends_at:string|null;status:string;guest_count:number|null}>(
        "SELECT id,venue_id,client_id,name,starts_at,ends_at,status,guest_count FROM events WHERE organization_id=$1 AND venue_id=ANY($2::uuid[]) ORDER BY starts_at DESC LIMIT 250",[principal.organizationId,venueIds])
    ]);
    const leadClientIds = new Set(leads.rows.map(x=>x.client_id).filter(Boolean));
    const eventClientIds = new Set(events.rows.map(x=>x.client_id).filter(Boolean));
    return { venues: principal.venues, role: principal.role,
      clients: clients.rows.filter(x=>leadClientIds.has(x.id)||eventClientIds.has(x.id)||["owner","admin"].includes(principal.role)),
      leads: leads.rows, events: events.rows,
      metrics: { clients: clients.rows.length, openLeads: leads.rows.filter(x=>!["won","lost"].includes(x.status)).length,
        upcomingBookings: events.rows.filter(x=>x.status==="confirmed"&&new Date(x.starts_at)>new Date()).length }
    };
  });
}
export async function createClient(principal:WorkspacePrincipal,input:{name:string;email?:string;phone?:string;company?:string;notes?:string}) {
  permitted(principal);
  if(!input.name?.trim()) throw Object.assign(new Error("Client name is required."),{status:422});
  return withTenantTransaction(principal,async db=>{
    const id=randomUUID();
    await db.query("INSERT INTO clients (id,organization_id,name,email,phone,company,notes) VALUES ($1,$2,$3,$4,$5,$6,$7)",
      [id,principal.organizationId,input.name.trim(),input.email||null,input.phone||null,input.company||null,input.notes||null]);
    return {id};
  });
}
export async function createLead(principal:WorkspacePrincipal,input:{venueId:string;clientId?:string;name:string;email?:string;eventName?:string;eventType?:string;proposedDate?:string;estimatedMinor?:number}) {
  permitted(principal);assertVenueAccess(principal,input.venueId);
  if(!input.name?.trim()) throw Object.assign(new Error("Lead name is required."),{status:422});
  return withTenantTransaction(principal,async db=>{
    if(input.clientId) {
      const found=await db.query("SELECT 1 FROM clients WHERE organization_id=$1 AND id=$2",[principal.organizationId,input.clientId]);
      if(!found.rowCount) throw Object.assign(new Error("Client not found."),{status:404});
    }
    const id=randomUUID();
    await db.query("INSERT INTO inquiries (id,organization_id,venue_id,client_id,name,email,event_name,event_type,proposed_date,estimated_minor,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'new')",
      [id,principal.organizationId,input.venueId,input.clientId||null,input.name.trim(),input.email||null,input.eventName||null,input.eventType||null,input.proposedDate||null,input.estimatedMinor??null]);
    return {id};
  });
}
export async function changeLeadStage(principal:WorkspacePrincipal,input:{id:string;stage:LeadStage}) {
  permitted(principal);
  if(!stages.includes(input.stage)) throw Object.assign(new Error("Invalid lead stage."),{status:422});
  return withTenantTransaction(principal,async db=>{
    const result=await db.query("UPDATE inquiries SET status=$3,updated_at=now() WHERE organization_id=$1 AND id=$2 AND venue_id=ANY($4::uuid[]) RETURNING id",
      [principal.organizationId,input.id,input.stage,principal.venueIds]);
    if(!result.rowCount) throw Object.assign(new Error("Lead not found."),{status:404});
    return {id:input.id,stage:input.stage};
  });
}
export async function createBooking(principal:WorkspacePrincipal,input:{venueId:string;clientId?:string;name:string;startsAt:string;endsAt:string;guestCount?:number}) {
  permitted(principal);assertVenueAccess(principal,input.venueId);
  const start=new Date(input.startsAt),end=new Date(input.endsAt);
  if(!input.name?.trim()||!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)
    throw Object.assign(new Error("Valid name, start and end are required."),{status:422});
  const venue=principal.venues.find(x=>x.id===input.venueId)!;
  return withTenantTransaction(principal,async db=>{
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",[input.venueId]);
    const calendars=await db.query<{id:string}>("SELECT id FROM venue_calendars WHERE organization_id=$1 AND venue_id=$2 AND active=true AND blocks_booking=true AND resource_kind='venue' ORDER BY created_at LIMIT 1",[principal.organizationId,input.venueId]);
    const calendar=calendars.rows[0];
    if(!calendar) throw Object.assign(new Error("Create an active venue calendar before booking."),{status:409});
    const conflict=await db.query("SELECT 1 FROM calendar_blocks WHERE organization_id=$1 AND calendar_id=$2 AND starts_at<$4 AND ends_at>$3 AND status NOT IN ('cancelled') LIMIT 1",[principal.organizationId,calendar.id,start.toISOString(),end.toISOString()]);
    if(conflict.rowCount) throw Object.assign(new Error("This venue is unavailable for the selected dates."),{status:409});
    if(input.clientId) {
      const found=await db.query("SELECT 1 FROM clients WHERE organization_id=$1 AND id=$2",[principal.organizationId,input.clientId]);
      if(!found.rowCount) throw Object.assign(new Error("Client not found."),{status:404});
    }
    const id=randomUUID(),blockId=randomUUID();
    await db.query("INSERT INTO events (id,organization_id,venue_id,client_id,name,starts_at,ends_at,timezone,guest_count,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed')",
      [id,principal.organizationId,input.venueId,input.clientId||null,input.name.trim(),start.toISOString(),end.toISOString(),venue.timezone,input.guestCount??null]);
    await db.query("INSERT INTO calendar_blocks (id,organization_id,calendar_id,venue_id,starts_at,ends_at,status,source_type,source_id) VALUES ($1,$2,$3,$4,$5,$6,'confirmed','event',$7)",
      [blockId,principal.organizationId,calendar.id,input.venueId,start.toISOString(),end.toISOString(),id]);
    return {id};
  });
}
export async function changeBookingStage(principal:WorkspacePrincipal,input:{id:string;stage:EventStage}) {
  permitted(principal);
  if(!eventStages.includes(input.stage)) throw Object.assign(new Error("Invalid booking stage."),{status:422});
  return withTenantTransaction(principal,async db=>{
    const found=await db.query<{venue_id:string;starts_at:string;ends_at:string}>("SELECT venue_id,starts_at,ends_at FROM events WHERE organization_id=$1 AND id=$2 AND venue_id=ANY($3::uuid[]) FOR UPDATE",[principal.organizationId,input.id,principal.venueIds]);
    const event=found.rows[0];if(!event)throw Object.assign(new Error("Booking not found."),{status:404});
    await db.query("SELECT pg_advisory_xact_lock(hashtext($1))",[event.venue_id]);
    if(input.stage==="confirmed") {
      const collision=await db.query("SELECT 1 FROM calendar_blocks WHERE organization_id=$1 AND venue_id=$2 AND starts_at<$4 AND ends_at>$3 AND status!='cancelled' AND NOT (source_type='event' AND source_id=$5) LIMIT 1",
        [principal.organizationId,event.venue_id,event.starts_at,event.ends_at,input.id]);
      if(collision.rowCount)throw Object.assign(new Error("Booking conflicts with existing availability."),{status:409});
    }
    await db.query("UPDATE events SET status=$3,updated_at=now() WHERE organization_id=$1 AND id=$2",[principal.organizationId,input.id,input.stage]);
    await db.query("UPDATE calendar_blocks SET status=$3 WHERE organization_id=$1 AND source_type='event' AND source_id=$2",[principal.organizationId,input.id,input.stage]);
    return {id:input.id,stage:input.stage};
  });
}
