import { useState, useMemo } from "react";
import { useListCandidates, useListQueueProjects } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  Loader2, Search, ArrowUpDown, Leaf, Sun, Wind, Droplets, Zap, Info,
  Building2, ListTree,
} from "lucide-react";

const ELIGIBLE_TYPES = new Set([
  "solar", "wind", "offshore_wind", "hydro",
  "geothermal", "biomass", "hybrid", "solar_storage", "wind_storage",
]);

const TYPE_COLORS: Record<string, string> = {
  solar:        "#f59e0b",
  wind:         "#14b8a6",
  offshore_wind:"#06b6d4",
  hydro:        "#3b82f6",
  geothermal:   "#84cc16",
  biomass:      "#22c55e",
  hybrid:       "#ec4899",
  solar_storage:"#f97316",
  wind_storage: "#8b5cf6",
};

const MARKET_COLORS: Record<string, string> = {
  ERCOT: "#14b8a6",
  CAISO: "#f59e0b",
  PJM:   "#8b5cf6",
};

const MARKET_REC_LABEL: Record<string, string> = {
  ERCOT: "Texas TRC (~$1.50/MWh)",
  CAISO: "CA WREGIS RPS ($7–12/MWh)",
  PJM:   "SREC / OREC ($2–120/MWh)",
};

function TypeIcon({ type }: { type: string }) {
  if (type === "solar" || type === "solar_storage") return <Sun className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS.solar }} />;
  if (type === "wind" || type === "wind_storage") return <Wind className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS.wind }} />;
  if (type === "offshore_wind") return <Wind className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS.offshore_wind }} />;
  if (type === "hydro") return <Droplets className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS.hydro }} />;
  if (type === "biomass") return <Leaf className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS.biomass }} />;
  return <Zap className="h-3.5 w-3.5 shrink-0" style={{ color: TYPE_COLORS[type] ?? "#94a3b8" }} />;
}

function fmtM(v: number) {
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000)     return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)         return `$${(v / 1_000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}
function fmtMwh(v: number) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M MWh`;
  if (v >= 1_000)     return `${(v / 1_000).toFixed(0)}k MWh`;
  return `${v.toFixed(0)} MWh`;
}

const TOOLTIP_STYLE = {
  backgroundColor: "#0f172a",
  borderColor: "#1e293b",
  color: "#f8fafc",
  fontSize: 12,
};

type SortField = "annualRecValueUsd" | "annualRecMwh" | "recPricePerMwh" | "lifetimeRecValue20yr" | "capacityMw";
type DataSource = "operational" | "queue";

export default function RECAnalysis() {
  const [dataSource, setDataSource]  = useState<DataSource>("operational");
  const [search, setSearch]          = useState("");
  const [marketFilter, setMarket]    = useState<string | undefined>(undefined);
  const [typeFilter, setType]        = useState<string | undefined>(undefined);
  const [sortField, setSortField]    = useState<SortField>("annualRecValueUsd");
  const [sortDir, setSortDir]        = useState<"desc" | "asc">("desc");

  const { data: candidateData, isLoading: loadingCandidates } = useListCandidates({});
  const { data: queueData, isLoading: loadingQueue } = useListQueueProjects({ limit: 3000 } as any);

  const isLoading = dataSource === "operational" ? loadingCandidates : loadingQueue;

  const eligible = useMemo(() => {
    if (dataSource === "operational") {
      return (candidateData as any[] ?? []).filter(c => c.recEligible === true);
    } else {
      return (queueData as any[] ?? [])
        .filter(q => q.recEligible === true)
        .map(q => ({
          ...q,
          name:      q.projectName,
          assetType: q.fuelType,
          commissioningYear: q.requestDate ? new Date(q.requestDate).getFullYear() : null,
        }));
    }
  }, [dataSource, candidateData, queueData]);

  const filtered = useMemo(() => {
    let rows = eligible;
    if (marketFilter) rows = rows.filter(c => c.market === marketFilter);
    if (typeFilter)   rows = rows.filter(c => c.assetType === typeFilter);
    if (search)       rows = rows.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.state ?? "").toLowerCase().includes(search.toLowerCase())
    );
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortField] ?? 0;
      const bv = (b as any)[sortField] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [eligible, marketFilter, typeFilter, search, sortField, sortDir]);

  // ── KPI stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    if (!eligible.length) return null;
    const totalAnnualMwh   = eligible.reduce((s, c) => s + ((c as any).annualRecMwh ?? 0), 0);
    const totalAnnualValue = eligible.reduce((s, c) => s + ((c as any).annualRecValueUsd ?? 0), 0);
    const total20yr        = eligible.reduce((s, c) => s + ((c as any).lifetimeRecValue20yr ?? 0), 0);
    const avgPrice = totalAnnualMwh > 0
      ? eligible.reduce((s, c) => s + ((c as any).recPricePerMwh ?? 0) * ((c as any).annualRecMwh ?? 0), 0) / totalAnnualMwh
      : 0;
    return { totalAnnualMwh, totalAnnualValue, total20yr, avgPrice, count: eligible.length };
  }, [eligible]);

  // ── Year × Technology stacked bar ────────────────────────────────────────────
  const yearTechData = useMemo(() => {
    const yearMap: Record<number, Record<string, number>> = {};
    const techSet = new Set<string>();

    eligible.forEach(r => {
      const yr: number | null = (r as any).commissioningYear ?? null;
      if (!yr || yr < 1985 || yr > 2030) return;
      const tech = (r as any).assetType ?? "other";
      techSet.add(tech);
      if (!yearMap[yr]) yearMap[yr] = {};
      yearMap[yr][tech] = (yearMap[yr][tech] ?? 0) + ((r as any).annualRecValueUsd ?? 0);
    });

    const rows = Object.entries(yearMap)
      .map(([yr, d]) => {
        const row: Record<string, number> = { year: parseInt(yr) };
        techSet.forEach(t => { row[t] = Math.round((d[t] ?? 0) / 1_000_000 * 10) / 10; });
        return row;
      })
      .sort((a, b) => a.year - b.year);

    const techs = [...techSet].sort((a, b) => {
      const aTotal = rows.reduce((s, r) => s + (r[a] ?? 0), 0);
      const bTotal = rows.reduce((s, r) => s + (r[b] ?? 0), 0);
      return bTotal - aTotal;
    });

    return { rows, techs };
  }, [eligible]);

  // ── By-type pie ──────────────────────────────────────────────────────────────
  const typeData = useMemo(() => {
    const t: Record<string, { annualValue: number; count: number }> = {};
    eligible.forEach(c => {
      const tp = (c as any).assetType;
      if (!t[tp]) t[tp] = { annualValue: 0, count: 0 };
      t[tp].annualValue += (c as any).annualRecValueUsd ?? 0;
      t[tp].count++;
    });
    return Object.entries(t)
      .map(([type, d]) => ({ type, ...d, fill: TYPE_COLORS[type] ?? "#94a3b8" }))
      .sort((a, b) => b.annualValue - a.annualValue);
  }, [eligible]);

  // ── Market summary ───────────────────────────────────────────────────────────
  const marketData = useMemo(() => {
    const m: Record<string, { annualValue: number; annualMwh: number; count: number }> = {};
    eligible.forEach(c => {
      const mkt = c.market;
      if (!m[mkt]) m[mkt] = { annualValue: 0, annualMwh: 0, count: 0 };
      m[mkt].annualValue += (c as any).annualRecValueUsd ?? 0;
      m[mkt].annualMwh   += (c as any).annualRecMwh    ?? 0;
      m[mkt].count++;
    });
    return Object.entries(m)
      .map(([market, d]) => ({ market, ...d }))
      .sort((a, b) => b.annualValue - a.annualValue);
  }, [eligible]);

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const SortHead = ({ field, label }: { field: SortField; label: string }) => (
    <button
      className={`flex items-center gap-1 hover:text-primary transition-colors ml-auto ${sortField === field ? "text-primary" : ""}`}
      onClick={() => handleSort(field)}
    >
      {label}<ArrowUpDown className="h-3 w-3" />
    </button>
  );

  const yearLabel = dataSource === "operational" ? "Commissioning Year" : "Queue Entry Year";

  return (
    <TooltipProvider>
      <div className="p-6 h-full flex flex-col space-y-4">

        {/* Header + data source toggle */}
        <div className="shrink-0 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <Leaf className="h-5 w-5 text-emerald-400" />
              <h1 className="text-2xl font-bold tracking-tight">REC Analysis</h1>
            </div>
            <p className="text-muted-foreground text-sm">
              Renewable Energy Credit valuation — solar, wind, hydro, geothermal, biomass only. Storage, gas, and nuclear excluded.
            </p>
          </div>
          {/* Data source tabs */}
          <div className="flex rounded-md border border-border overflow-hidden shrink-0 self-start">
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none gap-2 px-4 border-r border-border ${dataSource === "operational" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setDataSource("operational"); setType(undefined); }}
            >
              <Building2 className="h-3.5 w-3.5" />
              Operational Generators
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className={`rounded-none gap-2 px-4 ${dataSource === "queue" ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => { setDataSource("queue"); setType(undefined); }}
            >
              <ListTree className="h-3.5 w-3.5" />
              Interconnection Queue
            </Button>
          </div>
        </div>

        {/* Info banner */}
        <div className="shrink-0 flex items-start gap-2 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Methodology: </span>
            Annual RECs (MWh) = capacity × capacity factor × 8,760 h. Prices: ERCOT TRC ~$1.50/MWh · CAISO WREGIS solar $12, wind $10, hydro $7, geo $10 · PJM solar SREC $15, wind $3.50, offshore OREC $120.
            {dataSource === "operational"
              ? " Operational = EIA 860 2024 operable plants. Year = commissioning date (COD)."
              : " Queue = interconnection applications across ERCOT/CAISO/PJM. Year = queue entry date."}
          </span>
        </div>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* KPI cards */}
            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardDescription className="text-xs">Eligible Plants</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <div className="text-2xl font-bold text-emerald-400">{stats.count.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {dataSource === "operational" ? "of 3,875 EIA 860" : "of ~3,493 in queue"}
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardDescription className="text-xs">Annual REC Generation</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <div className="text-2xl font-bold text-teal-400">{fmtMwh(stats.totalAnnualMwh)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">portfolio-wide / yr</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardDescription className="text-xs">Annual REC Revenue</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <div className="text-2xl font-bold text-amber-400">{fmtM(stats.totalAnnualValue)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">avg ${stats.avgPrice.toFixed(2)}/MWh blended</div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardDescription className="text-xs">20-Year REC Value</CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4 px-4">
                    <div className="text-2xl font-bold text-purple-400">{fmtM(stats.total20yr)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">undiscounted</div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 shrink-0">
              {/* Year × Technology stacked bar */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Annual REC Value by {yearLabel} & Technology ($M/yr)</CardTitle>
                  <CardDescription className="text-xs">
                    Stacked by technology — shows which vintage and resource type drives REC portfolio
                  </CardDescription>
                </CardHeader>
                <CardContent style={{ height: 220 }}>
                  {yearTechData.rows.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={yearTechData.rows} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" vertical={false} />
                        <XAxis dataKey="year" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 10 }} />
                        <YAxis stroke="#64748b" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `$${v}M`} width={48} />
                        <RechartsTooltip
                          contentStyle={TOOLTIP_STYLE}
                          formatter={(v: number, name: string) => [`$${v.toFixed(1)}M/yr`, name]}
                        />
                        {yearTechData.techs.map(tech => (
                          <Bar
                            key={tech}
                            dataKey={tech}
                            stackId="a"
                            fill={TYPE_COLORS[tech] ?? "#94a3b8"}
                            name={tech.replace(/_/g, " ")}
                            isAnimationActive={false}
                          />
                        ))}
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">No year data available</div>
                  )}
                </CardContent>
              </Card>

              {/* By type pie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Annual Value by Technology</CardTitle>
                  <CardDescription className="text-xs">Share of total REC revenue</CardDescription>
                </CardHeader>
                <CardContent style={{ height: 220 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={typeData}
                        cx="38%"
                        cy="50%"
                        innerRadius={44}
                        outerRadius={76}
                        paddingAngle={2}
                        dataKey="annualValue"
                        nameKey="type"
                      >
                        {typeData.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="transparent" />)}
                      </Pie>
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtM(v)]} />
                      <Legend
                        layout="vertical" align="right" verticalAlign="middle"
                        formatter={(v) => <span style={{ color: "#f8fafc", fontSize: 11 }}>{v.replace(/_/g, " ")}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Market summary */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 shrink-0">
              {marketData.map(m => (
                <div key={m.market} className="bg-card border border-border rounded-md px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MARKET_COLORS[m.market] }} />
                      <span className="font-semibold text-sm">{m.market}</span>
                    </div>
                    <div className="text-xs text-muted-foreground">{MARKET_REC_LABEL[m.market]}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-base" style={{ color: MARKET_COLORS[m.market] }}>{fmtM(m.annualValue)}/yr</div>
                    <div className="text-xs text-muted-foreground">{m.count} plants · {fmtMwh(m.annualMwh)}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 shrink-0 items-center">
              <div className="relative w-[240px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search plants…" className="pl-8 h-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Select value={marketFilter || "all"} onValueChange={v => setMarket(v === "all" ? undefined : v)}>
                <SelectTrigger className="w-[130px] h-9"><SelectValue placeholder="All Markets" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Markets</SelectItem>
                  <SelectItem value="ERCOT">ERCOT</SelectItem>
                  <SelectItem value="CAISO">CAISO</SelectItem>
                  <SelectItem value="PJM">PJM</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter || "all"} onValueChange={v => setType(v === "all" ? undefined : v)}>
                <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="solar">Solar</SelectItem>
                  <SelectItem value="wind">Wind</SelectItem>
                  <SelectItem value="offshore_wind">Offshore Wind</SelectItem>
                  <SelectItem value="hydro">Hydro</SelectItem>
                  <SelectItem value="geothermal">Geothermal</SelectItem>
                  <SelectItem value="biomass">Biomass</SelectItem>
                  <SelectItem value="solar_storage">Solar + Storage</SelectItem>
                  <SelectItem value="wind_storage">Wind + Storage</SelectItem>
                  {dataSource === "queue" && <SelectItem value="hybrid">Hybrid</SelectItem>}
                </SelectContent>
              </Select>
              <div className="ml-auto text-xs text-muted-foreground self-center">
                {filtered.length.toLocaleString()} eligible {dataSource === "operational" ? "plants" : "projects"}
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md flex-1 overflow-auto bg-card">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-8 text-xs">#</TableHead>
                    <TableHead className="w-[220px]">
                      {dataSource === "operational" ? "Plant" : "Project"}
                    </TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">
                      <SortHead field="capacityMw" label="MW" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="annualRecMwh" label="RECs/yr" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="recPricePerMwh" label="$/MWh" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="annualRecValueUsd" label="Annual Value" />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="lifetimeRecValue20yr" label="20yr Value" />
                    </TableHead>
                    <TableHead>REC Market</TableHead>
                    <TableHead className="text-xs text-muted-foreground">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                        No eligible {dataSource === "operational" ? "plants" : "projects"} match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c, idx) => {
                      const recMwh  = (c as any).annualRecMwh        ?? 0;
                      const recVal  = (c as any).annualRecValueUsd    ?? 0;
                      const rec20   = (c as any).lifetimeRecValue20yr  ?? 0;
                      const price   = (c as any).recPricePerMwh        ?? 0;
                      const label   = (c as any).recMarketLabel         ?? "";
                      const name    = (c as any).name ?? (c as any).projectName ?? "—";
                      return (
                        <TableRow key={`${c.id}-${idx}`} className="hover:bg-muted/30 text-sm">
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-medium truncate block max-w-[200px] cursor-default">{name}</span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs max-w-[220px]">
                                <p className="font-semibold mb-1">{name}</p>
                                {(c as any).notes && (
                                  <p className="text-muted-foreground">{(c as any).notes.replace("Source: EIA 860 2024 | ", "")}</p>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs" style={{ borderColor: MARKET_COLORS[c.market], color: MARKET_COLORS[c.market] }}>
                              {c.market}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <TypeIcon type={(c as any).assetType} />
                              <span className="text-xs capitalize">{((c as any).assetType ?? "").replace(/_/g, " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {parseFloat(c.capacityMw as any).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right text-xs">{recMwh.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-xs font-medium">${price.toFixed(2)}</TableCell>
                          <TableCell className="text-right">
                            <span className="text-emerald-400 font-semibold text-sm">{fmtM(recVal)}/yr</span>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">{fmtM(rec20)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{label}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{c.state ?? "—"}</TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
