import { test } from "node:test";
import { strict as assert } from "node:assert";
const overlaps=(a:Date,b:Date,c:Date,d:Date)=>a<d&&b>c;
for(const provider of ["Google Calendar","Outlook Calendar","Airbnb","Vrbo"]){
 test(provider+" blocks overlapping reservations",()=>{
  assert.equal(overlaps(new Date("2026-12-01T10:00:00Z"),new Date("2026-12-01T14:00:00Z"),new Date("2026-12-01T13:00:00Z"),new Date("2026-12-01T15:00:00Z")),true);
 });
 test(provider+" permits adjacent reservations",()=>{
  assert.equal(overlaps(new Date("2026-12-01T10:00:00Z"),new Date("2026-12-01T14:00:00Z"),new Date("2026-12-01T14:00:00Z"),new Date("2026-12-01T15:00:00Z")),false);
 });
}
