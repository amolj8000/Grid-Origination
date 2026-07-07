---
name: ERCOT node location data
description: How ercot_node_locations table was built, what sources were used, and what lat/lon coverage we have for 804 resource nodes.
---

## What's in ercot_node_locations (819 rows)

- **804 resource nodes** from CDR 12301 (Apr–May 2026 pricing window)
- **15 hub/zone centroids** (HB_NORTH, HB_WEST, etc. + LZ_* zones)
- All 804 resource nodes have **exact load zone** from ERCOT Bus Mapping (CDR 10008)

## Zone distribution (resource nodes)

| Zone | Count |
|------|-------|
| LZ_WEST | 259 |
| LZ_SOUTH | 255 |
| LZ_NORTH | 173 |
| LZ_HOUSTON | 117 |

## Lat/lon coverage (current — after 5-phase pipeline)

| Source | Count |
|--------|-------|
| EIA 860 exact name match (`eia_name_match`) | 110 |
| EIA 860 LMP direct match (`eia_lmp_direct`) | 1 |
| EIA 860 fuzzy match (`eia_fuzzy_match`) | 149 |
| Queue lat/lon match (`queue_latlon_match`) | 45 |
| County centroid (`county_centroid`) | 46 |
| Zone centroid (approximate) | 453 |
| Known hub/zone centroids | 15 |

**Total geo-located: 351 of 804 resource nodes (44%)**

## Geolocation pipeline scripts

### Phase 1–4 (`scripts/src/geo-locate-ercot-nodes-v2.py`)
- Phase 1: EIA-860 generator "RTO/ISO LMP Node Designation" column → exact node match (eia_lmp_direct)
- Phase 2: EIA-860 TX plant fuzzy match on node prefix (eia_fuzzy_match)
- Phase 3: ERCOT queue lat/lon fuzzy match (queue_latlon_match)
- Phase 4: Texas county centroid fallback (county_centroid)

### Phase 5 (`scripts/src/geo-locate-ercot-nodes-phase5.py`)
- Uses CDR 10008 CIM ZIP `Resource_Node_to_Unit` → `UNIT_SUBSTATION` as matching key
- **Key insight**: unit_sub is better than node prefix for short-name nodes:
  - `ANG_ALL` prefix="ANG" (3 chars, skipped) → unit_sub="ANG_SLR" (7 chars, matchable)
  - `ALP_BESS_RN` prefix="ALP" → unit_sub="ALP_BESS"
  - `BAYC_BESS_RN` prefix="BAYC" → unit_sub="BAY_CITY"
  - `TKWSW_CHAMP` → unit_sub="CHAMPION"
- Token validation: at least one key token must appear in the matched plant name (prevents false positives)
- Known bad match: `PC_SOUTH_ALL` → "South Texas Project" (nuclear, wrong) — reverted
- Known bad match: `TI_SOLAR_ALL` → "Solara BESS 1" (score 81.2, "solar" token only) — reverted

## CIM file details (CDR 10008, July 2026)

`attached_assets/RPT.00010008.0000000000000000.20260701.001311339.CIM_Jul_ML1_1_1783382391984.zip`
- `Settlement_Points_*.csv`: 19,329 rows total, 1,027 with RESOURCE_NODE populated
  - Columns: ELECTRICAL_BUS, NODE_NAME, PSSE_BUS_NAME, VOLTAGE_LEVEL, SUBSTATION, SETTLEMENT_LOAD_ZONE, RESOURCE_NODE, HUB_BUS_NAME, HUB, PSSE_BUS_NUMBER
  - **No lat/lon in this file** — SUBSTATION codes only
- `Resource_Node_to_Unit_*.csv`: 1,624 rows, 961 unique resource nodes
  - Columns: RESOURCE_NODE, UNIT_SUBSTATION, UNIT_NAME
  - **UNIT_SUBSTATION is the generating unit's physical substation** — better matching key than node prefix

## What would get full coverage

- **Substation geocoding**: The UNIT_SUBSTATION codes are 4–12 char abbreviations of plant names.
  External geocoding APIs (HIFLD, OSM Overpass, Nominatim) are blocked from Replit.
- **ERCOT GIS portal** (EMIL): may publish Substation Geographic file — not confirmed
- **gridstatus.io API key** (paid): historical LMP data embeds per-node coordinates
- 137 nodes still skipped due to short prefix + no CIM unit_sub entry (1-char prefix nodes like B_, E_, H_, N_, S_, W_, T_)

## UI display in nodal.tsx (ERCOT Resource Node Browser)

- Teal MapPin = exact EIA name match or eia_lmp_direct
- Amber MapPin = fuzzy EIA match (phases 2 + 5)
- Purple MapPin = queue lat/lon match (phases 3 + 5)
- Slate MapPin = county centroid
- Grey text = zone centroid
- Stats computed dynamically from DB; currently shows ~351 geo-located

## API endpoint

`GET /api/ercot-node-locations?nodeType=resource_node&zone=LZ_WEST&limit=1000`

Returns: nodeName, nodeType, loadZone, hub, substation, latitude, longitude, locationSource, eiaPlantName, avgDaPrice, avgRtPrice, monthsAvailable
