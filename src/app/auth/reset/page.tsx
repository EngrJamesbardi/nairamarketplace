import { redirect } from "next/navigation";
import { getMfaState, getSession } from "@/lib/auth";
import { ResetForm } from "./form";

export const metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage() {
  // Supabase Auth only lets an account with an authenticator change its password after a code, so ask for it first.
  const { user } = await getSession();
  if (user) {
    const mfa = await getMfaState();
    if (mfa.factors.length && mfa.level !== "aal2") redirect("/auth/mfa?next=/auth/reset");
  }
  return <ResetForm />;
}
