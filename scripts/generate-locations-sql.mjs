// Prints the INSERT statements for Nigeria's states and LGAs from supabase/data/ng-locations.json.
// The output was pasted into supabase/migrations/20261030000001_locations.sql; tests/unit/locations.test.ts checks that the
// migration and the JSON agree, so edit the JSON, re-run this script and update the migration together.
//   node scripts/generate-locations-sql.mjs > /tmp/ng.sql
import { readFileSync } from "node:fs";

const { states } = JSON.parse(readFileSync(new URL("../supabase/data/ng-locations.json", import.meta.url), "utf8"));
const q = (s) => `'${s.replace(/'/g, "''")}'`;
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rows = [];
for (const [state, lgas] of Object.entries(states)) {
  for (const lga of lgas) rows.push(`  (${q(state)}, ${q(lga)}, ${q(slugify(lga))})`);
}
console.log("insert into public.areas (region_id, country_code, name, slug, kind)");
console.log("select r.id, 'NG', v.name, v.slug, 'lga'");
console.log("from (values");
console.log(rows.join(",\n"));
console.log(") as v(state, name, slug)");
console.log("join public.regions r on r.country_code = 'NG' and r.name = v.state;");
