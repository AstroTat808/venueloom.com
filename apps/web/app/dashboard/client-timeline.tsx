"use client";
import {useEffect,useState} from "react";
type Activity={direction:string;channel:string;subject:string|null;body:string|null;created_at:string};
export default function ClientTimeline({clientId}:{clientId:string}){
 const [items,setItems]=useState<Activity[]>([]);
 const [error,setError]=useState("");
 useEffect(()=>{let active=true;fetch("/api/crm?clientId="+encodeURIComponent(clientId),{cache:"no-store"}).then(async r=>{const data=await r.json();if(!r.ok)throw new Error(data.error||"Unable to load communications");if(active)setItems(data.activity||[]);}).catch(e=>{if(active)setError(String(e));});return()=>{active=false;};},[clientId]);
 return <section aria-label="Client communication timeline"><h3>Communication timeline</h3>{error&&<p role="alert">{error}</p>}{items.length===0&&!error&&<p>No communications recorded yet.</p>}{items.map((item,i)=><article key={i} className="ops-record"><strong>{item.direction==="inbound"?"Received":item.direction==="outbound"?"Sent":"Note"} · {item.channel}</strong><p>{item.subject||"No subject"}</p><p>{item.body||""}</p><small>{new Date(item.created_at).toLocaleString()}</small></article>)}</section>;
}
