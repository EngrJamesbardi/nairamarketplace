import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const data = JSON.parse(readFileSync(join(__dirname, "../../supabase/data/ng-locations.json"), "utf8")) as { states: Record<string, string[]> };
const migrationFile = readdirSync(join(__dirname, "../../supabase/migrations")).find((f) => f.includes("locations"))!;
const migration = readFileSync(join(__dirname, "../../supabase/migrations", migrationFile), "utf8");

// LGAs per state as listed in the First Schedule, Part I of the 1999 Constitution (774 in total).
const OFFICIAL: Record<string, number> = {
  Abia: 17, Adamawa: 21, "Akwa Ibom": 31, Anambra: 21, Bauchi: 20, Bayelsa: 8, Benue: 23, Borno: 27, "Cross River": 18, Delta: 25,
  Ebonyi: 13, Edo: 18, Ekiti: 16, Enugu: 17, "Federal Capital Territory": 6, Gombe: 11, Imo: 27, Jigawa: 27, Kaduna: 23, Kano: 44,
  Katsina: 34, Kebbi: 21, Kogi: 21, Kwara: 16, Lagos: 20, Nasarawa: 13, Niger: 25, Ogun: 20, Ondo: 18, Osun: 30, Oyo: 33, Plateau: 17,
  Rivers: 23, Sokoto: 23, Taraba: 16, Yobe: 17, Zamfara: 14,
};
const sqlString = (s: string) => `'${s.replace(/'/g, "''")}'`;

describe("Nigerian states and LGAs", () => {
  it("has all 36 states and the FCT", () => {
    expect(Object.keys(data.states).sort()).toEqual(Object.keys(OFFICIAL).sort());
    expect(Object.keys(data.states)).toHaveLength(37);
  });

  it.each(Object.entries(OFFICIAL))("%s has %i LGAs", (state, count) => {
    expect(data.states[state]).toHaveLength(count);
  });

  it("has 774 LGAs in total, none duplicated within a state", () => {
    expect(Object.values(data.states).flat()).toHaveLength(774);
    for (const lgas of Object.values(data.states)) expect(new Set(lgas).size).toBe(lgas.length);
  });

  it("places well-known LGAs in the right state", () => {
    const where = (lga: string) => Object.entries(data.states).filter(([, l]) => l.includes(lga)).map(([s]) => s);
    expect(where("Oshimili North")).toEqual(["Delta"]);
    expect(where("Ikeja")).toEqual(["Lagos"]);
    expect(where("Abuja Municipal")).toEqual(["Federal Capital Territory"]);
    expect(where("Port Harcourt")).toEqual(["Rivers"]);
    expect(where("Nsukka")).toEqual(["Enugu"]);
    expect(where("Kano Municipal")).toEqual(["Kano"]);
    expect(where("Maiduguri")).toEqual(["Borno"]);
    // Names that exist in more than one state stay attached to each of them (e.g. Irepodun, Obi, Surulere).
    expect(where("Irepodun").sort()).toEqual(["Kwara", "Osun"]);
    expect(where("Obi").sort()).toEqual(["Benue", "Nasarawa"]);
    expect(where("Surulere").sort()).toEqual(["Lagos", "Oyo"]);
  });

  it("the migration inserts exactly this data, each LGA under its own state", () => {
    for (const [state, lgas] of Object.entries(data.states)) {
      for (const lga of lgas) expect(migration).toContain(`(${sqlString(state)}, ${sqlString(lga)}, `);
    }
    expect(migration.match(/^ {2}\('[^']+(?:''[^']*)*', '/gm)?.length).toBeGreaterThanOrEqual(774);
  });
});
