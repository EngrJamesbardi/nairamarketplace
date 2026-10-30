import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/** Where the run's start time is kept for global-teardown.ts, which removes listings created after it. */
export const RUN_START_FILE = join(tmpdir(), "naira-e2e-run-start");

export default async function globalSetup() {
  writeFileSync(RUN_START_FILE, new Date(Date.now() - 1000).toISOString());
}
