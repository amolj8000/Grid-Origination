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

All 804 nodes fall in only 4 zones — CDR 12301 (7-day rolling window) captures nodes from the most active renewable build-out areas.

## Lat/lon coverage

| Source | Count |
|--------|-------|
| EIA 860 name match (precise) | 110 |
| Zone centroid (approximate) | 694 |
| Known hub/zone centroids | 15 |

**Why:** ERCOT does not publish node lat/lon in any free CDR report. HIFLD electric substations ArcGIS endpoints were inaccessible. Matching strategy: substation name from bus mapping → EIA 860 plant name prefix match (first 6 chars, zone-weighted).

## Data sources used (all free, no auth)

1. **gridstatus Python library** (no API key): `Ercot().get_settlement_points_electrical_bus_mapping(date='2025-01-01')` → 1,016 resource nodes with zone + substation
2. **gridstatus Python library**: `Ercot().get_resource_node_to_unit(date='2025-01-01')` → 1,609 resource node → unit substation mappings
3. **EIA 860 candidates table** (already in DB): name + lat/lon → 787 ERCOT plants for name matching

## What gridstatus.io API key would unlock

- Historical LMP data for individual resource nodes with lat/lon embedded
- True per-node coordinates for all 1,016+ resource nodes
- API endpoint: `api.gridstatus.io/datasets`

## API endpoint

`GET /api/ercot-node-locations?nodeType=resource_node&zone=LZ_WEST&limit=1000`

Returns: nodeName, nodeType, loadZone, hub, substation, latitude, longitude, locationSource, eiaPlantName, avgDaPrice, avgRtPrice, monthsAvailable

## CAISO ATL_PNODE_MAP

Downloaded from OASIS: 1,771 CAISO pricing nodes mapped to NP15 (665), SP15 (957), ZP26 (149). Saved to `/tmp/caiso_pnode_map.csv`. Not yet seeded to DB — would need a `caiso_node_locations` table.

**How to apply:** Use `ercot_node_locations` for nearest-neighbor per-node pricing in scoring scripts. For candidates near EIA-matched nodes, their lat/lon enables more precise basis/congestion signals vs zone-level averages.
