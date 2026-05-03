import { db, queueProjectsTable } from "@workspace/db";

// ── Helpers ──────────────────────────────────────────────────────────────────
function rnd(min: number, max: number, decimals = 4) {
  return parseFloat((Math.random() * (max - min) + min).toFixed(decimals));
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function pickWeighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}
function dateRange(startYear: number, endYear: number): Date {
  const start = new Date(startYear, 0, 1).getTime();
  const end = new Date(endYear, 11, 31).getTime();
  return new Date(start + Math.random() * (end - start));
}
function pad(n: number, len = 4) {
  return String(n).padStart(len, "0");
}

// ── Geographic zones ──────────────────────────────────────────────────────────
type GeoZone = {
  county: string;
  state: string;
  latMin: number; latMax: number;
  lonMin: number; lonMax: number;
  fuels: string[];
  weights: number[];
};

const ERCOT_ZONES: GeoZone[] = [
  { county: "Pecos",       state: "TX", latMin: 30.4, latMax: 31.3, lonMin: -102.9, lonMax: -101.5, fuels: ["solar","wind","storage","hybrid"], weights: [45,30,15,10] },
  { county: "Brewster",    state: "TX", latMin: 29.2, latMax: 30.8, lonMin: -103.7, lonMax: -102.2, fuels: ["solar","wind","storage"],         weights: [55,30,15] },
  { county: "Reeves",      state: "TX", latMin: 31.0, latMax: 31.7, lonMin: -103.9, lonMax: -103.0, fuels: ["solar","wind","storage","hybrid"], weights: [40,35,15,10] },
  { county: "Andrews",     state: "TX", latMin: 32.0, latMax: 32.5, lonMin: -103.0, lonMax: -102.2, fuels: ["solar","wind","storage"],         weights: [50,35,15] },
  { county: "Upton",       state: "TX", latMin: 31.4, latMax: 31.8, lonMin: -102.3, lonMax: -101.6, fuels: ["solar","wind","storage"],         weights: [60,25,15] },
  { county: "Nolan",       state: "TX", latMin: 32.2, latMax: 32.6, lonMin: -100.6, lonMax: -100.1, fuels: ["wind","solar","storage"],         weights: [55,30,15] },
  { county: "Scurry",      state: "TX", latMin: 32.6, latMax: 32.9, lonMin: -101.1, lonMax: -100.4, fuels: ["wind","solar","storage"],         weights: [60,25,15] },
  { county: "Jones",       state: "TX", latMin: 32.7, latMax: 33.0, lonMin: -99.9,  lonMax: -99.5,  fuels: ["wind","solar"],                  weights: [65,35] },
  { county: "Atascosa",    state: "TX", latMin: 28.5, latMax: 29.2, lonMin: -99.0,  lonMax: -98.2,  fuels: ["solar","storage","natural_gas"], weights: [60,25,15] },
  { county: "Webb",        state: "TX", latMin: 27.2, latMax: 28.1, lonMin: -99.8,  lonMax: -98.9,  fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Hidalgo",     state: "TX", latMin: 26.2, latMax: 26.8, lonMin: -98.5,  lonMax: -97.8,  fuels: ["solar","wind","storage"],         weights: [55,30,15] },
  { county: "Cameron",     state: "TX", latMin: 25.9, latMax: 26.4, lonMin: -97.8,  lonMax: -97.0,  fuels: ["wind","solar","storage"],         weights: [50,35,15] },
  { county: "Willacy",     state: "TX", latMin: 26.3, latMax: 26.7, lonMin: -97.8,  lonMax: -97.3,  fuels: ["wind","solar"],                  weights: [60,40] },
  { county: "Kenedy",      state: "TX", latMin: 26.7, latMax: 27.3, lonMin: -98.0,  lonMax: -97.5,  fuels: ["wind","solar"],                  weights: [65,35] },
  { county: "Karnes",      state: "TX", latMin: 28.9, latMax: 29.4, lonMin: -98.0,  lonMax: -97.5,  fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Grimes",      state: "TX", latMin: 30.5, latMax: 30.8, lonMin: -96.2,  lonMax: -95.8,  fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Freestone",   state: "TX", latMin: 31.5, latMax: 31.9, lonMin: -96.4,  lonMax: -95.9,  fuels: ["solar","wind"],                  weights: [65,35] },
  { county: "Eastland",    state: "TX", latMin: 32.1, latMax: 32.5, lonMin: -99.0,  lonMax: -98.4,  fuels: ["wind","solar"],                  weights: [55,45] },
  { county: "Shackelford", state: "TX", latMin: 32.7, latMax: 33.1, lonMin: -99.4,  lonMax: -99.0,  fuels: ["wind","solar"],                  weights: [60,40] },
  { county: "Foard",       state: "TX", latMin: 33.8, latMax: 34.1, lonMin: -99.8,  lonMax: -99.4,  fuels: ["wind","solar"],                  weights: [65,35] },
];

const CAISO_ZONES: GeoZone[] = [
  { county: "Kern",           state: "CA", latMin: 35.0, latMax: 35.8, lonMin: -119.8, lonMax: -118.2, fuels: ["solar","wind","storage"],         weights: [50,35,15] },
  { county: "San Bernardino", state: "CA", latMin: 34.5, latMax: 35.4, lonMin: -117.5, lonMax: -115.5, fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Riverside",      state: "CA", latMin: 33.5, latMax: 34.2, lonMin: -116.8, lonMax: -115.6, fuels: ["solar","storage","geothermal"],   weights: [60,25,15] },
  { county: "Imperial",       state: "CA", latMin: 32.6, latMax: 33.2, lonMin: -115.5, lonMax: -114.6, fuels: ["solar","storage","geothermal"],   weights: [55,25,20] },
  { county: "Fresno",         state: "CA", latMin: 36.5, latMax: 37.1, lonMin: -120.4, lonMax: -119.4, fuels: ["solar","storage"],               weights: [75,25] },
  { county: "Kings",          state: "CA", latMin: 36.0, latMax: 36.4, lonMin: -120.2, lonMax: -119.5, fuels: ["solar","storage"],               weights: [80,20] },
  { county: "Tulare",         state: "CA", latMin: 35.8, latMax: 36.5, lonMin: -119.5, lonMax: -118.8, fuels: ["solar","storage"],               weights: [75,25] },
  { county: "Tehama",         state: "CA", latMin: 39.8, latMax: 40.4, lonMin: -122.8, lonMax: -122.0, fuels: ["wind","solar"],                  weights: [65,35] },
  { county: "Solano",         state: "CA", latMin: 38.0, latMax: 38.5, lonMin: -122.2, lonMax: -121.5, fuels: ["wind","solar"],                  weights: [70,30] },
  { county: "Contra Costa",   state: "CA", latMin: 37.7, latMax: 38.1, lonMin: -122.3, lonMax: -121.7, fuels: ["wind","solar","storage"],         weights: [45,35,20] },
  { county: "Alameda",        state: "CA", latMin: 37.5, latMax: 37.9, lonMin: -122.3, lonMax: -121.8, fuels: ["wind","solar","storage"],         weights: [40,40,20] },
  { county: "Humboldt",       state: "CA", latMin: 40.4, latMax: 40.8, lonMin: -124.4, lonMax: -123.8, fuels: ["offshore_wind","wind"],           weights: [70,30] },
  { county: "Mendocino",      state: "CA", latMin: 38.7, latMax: 39.6, lonMin: -124.0, lonMax: -123.2, fuels: ["offshore_wind","wind","solar"],   weights: [55,25,20] },
  { county: "Sonoma",         state: "CA", latMin: 38.2, latMax: 38.8, lonMin: -123.2, lonMax: -122.5, fuels: ["offshore_wind","wind","solar"],   weights: [40,35,25] },
  { county: "San Luis Obispo", state: "CA", latMin: 35.1, latMax: 35.6, lonMin: -121.0, lonMax: -120.2, fuels: ["solar","offshore_wind","wind"],  weights: [40,35,25] },
  { county: "Clark",          state: "NV", latMin: 35.5, latMax: 36.2, lonMin: -115.7, lonMax: -114.5, fuels: ["solar","storage"],               weights: [75,25] },
  { county: "Nye",            state: "NV", latMin: 37.2, latMax: 38.1, lonMin: -116.5, lonMax: -115.5, fuels: ["solar","storage"],               weights: [80,20] },
  { county: "Maricopa",       state: "AZ", latMin: 33.0, latMax: 33.8, lonMin: -112.8, lonMax: -111.5, fuels: ["solar","storage"],               weights: [75,25] },
  { county: "La Paz",         state: "AZ", latMin: 33.5, latMax: 34.2, lonMin: -114.2, lonMax: -113.3, fuels: ["solar","storage"],               weights: [80,20] },
];

const PJM_ZONES: GeoZone[] = [
  { county: "Somerset",    state: "PA", latMin: 39.8, latMax: 40.1, lonMin: -79.3, lonMax: -78.8, fuels: ["wind","solar"],                  weights: [55,45] },
  { county: "Blair",       state: "PA", latMin: 40.4, latMax: 40.7, lonMin: -78.5, lonMax: -78.0, fuels: ["solar","wind"],                  weights: [55,45] },
  { county: "Cambria",     state: "PA", latMin: 40.4, latMax: 40.7, lonMin: -79.0, lonMax: -78.5, fuels: ["wind","solar"],                  weights: [50,50] },
  { county: "Elk",         state: "PA", latMin: 41.3, latMax: 41.6, lonMin: -78.8, lonMax: -78.3, fuels: ["wind","solar"],                  weights: [60,40] },
  { county: "Clinton",     state: "PA", latMin: 41.1, latMax: 41.5, lonMin: -77.8, lonMax: -77.2, fuels: ["wind","solar","storage"],         weights: [50,35,15] },
  { county: "Mercer",      state: "NJ", latMin: 40.1, latMax: 40.4, lonMin: -74.8, lonMax: -74.5, fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Ocean",       state: "NJ", latMin: 39.7, latMax: 40.1, lonMin: -74.3, lonMax: -73.9, fuels: ["offshore_wind","solar","storage"], weights: [50,30,20] },
  { county: "Monmouth",    state: "NJ", latMin: 40.2, latMax: 40.5, lonMin: -74.3, lonMax: -73.9, fuels: ["offshore_wind","solar","storage"], weights: [55,25,20] },
  { county: "Atlantic",    state: "NJ", latMin: 39.4, latMax: 39.7, lonMin: -74.8, lonMax: -74.3, fuels: ["offshore_wind","solar"],          weights: [60,40] },
  { county: "Cape May",    state: "NJ", latMin: 38.9, latMax: 39.3, lonMin: -75.0, lonMax: -74.6, fuels: ["offshore_wind","solar"],          weights: [65,35] },
  { county: "Macon",       state: "IL", latMin: 39.8, latMax: 40.0, lonMin: -89.0, lonMax: -88.6, fuels: ["solar","wind","storage"],         weights: [50,35,15] },
  { county: "Logan",       state: "IL", latMin: 40.0, latMax: 40.3, lonMin: -89.4, lonMax: -89.1, fuels: ["wind","solar"],                  weights: [55,45] },
  { county: "Livingston",  state: "IL", latMin: 40.8, latMax: 41.1, lonMin: -88.5, lonMax: -88.1, fuels: ["wind","solar"],                  weights: [60,40] },
  { county: "Iroquois",    state: "IL", latMin: 40.7, latMax: 41.0, lonMin: -88.0, lonMax: -87.6, fuels: ["wind","solar","storage"],         weights: [50,35,15] },
  { county: "DeKalb",      state: "IL", latMin: 41.8, latMax: 42.0, lonMin: -88.9, lonMax: -88.5, fuels: ["wind","solar"],                  weights: [55,45] },
  { county: "Hardin",      state: "WV", latMin: 38.9, latMax: 39.2, lonMin: -80.7, lonMax: -80.2, fuels: ["wind","solar"],                  weights: [65,35] },
  { county: "Pendleton",   state: "WV", latMin: 38.6, latMax: 39.0, lonMin: -79.6, lonMax: -79.1, fuels: ["wind","solar"],                  weights: [70,30] },
  { county: "Tucker",      state: "WV", latMin: 39.0, latMax: 39.2, lonMin: -79.6, lonMax: -79.2, fuels: ["wind","solar"],                  weights: [65,35] },
  { county: "Berkshire",   state: "VA", latMin: 37.2, latMax: 37.6, lonMin: -79.7, lonMax: -79.3, fuels: ["solar","wind"],                  weights: [55,45] },
  { county: "Charlotte",   state: "VA", latMin: 36.9, latMax: 37.2, lonMin: -78.8, lonMax: -78.4, fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Louisa",      state: "VA", latMin: 37.9, latMax: 38.2, lonMin: -78.1, lonMax: -77.7, fuels: ["solar","storage"],               weights: [75,25] },
  { county: "Carroll",     state: "MD", latMin: 39.5, latMax: 39.8, lonMin: -77.2, lonMax: -76.8, fuels: ["solar","storage"],               weights: [70,30] },
  { county: "Harford",     state: "MD", latMin: 39.5, latMax: 39.7, lonMin: -76.5, lonMax: -76.2, fuels: ["solar","storage","offshore_wind"], weights: [55,25,20] },
  { county: "Coshocton",   state: "OH", latMin: 40.3, latMax: 40.6, lonMin: -82.1, lonMax: -81.7, fuels: ["wind","solar"],                  weights: [55,45] },
  { county: "Seneca",      state: "OH", latMin: 41.0, latMax: 41.3, lonMin: -83.2, lonMax: -82.8, fuels: ["wind","solar","storage"],         weights: [50,35,15] },
  { county: "Paulding",    state: "OH", latMin: 41.1, latMax: 41.4, lonMin: -84.7, lonMax: -84.3, fuels: ["wind","solar"],                  weights: [60,40] },
  { county: "Van Wert",    state: "OH", latMin: 40.8, latMax: 41.1, lonMin: -84.7, lonMax: -84.3, fuels: ["wind","solar"],                  weights: [55,45] },
];

// Developer name fragments
const DEV_PREFIXES = [
  "Nextera","Invenergy","Orion","Sunrun","Apex","Arevon","EDF","Avangrid",
  "Longroad","Clearway","AES","Enel","Ørsted","Equinor","SunPower","First Solar",
  "Cypress","Lightsource","Terra-Gen","Capstone","Tura","Prairie","Summit",
  "Ridgeline","Horizon","Greenfield","Sunstone","Windrise","Skyline","Bluestone",
  "BrightPath","Cornerstone","Highwind","Landmark","Meridian","Zenith","Solaris",
  "WestTexas","PanHandle","Permian","Mojave","Tehachapi","Coastal","Delta",
];
const DEV_SUFFIXES = [
  "Energy","Power","Solar","Wind","Renewables","Resources","Generation","Electric",
];
const PROJECT_NOUNS = [
  "Creek","Ridge","Mesa","Plains","Valley","Mountain","Ranch","Flats",
  "Prairie","Bend","Springs","Crossing","Fields","Basin","Peak","Bluff",
  "Meadows","Canyon","Lake","Pass","Point","Hollow","Fork","Run",
];
const SUFFIXES_BY_FUEL: Record<string, string[]> = {
  solar:         ["Solar Farm","Solar Project","PV Park","Solar Center","Solar Array"],
  wind:          ["Wind Farm","Wind Project","Wind Energy Center","Wind Ranch"],
  offshore_wind: ["Offshore Wind","OSW Project","Wind Array","Offshore Array"],
  storage:       ["BESS","Battery Park","Storage Project","Energy Storage"],
  hybrid:        ["Solar+Storage","Hybrid Project","Solar Storage"],
  natural_gas:   ["Peaker","Combined Cycle","Gas Turbine","CCGT"],
  geothermal:    ["Geothermal","Geo Plant","Geothermal Energy"],
  nuclear:       ["Nuclear","SMR Project","Nuclear Gen"],
};
function projectName(fuelType: string): string {
  const dev = `${pick(DEV_PREFIXES)} ${pick(DEV_SUFFIXES)}`;
  const noun = pick(PROJECT_NOUNS);
  const sfx  = pick(SUFFIXES_BY_FUEL[fuelType] ?? ["Project"]);
  return `${dev} – ${noun} ${sfx}`;
}

// Interconnection nodes by market
const ERCOT_NODES = ["LZ_HOUSTON","LZ_WEST","LZ_NORTH","LZ_SOUTH","LZ_AEN",
  "LZ_CPS","LZ_RAYBN","LZ_LCRA","HB_BUSAVG","HB_NORTH","HB_SOUTH","HB_WEST","HB_HOUSTON"];
const CAISO_NODES = ["SP15","NP15","ZP26","DLAP_SDGE-APND","DLAP_PGAE-APND","DLAP_SCE-APND",
  "CAISO_NORTH","CAISO_SOUTH","INTL_INTERTIE","MIECO","SCEC"];
const PJM_NODES  = ["WESTERN HUB","EASTERN HUB","AEP-DAYTON HUB","NI HUB","PSEG",
  "PPL","DOM","BGE","JCPL","METED","PENELEC","APS","EKPC"];

const STATUS_WEIGHTS = { active: 55, withdrawn: 30, completed: 15 };

function studyPhase(market: string, status: string): string | null {
  if (status !== "active") return null;
  const ercotPhases = ["Scoping","Phase 1","Phase 2","Phase 3","NRIS","ERIS","GIA"];
  const caisoPhases = ["Phase I","Phase II","Phase III","BPM","Conditional","Approved"];
  const pjmPhases   = ["Scoping","Feasibility","System Impact","Facilities","IA Exec","Queue 1","Queue 2"];
  if (market === "ERCOT") return pick(ercotPhases);
  if (market === "CAISO") return pick(caisoPhases);
  return pick(pjmPhases);
}

// ── Main generator ───────────────────────────────────────────────────────────
function generateProjects(
  market: string,
  zones: GeoZone[],
  nodes: string[],
  count: number,
  queuePrefix: string,
  startId: number,
) {
  const rows: Array<typeof queueProjectsTable.$inferInsert> = [];
  let id = startId;

  for (let i = 0; i < count; i++) {
    const zone = pick(zones);
    const fuelType = pickWeighted(zone.fuels, zone.weights);
    const status = pickWeighted(
      ["active", "withdrawn", "completed"],
      [STATUS_WEIGHTS.active, STATUS_WEIGHTS.withdrawn, STATUS_WEIGHTS.completed],
    );

    const reqDate = dateRange(2018, 2025);
    const withdrawalDate = status === "withdrawn"
      ? new Date(reqDate.getTime() + rnd(30, 730, 0) * 86400000)
      : null;

    // Capacity by fuel type
    let cap: number;
    switch (fuelType) {
      case "offshore_wind": cap = rnd(200, 1500, 0); break;
      case "nuclear":       cap = rnd(300, 1200, 0); break;
      case "wind":          cap = rnd(50,  800, 0);  break;
      case "storage":       cap = rnd(50,  400, 0);  break;
      case "hybrid":        cap = rnd(100, 600, 0);  break;
      default:              cap = rnd(20,  500, 0);  break;
    }

    rows.push({
      projectName: projectName(fuelType),
      market,
      queueId: `${queuePrefix}-${reqDate.getFullYear()}-${pad(id++)}`,
      fuelType,
      capacityMw: String(cap),
      status,
      latitude:  String(rnd(zone.latMin, zone.latMax, 5)),
      longitude: String(rnd(zone.lonMin, zone.lonMax, 5)),
      county: zone.county,
      state: zone.state,
      interconnectionNode: pick(nodes),
      requestDate: reqDate,
      studyGroupPhase: studyPhase(market, status),
      withdrawalDate,
    });
  }
  return rows;
}

// ── Seed ─────────────────────────────────────────────────────────────────────
async function seed() {
  console.log("Clearing existing queue projects...");
  await db.delete(queueProjectsTable);

  const ercot  = generateProjects("ERCOT", ERCOT_ZONES, ERCOT_NODES, 480, "ERC", 1000);
  const caiso  = generateProjects("CAISO", CAISO_ZONES, CAISO_NODES, 440, "CAI", 2000);
  const pjm    = generateProjects("PJM",   PJM_ZONES,   PJM_NODES,   580, "PJM", 3000);

  const all = [...ercot, ...caiso, ...pjm];
  console.log(`Inserting ${all.length} queue projects (ERCOT: ${ercot.length}, CAISO: ${caiso.length}, PJM: ${pjm.length})...`);

  // Insert in chunks of 200
  for (let i = 0; i < all.length; i += 200) {
    await db.insert(queueProjectsTable).values(all.slice(i, i + 200));
  }

  console.log("Done. Breakdown by market:");
  const counts = { ERCOT: ercot.length, CAISO: caiso.length, PJM: pjm.length };
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
