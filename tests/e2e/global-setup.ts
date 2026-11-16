import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Where the run's start time is kept for global-teardown.ts, which removes listings created after it. */
export const RUN_START_FILE = join(tmpdir(), "naira-e2e-run-start");

export default async function globalSetup() {
  writeFileSync(RUN_START_FILE, new Date(Date.now() - 1000).toISOString());
  // Admin needs two-step verification: give the seeded admin a test authenticator (local Supabase only).
  const { readFileSync } = await import("node:fs");
  const url = /^NEXT_PUBLIC_SUPABASE_URL=(.*)$/m.exec(readFileSync(".env.local", "utf8"))?.[1]?.trim() ?? "";
  if (!["127.0.0.1", "localhost"].includes(url ? new URL(url).hostname : "")) throw new Error("e2e tests only run against a local Supabase");
  const { enrolViaApi } = await import("./mfa");
  await enrolViaApi("admin@naira.test");
}
