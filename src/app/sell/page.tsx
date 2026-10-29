import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";

export default async function Sell() {
  const { user, seller } = await getSession();
  if (!user) redirect("/auth/login?next=/sell");
  if (!seller) redirect("/onboarding/seller?next=/dashboard/listings/new");
  redirect("/dashboard/listings/new");
}
