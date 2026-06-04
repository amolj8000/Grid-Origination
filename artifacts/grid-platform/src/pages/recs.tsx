import { useState, useMemo } from "react";
import { useListCandidates } from "@workspace/api-client-react";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, PieChart, Pie, Legend,
} from "recharts";
import {
  Loader2, Search, ArrowUpDown, Leaf, Sun, Wind, Droplets, Zap, Info,
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
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M MWh`;
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

export default function RECAnalysis() {
  const [search, setSearch]         = useState("");
  const [marketFilter, setMarket]   = useState<string | undefined>(undefined);
  const [typeFilter, setType]       = useState<string | undefined>(undefined);
  const [sortField, setSortField]   = useState<SortField>("annualRecValueUsd");
  const [sortDir, setSortDir]       = useState<"desc" | "asc">("desc");

  const { data: all, isLoading } = useListCandidates({});

  const eligible = useMemo(() => {
    if (!all) return [];
    return (all as any[]).filter(c => c.recEligible === true);
  }, [all]);

  const filtered = useMemo(() => {
    let rows = eligible;
    if (marketFilter) rows = rows.filter(c => c.market === marketFilter);
    if (typeFilter)   rows = rows.filter(c => c.assetType === typeFilter);
    if (search)       rows = rows.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || (c.state ?? "").toLowerCase().includes(search.toLowerCase()));
    return [...rows].sort((a, b) => {
      const av = (a as any)[sortField] ?? 0;
      const bv = (b as any)[sortField] ?? 0;
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [eligible, marketFilter, typeFilter, search, sortField, sortDir]);

  const stats = useMemo(() => {
    if (!eligible.length) return null;
    const totalAnnualMwh   = eligible.reduce((s, c) => s + ((c as any).annualRecMwh  ?? 0), 0);
    const totalAnnualValue = eligible.reduce((s, c) => s + ((c as any).annualRecValueUsd ?? 0), 0);
    const total20yr        = eligible.reduce((s, c) => s + ((c as any).lifetimeRecValue20yr ?? 0), 0);
    const avgPrice = totalAnnualMwh > 0
      ? (eligible.reduce((s, c) => s + ((c as any).recPricePerMwh ?? 0) * ((c as any).annualRecMwh ?? 0), 0) / totalAnnualMwh)
      : 0;
    return { totalAnnualMwh, totalAnnualValue, total20yr, avgPrice, count: eligible.length };
  }, [eligible]);

  const marketData = useMemo(() => {
    const m: Record<string, { annualValue: number; annualMwh: number; count: number }> = {};
    eligible.forEach(c => {
      const mkt = c.market;
      if (!m[mkt]) m[mkt] = { annualValue: 0, annualMwh: 0, count: 0 };
      m[mkt].annualValue += (c as any).annualRecValueUsd ?? 0;
      m[mkt].annualMwh   += (c as any).annualRecMwh    ?? 0;
      m[mkt].count++;
    });
    return Object.entries(m).map(([market, d]) => ({ market, ...d }))
      .sort((a, b) => b.annualValue - a.annualValue);
  }, [eligible]);

  const typeData = useMemo(() => {
    const t: Record<string, { annualValue: number; count: number }> = {};
    eligible.forEach(c => {
      const tp = c.assetType;
      if (!t[tp]) t[tp] = { annualValue: 0, count: 0 };
      t[tp].annualValue += (c as any).annualRecValueUsd ?? 0;
      t[tp].count++;
    });
    return Object.entries(t).map(([type, d]) => ({ type, ...d, fill: TYPE_COLORS[type] ?? "#94a3b8" }))
      .sort((a, b) => b.annualValue - a.annualValue);
  }, [eligible]);

  const top20 = useMemo(() =>
    [...eligible]
      .sort((a, b) => ((b as any).annualRecValueUsd ?? 0) - ((a as any).annualRecValueUsd ?? 0))
      .slice(0, 20)
      .map(c => ({
        name: c.name.length > 22 ? c.name.slice(0, 22) + "…" : c.name,
        value: Math.round(((c as any).annualRecValueUsd ?? 0) / 1_000),
        fill: MARKET_COLORS[c.market] ?? "#94a3b8",
      })),
    [eligible]
  );

  const handleSort = (f: SortField) => {
    if (sortField === f) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortField(f); setSortDir("desc"); }
  };

  const SortHead = ({ field, label, right }: { field: SortField; label: string; right?: boolean }) => (
    <button
      className={`flex items-center gap-1 hover:text-primary transition-colors ${sortField === field ? "text-primary" : ""} ${right ? "ml-auto" : ""}`}
      onClick={() => handleSort(field)}
    >
      {label}
      <ArrowUpDown className="h-3 w-3" />
    </button>
  );

  return (
    <TooltipProvider>
      <div className="p-6 h-full flex flex-col space-y-5">

        {/* Header */}
        <div className="shrink-0">
          <div className="flex items-center gap-2 mb-0.5">
            <Leaf className="h-5 w-5 text-emerald-400" />
            <h1 className="text-2xl font-bold tracking-tight">REC Analysis</h1>
          </div>
          <p className="text-muted-foreground text-sm">
            Renewable Energy Credit valuation across EIA 860 eligible generators — solar, wind, hydro, geothermal, and biomass only.
          </p>
        </div>

        {/* Info banner */}
        <div className="shrink-0 flex items-start gap-2 text-xs text-muted-foreground bg-card border border-border rounded-md px-3 py-2">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">Methodology: </span>
            Annual RECs (MWh) = capacity × capacity factor × 8,760 h. Benchmark prices: ERCOT Texas TRC ~$1.50/MWh (large, liquid market) · CAISO WREGIS RPS solar $12, wind $10, hydro $7, geo $10 · PJM solar SREC $15, wind $3.50, offshore OREC $120, hydro $2. Storage, gas, and nuclear generate no RECs.
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
                    <div className="text-xs text-muted-foreground mt-0.5">of 3,875 EIA 860</div>
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
              {/* Top 20 bar chart */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Top 20 Plants by Annual REC Value</CardTitle>
                  <CardDescription className="text-xs">
                    Color = market: <span style={{ color: MARKET_COLORS.ERCOT }}>ERCOT</span> · <span style={{ color: MARKET_COLORS.CAISO }}>CAISO</span> · <span style={{ color: MARKET_COLORS.PJM }}>PJM</span>
                  </CardDescription>
                </CardHeader>
                <CardContent style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={top20} layout="vertical" margin={{ top: 0, right: 20, left: 130, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" horizontal={false} />
                      <XAxis type="number" stroke="#64748b" tick={{ fill: "#64748b", fontSize: 10 }} tickFormatter={v => `$${v}k`} />
                      <YAxis dataKey="name" type="category" stroke="#64748b" tick={{ fill: "#94a3b8", fontSize: 10 }} width={128} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`$${v.toLocaleString()}k/yr`]} />
                      <Bar isAnimationActive={false} dataKey="value" name="Annual REC" radius={[0, 4, 4, 0]}>
                        {top20.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* By type pie */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Annual Value by Type</CardTitle>
                  <CardDescription className="text-xs">Share of total REC revenue</CardDescription>
                </CardHeader>
                <CardContent style={{ height: 240 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        isAnimationActive={false}
                        data={typeData}
                        cx="40%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={80}
                        paddingAngle={2}
                        dataKey="annualValue"
                        nameKey="type"
                      >
                        {typeData.map((entry, i) => <Cell key={i} fill={entry.fill} stroke="transparent" />)}
                      </Pie>
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [fmtM(v)]} />
                      <Legend
                        layout="vertical"
                        align="right"
                        verticalAlign="middle"
                        formatter={(v) => <span style={{ color: "#f8fafc", fontSize: 11 }}>{v}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            {/* Market summary cards */}
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
                </SelectContent>
              </Select>
              <div className="ml-auto text-xs text-muted-foreground self-center">
                {filtered.length.toLocaleString()} eligible plants
              </div>
            </div>

            {/* Table */}
            <div className="border rounded-md flex-1 overflow-auto bg-card">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                  <TableRow>
                    <TableHead className="w-8 text-xs">#</TableHead>
                    <TableHead className="w-[220px]">Plant</TableHead>
                    <TableHead>Market</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">
                      <SortHead field="capacityMw" label="MW" right />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="annualRecMwh" label="RECs/yr" right />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="recPricePerMwh" label="$/MWh" right />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="annualRecValueUsd" label="Annual Value" right />
                    </TableHead>
                    <TableHead className="text-right">
                      <SortHead field="lifetimeRecValue20yr" label="20yr Value" right />
                    </TableHead>
                    <TableHead>REC Market</TableHead>
                    <TableHead className="text-xs text-muted-foreground">State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                        No eligible plants match the current filters.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((c, idx) => {
                      const recMwh  = (c as any).annualRecMwh       ?? 0;
                      const recVal  = (c as any).annualRecValueUsd   ?? 0;
                      const rec20   = (c as any).lifetimeRecValue20yr ?? 0;
                      const price   = (c as any).recPricePerMwh      ?? 0;
                      const label   = (c as any).recMarketLabel       ?? "";
                      return (
                        <TableRow key={c.id} className="hover:bg-muted/30 text-sm">
                          <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                          <TableCell>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="font-medium truncate block max-w-[200px] cursor-default">
                                  {c.name}
                                </span>
                              </TooltipTrigger>
                              <TooltipContent side="right" className="text-xs max-w-[220px]">
                                <p className="font-semibold mb-1">{c.name}</p>
                                {c.notes && <p className="text-muted-foreground">{c.notes.replace("Source: EIA 860 2024 | ", "")}</p>}
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
                              <TypeIcon type={c.assetType} />
                              <span className="text-xs capitalize">{c.assetType.replace(/_/g, " ")}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            {parseFloat(c.capacityMw as any).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right text-xs">
                            {recMwh.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right text-xs font-medium">
                            ${price.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <span className="text-emerald-400 font-semibold text-sm">{fmtM(recVal)}/yr</span>
                          </TableCell>
                          <TableCell className="text-right text-xs text-muted-foreground">
                            {fmtM(rec20)}
                          </TableCell>
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
