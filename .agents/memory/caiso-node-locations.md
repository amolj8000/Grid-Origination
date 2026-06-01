---
name: CAISO node location data
description: How caiso_node_locations was built — ATL_PNODE_MAP source, zone mapping, EIA name matching, zone centroids, OASIS API constraints.
---

## Source
CAISO OASIS `ATL_PNODE_MAP` — public, no auth required.
URL: `https://oasis.caiso.com/oasisapi/SingleZip?queryname=ATL_PNODE_MAP&version=1&startdatetime=20240101T00:00-0000&enddatetime=20240102T00:00-0000&resultformat=6`
Returns a ZIP with one CSV. Deduplicate by latest `EFF_END_DT` per `PNODE_ID`.

## Zone mapping
`APNODE_ID` column → zone:
- `TH_SP15_GEN-APND` → `SP15`
- `TH_NP15_GEN-APND` → `NP15`
- `TH_ZP26_GEN-APND` → `ZP26`

## Row counts
- 1,771 unique resource nodes (NP15: 665, SP15: 957, ZP26: 149)
- 3 zone aggregate nodes (TH_NP15/SP15/ZP26_GEN-APND)
- Total: 1,774 rows in `caiso_node_locations`

## Geolocation strategy
1. **EIA name match** (594 nodes): Strip voltage suffix from PNODE_ID (e.g. `ALAMITOS_2_B1` → `ALAMITOS`), prefix-match against EIA 860 CAISO candidates by zone. Threshold score ≥ 7 required.
2. **Zone centroid** (1,177 nodes): NP15 (38.5, -121.5), SP15 (34.0, -118.0), ZP26 (36.0, -119.5).

## Pricing
No individual CAISO resource node pricing in DB — only 3 zone aggregates (NP15/SP15/ZP26) from CAISO OASIS PRC_LMP DA (real, 28 months).
Zone DA averages applied to all nodes: NP15=$43.86, SP15=$38.24, ZP26=$32.41/MWh.

## CAISO OASIS API constraints
- `PRC_LMP` max period = **31 days** (returns ERR_CODE 1004 if exceeded)
- Works fine for zone aggregate nodes (TH_SP15_GEN-APND etc.)
- Individual resource node names use format: `PLANTNAME_<voltage>_<bus>` (e.g. `ALAMT2G_7_B1`)

## API endpoint
`GET /api/caiso-node-locations` — supports `?zone=NP15|SP15|ZP26`, `?nodeType=resource_node|zone`, `?limit=N` (max 3000)

## Why
CAISO has more internal basis risk than zone-level pricing reveals. The ATL_PNODE_MAP gives zone assignment for all 1,771 individual pricing nodes. EIA name matching gives precise lat/lon for 33% of them — enough for nearest-neighbor candidate scoring.
