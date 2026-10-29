import Link from "next/link";
import { AuthCard } from "@/components/AuthCard";
import { RegisterForm } from "./form";
import { getActiveCountries, getSelectedCountry } from "@/lib/market";

export const metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage() {
  const [countries, selected] = await Promise.all([getActiveCountries(), getSelectedCountry()]);
  return (
    <AuthCard title="Join Naira Marketplace" subtitle="One free account to buy and sell. No business registration needed.">
      <RegisterForm countries={countries.map((c) => ({ code: c.code, name: c.name }))} defaultCountry={selected.code} />
      <p className="text-center text-sm text-muted">Already have an account? <Link href="/auth/login" className="link">Sign in</Link></p>
    </AuthCard>
  );
}
