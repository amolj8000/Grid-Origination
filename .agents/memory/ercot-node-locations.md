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

## Lat/lon coverage (current — after 6-phase pipeline)

| Source | Count |
|--------|-------|
| EIA 860 exact name match (`eia_name_match`) | 110 |
| EIA 860 LMP direct match (`eia_lmp_direct`) | 1 |
| EIA 860 fuzzy match (`eia_fuzzy_match`) | 149 |
| Queue lat/lon match (`queue_latlon_match`) | 45 |
| County centroid (`county_centroid`) | 134 |
| Nominatim POI geocode (`nominatim_poi`) | 16 |
| Zone centroid (approximate) | 349 |
| Known hub/zone centroids | 15 |

**Total geo-located: 455 of 804 resource nodes (56.6%)**

## Geolocation pipeline scripts

### Phase 1–4 (`scripts/src/geo-locate-ercot-nodes-v2.py`)
- Phase 1: EIA-860 "RTO/ISO LMP Node Designation" column → exact node match (eia_lmp_direct)
- Phase 2: EIA-860 TX plant fuzzy match on node prefix (eia_fuzzy_match)
- Phase 3: ERCOT queue lat/lon fuzzy match (queue_latlon_match)
- Phase 4: Texas county centroid fallback (county_centroid)

### Phase 5 (`scripts/src/geo-locate-ercot-nodes-phase5.py`)
- Uses CDR 10008 CIM ZIP `Resource_Node_to_Unit` → `UNIT_SUBSTATION` as matching key
- Better than node prefix for short-name nodes (e.g. `ANG_ALL` prefix="ANG" skipped, unit_sub="ANG_SLR" matched)
- Token validation: at least one key token must appear in matched plant name

### Phase 6 (`scripts/src/geo-locate-ercot-nodes-phase6.py` / fast inline version)
- **Bus number bridge**: CIM `Settlement_Points` PSSE_BUS_NUMBER ↔ GIS Report (CDR 15933) POI bus#
  - 555 unique POI buses in July 2026 GIS Report; 1,027 resource nodes have PSSE_BUS_NUMBER in CIM
  - **104 unique zone_centroid nodes matched** via exact bus number (no fuzzy matching needed)
- County centroid applied to all 104 matched nodes → labeled `county_centroid` with `[gis_bus]` in eia_plant_name
- Nominatim upgrade: for POI substation names that look like real places (≥5 alpha chars, not ERCOT codes),
  geocode `"sub_name county Texas"` → 16 nodes upgraded to `nominatim_poi` (city-level precision)
- Persistent bus lookup: `scripts/src/gis_bus_lookup.json` (rn_to_bus + bus_info, 555 buses)
- **Always commit per-update** (`conn.commit()` inside loop) — survives bash timeout
- Known facts: 80 nodes had no Nominatim result (ERCOT-internal sub names); 8 skipped (ERCOT code format)
- Nominatim rate limit: HTTP 429 if >1 req/sec sustained; 1.05s delay is safe; 429s clear after ~5 min

## CIM file details (CDR 10008, July 2026)

`attached_assets/RPT.00010008.0000000000000000.20260701.001311339.CIM_Jul_ML1_1_1783382391984.zip`
- `Settlement_Points_*.csv`: 19,329 rows, 1,027 with RESOURCE_NODE populated
  - Key columns: RESOURCE_NODE, PSSE_BUS_NUMBER, ELECTRICAL_BUS, SUBSTATION, SETTLEMENT_LOAD_ZONE
- `Resource_Node_to_Unit_*.csv`: 1,624 rows, 961 unique resource nodes
  - UNIT_SUBSTATION = generating unit's physical substation code (4–12 chars)

## GIS Report (CDR 15933, July 2026)

`attached_assets/RPT.00015933.0000000000000000.20260701.151514224.GIS_Report_J_1783382598151.xlsx`
- Sheet: "Project Details - Large Gen", headers at row 31, data starts row 36
- Key columns: INR, Project Name, POI Location (format: "NNNNN SubName kV" or "tap NkV NNNNN SubName"), County, CDR Reporting Zone
- 1,793 projects, 555 unique POI bus numbers; county not always clean (needs title-case matching)
- openpyxl load takes ~15-25s even read_only=True — avoid re-loading in time-limited scripts

## What would improve coverage beyond 455/804

- 349 zone_centroid nodes remain: no CIM PSSE bus match to any GIS project
- Many are distribution-connected or have unusual naming not in the GIS queue report
- HIFLD substation shapefile could provide exact coordinates — requires external download
- gridstatus.io API key (paid) embeds per-node coordinates in LMP data

## UI display in nodal.tsx (ERCOT Resource Node Browser)

- Teal MapPin = exact EIA name match or eia_lmp_direct
- Amber MapPin = fuzzy EIA match
- Purple MapPin = queue lat/lon match
- Slate MapPin = county centroid
- Cyan MapPin = nominatim_poi (POI substation geocoded)
- Grey text = zone centroid
- Stats: shows exact · fuzzy · queue · county · POI counts + zone centroid count

## API endpoint

`GET /api/ercot-node-locations?nodeType=resource_node&zone=LZ_WEST&limit=1000`

Returns: nodeName, nodeType, loadZone, hub, substation, latitude, longitude, locationSource, eiaPlantName, avgDaPrice, avgRtPrice, monthsAvailable
