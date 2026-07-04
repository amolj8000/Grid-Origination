---
name: Gas prices seeding + network constraints
description: ERCOT Gas page seeder — Henry Hub from FRED, Waha blocked by EIA key scope. Node.js https.get is blocked in Replit sandbox.
---

## Rule
Node.js `https.get` and native `fetch` time out in this Replit environment for external URLs.
Use `execSync('curl -s --max-time N ...')` instead for all HTTP calls in seed scripts.

**Why:** The Replit sandbox blocks outbound TCP from Node.js but allows curl (different network path).

**How to apply:** Any new seed script that makes HTTP requests must shell out to curl, not use https/fetch modules.

## EIA API key scope
The project's `EIA_API_KEY` is scoped to electricity only. It returns 0 results for:
- `/v2/natural-gas/pri/sum/` — all duoarea facets return empty
- `NG.RNGWWWA.*` v1 series — returns empty

Waha Hub daily prices require a separate EIA nat-gas API key (not currently configured).

## Working sources
- **Henry Hub (FRED DHHNGSP)**: `curl https://fred.stlouisfed.org/graph/fredgraph.csv?id=DHHNGSP` — free, daily since 1997, CSV format, no auth. 651 rows seeded Jan 2024 → Jun 2026.
- **Waha Hub**: EIA v2 weekly `/natural-gas/pri/sum/data/` with `facets[duoarea][]=Y35NY` — works if key has gas scope, otherwise skip gracefully.

## gas_prices table
Created directly via psql (drizzle push was not creating new tables in this env):
```sql
CREATE TABLE gas_prices (
  id SERIAL PRIMARY KEY, hub TEXT NOT NULL, date DATE NOT NULL,
  price NUMERIC(10,4), source TEXT,
  CONSTRAINT gas_prices_hub_date_uq UNIQUE (hub, date)
);
```

## API endpoints (all at /api/gas-prices)
- `GET /api/gas-prices` — raw rows, `?hub=henry_hub&from=&to=`
- `GET /api/gas-prices/spark-spread` — power − gas×HR, `?node=HB_HOUSTON&heat_rate=8.5&gas_hub=henry_hub`
- `GET /api/gas-prices/implied-heat-rate` — power÷gas, `?node=&gas_hub=`
- `GET /api/gas-prices/waha-basis` — Waha−HH + LZ_WEST power basis
- `GET /api/gas-prices/summary` — latest prices + spark by all hub/LZ nodes

## Page
`/ercot-gas` — 5 tabs: Price History, Spark Spread (interactive HR slider), Implied Heat Rate, Waha Basis, Market Context.
