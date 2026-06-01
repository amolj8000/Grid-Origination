---
name: Transmission lines DB seeding
description: How transmission line data was sourced, structured, and loaded; known constraints around payload size.
---

## Source
HIFLD Electric Power Transmission Lines (ArcGIS FeatureServer, public, no auth).
- 345kV+ nationwide (3,389 lines)
- 115–344kV within ERCOT/CAISO/PJM bounding boxes (20,285 lines)
- Total: 23,674 unique lines

## Table
`transmission_lines` — columns: hifld_id, line_type, status, voltage_kv, volt_class, owner, sub_from, sub_to, iso, line_length_km, coordinates (JSONB array of [lon,lat] pairs).

## ISO assignment
Bounding box point-in-polygon on midpoint coordinate:
- ERCOT: lon [-106.65, -93.51], lat [25.84, 36.50]
- CAISO: lon [-124.40, -114.10], lat [32.50, 42.00]
- PJM: lon [-91.00, -73.00], lat [36.50, 46.00]
- Everything else: OTHER

## Coordinate simplification
Max 150 coordinate points per line (step-sampled for long lines) stored in JSONB.

## Seeding constraint
- psycopg2 not installed in Nix environment
- psql subprocess arg-list-too-long for large SQL strings
- **Working approach**: write 200-row SQL chunks to named tempfiles, run `psql DB -f /tmp/chunk.sql`

## API endpoint
`GET /api/transmission-lines?minVoltage=115&iso=ERCOT`
Returns GeoJSON FeatureCollection with properties: VOLTAGE, VOLT_CLASS, TYPE, STATUS, OWNER, SUB_1, SUB_2, ISO, LENGTH_KM.

**Why:** VOLTAGE property name is required — map.tsx filters features by `f.properties?.VOLTAGE` using the voltage band lookup.

## Response size
~34 MB for full 23,674-line set (115kV+ all ISOs). Loaded lazily in the frontend — only triggered when the user first enables the Transmission Lines toggle. Cached in component state thereafter.
