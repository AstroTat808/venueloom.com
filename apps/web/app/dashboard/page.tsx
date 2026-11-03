import "./dashboard.css";
import { getUser } from "@netlify/identity";
import { resolveWorkspace } from "@venueloom/database";
import { redirect } from "next/navigation";
import { OperationsDashboard } from "./ui";
export const dynamic="force-dynamic";
export default async function DashboardPage(){
  const user=await getUser();
  if(!user?.id||!user.email)redirect("/login");
  const workspace=await resolveWorkspace({provider:"netlify",subject:user.id,email:user.email,displayName:user.name??null});
  if(!workspace)redirect("/setup");
  return <OperationsDashboard organizationName={workspace.organizationName} userName={user.name??user.email}/>;
}
