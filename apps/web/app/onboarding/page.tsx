import { redirect } from "next/navigation";
import { getIdentityState } from "../../lib/auth";
import { OnboardingForm } from "./ui";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const state = await getIdentityState();
  if (!state.identity) redirect("/login");
  if (state.memberships.some((membership) => membership.status === "active")) redirect("/integrations");
  return <OnboardingForm />;
}
