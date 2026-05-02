# Grid Origination Intelligence Platform

## Overview

Full-stack power market siting and origination intelligence tool for energy procurement professionals. Automates the data-heavy analyst work of screening renewable energy and storage project candidates across ERCOT, CAISO, and PJM markets.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React 18 + Vite + Tailwind CSS + shadcn/ui
- **Charts**: Recharts
- **Maps**: React Leaflet + OpenStreetMap
- **Routing**: Wouter
- **Data fetching**: TanStack Query (generated hooks via Orval)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)

## Pages

| Path | Purpose |
|------|---------|
| `/` | Dashboard — stats overview, market breakdown, screening launcher |
| `/rankings` | Candidate rankings table with all 10 dimension scores |
| `/map` | Leaflet map with candidate pins and queue project markers |
| `/ercot` | ERCOT Historical — DA/RT price trends for hubs and load zones |
| `/caiso` | CAISO Historical — NP15/SP15/ZP26 price analysis |
| `/nodal` | ERCOT Nodal Analysis — settlement point spread calculator |
| `/queue` | Interconnection Queue — ERCOT/CAISO/PJM queue project tracker |
| `/qa` | Q&A Copilot — LLM chat interface (placeholder) |
| `/export` | Export Center — top candidate cards + CSV export |
| `/screenings` | Saved Screenings — saved filter sessions |

## Database Entities

| Table | Purpose |
|-------|---------|
| `candidates` | Core project records with all 10 dimension scores |
| `screenings` | Saved screening sessions with filters and candidate IDs |
| `ercot_node_stats` | Hub & Load Zone monthly DA/RT stats |
| `ercot_nodal_stats` | ERCOT resource node monthly aggregated DA stats |
| `caiso_node_stats` | CAISO NP15/SP15/ZP26 monthly DA/RT stats |
| `queue_projects` | Interconnection queue records (ERCOT, CAISO, PJM) |

## Scoring Engine

Candidates are scored across 10 dimensions, each weighted by investment objective:
- `lowest_lcoe` — price and financial weighted
- `risk_adjusted_value` — balanced across all dimensions
- `load_hedge` — demand proximity and grid stability weighted
- `decarbonization` — environmental and curtailment weighted

## Architecture Notes

- OpenAPI spec in `lib/api-spec/openapi.yaml` — source of truth for all API contracts
- Generated React Query hooks in `lib/api-client-react/src/generated/`
- Generated Zod schemas in `lib/api-zod/src/generated/`
- Express routes in `artifacts/api-server/src/routes/`
- Frontend pages in `artifacts/grid-platform/src/pages/`
