---
name: ERCOT Bundle Seeding
description: Key quirks for downloading and parsing ERCOT monthly price bundle ZIPs via the ERCOT Developer API
---

## Rules

**Date format is MM/DD/YYYY** — not ISO. `datetime.date.fromisoformat()` will fail silently. Use:
```python
def parse_date(s):
    s = s.strip()
    if '/' in s: p = s.split('/'); return datetime.date(int(p[2]), int(p[0]), int(p[1]))
    return datetime.date.fromisoformat(s[:10])
```

**Node column is `SettlementPointName`** — not `SettlementPoint`. The settlement point price column is `SettlementPointPrice`.

**Bundle structure is nested ZIPs**: outer monthly ZIP → inner daily ZIPs → CSV. Each daily ZIP contains one CSV for that day's 15-min RT or hourly DA data.

**Bundle endpoints**:
- RT (15-min): `https://api.ercot.com/api/public-reports/bundle/np6-905-cd?download={docId}`
- DA (hourly): `https://api.ercot.com/api/public-reports/bundle/np4-190-cd?download={docId}`

**Monthly size**: RT ~20-25 MB / ~3M rows, DA ~5 MB / ~750K rows. Each month takes ~20-30s to download + parse + upsert.

**Requires unique constraint** on `ercot_node_stats(node, year, month)` for ON CONFLICT upserts. Already added: `ercot_node_stats_node_year_month_uniq`.

**~1,000-1,100 resource nodes per month** (grows over time as new generators interconnect).

**Why:** Silent `except: pass` in date parsing caused zero rows to land in DB. Fixed by using `parse_date()` with slash detection.

**How to apply:** Any future re-seed or incremental update must use `parse_date()` and `SettlementPointName` column mapping.
