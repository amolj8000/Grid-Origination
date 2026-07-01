import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Zap, AlertCircle } from "lucide-react";
import { useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, Legend, ReferenceLine,
} from "recharts";

const TS = { backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc", fontSize: 11 };

const NODES  = ["NP15", "SP15", "ZP26"];
const YEARS  = ["2024", "2025", "2026"];
const MONTHS = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function hourLabel(h: number) {
  if (h === 0) return "12a";
  if (h < 12)  return `${h}a`;
  if (h === 12) return "12p";
  return `${h - 12}p`;
}

function basisColor(v: number) {
  if (v < -15) return "#ef4444";
  if (v < -5)  return "#f59e0b";
  if (v > 15)  return "#ef4444";
  if (v > 5)   return "#f59e0b";
  return "#14b8a6";
}

interface HourlyPoint {
  hour: number;
  label: string;
  daPrice: number | null;
  rtPrice: number | null;
  basis: number | null;
}

interface HourlyResponse {
  node: string;
  year: number;
  month: number;
  totalRows: number;
  hourly: { hour: number; daPrice: number | null; rtPrice: number | null }[];
}

interface CoverageMonth { node: string; year: number; month: number; rowCount: number; }
interface CoverageResponse { totalRows: number; months: CoverageMonth[]; }

export default function CaisoHourly() {
  const [node,  setNode]  = useState("SP15");
  const [year,  setYear]  = useState("2024");
  const [month, setMonth] = useState("7");

  const hourlyQ = useQuery<HourlyResponse>({
    queryKey: ["caiso-hub-hourly", node, year, month],
    queryFn: () =>
      fetch(`/api/caiso/hub-hourly?node=${encodeURIComponent(node)}&year=${year}&month=${month}`)
        .then(r => r.json()),
    staleTime: 300_000,
  });

  const coverageQ = useQuery<CoverageResponse>({
    queryKey: ["caiso-hub-hourly-coverage"],
    queryFn: () => fetch("/api/caiso/hub-hourly/coverage").then(r => r.json()),
    staleTime: 60_000,
  });

  const data = hourlyQ.data;
  const totalRows = data?.totalRows ?? 0;
  const hasData = (data?.hourly?.length ?? 0) > 0;
  const seededMonths = coverageQ.data?.months.length ?? 0;
  const totalExpected = 3 * 29; // 3 nodes × 29 months

  const chartData: HourlyPoint[] = (data?.hourly ?? []).map(r => ({
    hour: r.hour,
    label: hourLabel(r.hour),
    daPrice: r.daPrice,
    rtPrice: r.rtPrice,
    basis: r.daPrice != null && r.rtPrice != null
      ? parseFloat((r.rtPrice - r.daPrice).toFixed(4))
      : null,
  }));

  const summary = hasData ? (() => {
    const validDA  = chartData.filter(r => r.daPrice != null);
    const validRT  = chartData.filter(r => r.rtPrice != null);
    const validBas = chartData.filter(r => r.basis != null);
    const avgDA    = validDA.length  ? (validDA.reduce((s, r) => s + r.daPrice!, 0) / validDA.length).toFixed(2) : "N/A";
    const avgRT    = validRT.length  ? (validRT.reduce((s, r) => s + r.rtPrice!, 0) / validRT.length).toFixed(2) : "N/A";
    const bases    = validBas.map(r => r.basis!).sort((a, b) => a - b);
    const avgBasis = bases.length ? (bases.reduce((s, v) => s + v, 0) / bases.length).toFixed(2) : "N/A";
    const p5  = bases.length ? bases[Math.floor(bases.length * 0.05)]?.toFixed(2) : "N/A";
    const p95 = bases.length ? bases[Math.floor(bases.length * 0.95)]?.toFixed(2) : "N/A";
    // Find lowest DA hour (duck curve trough)
    const minDA = validDA.reduce((min, r) => r.daPrice! < min.daPrice! ? r : min, validDA[0]);
    const maxDA = validDA.reduce((max, r) => r.daPrice! > max.daPrice! ? r : max, validDA[0]);
    const captureRatio = validDA.length && validRT.length
      ? ((parseFloat(avgRT) / parseFloat(avgDA)) * 100).toFixed(1)
      : "N/A";
    return { avgDA, avgRT, avgBasis, p5, p95, captureRatio,
             troughHour: minDA?.label ?? "N/A", troughPrice: minDA?.daPrice?.toFixed(2) ?? "N/A",
             peakHour: maxDA?.label ?? "N/A", peakPrice: maxDA?.daPrice?.toFixed(2) ?? "N/A" };
  })() : null;

  const nodeColor = node === "NP15" ? "#14b8a6" : node === "SP15" ? "#f59e0b" : "#8b5cf6";

  // Coverage heatmap data
  const covMonths = coverageQ.data?.months ?? [];
  const covGrid = NODES.map(n => ({
    node: n,
    months: YEARS.flatMap(y =>
      [1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
        const found = covMonths.find(c => c.node === n && c.year === parseInt(y) && c.month === m);
        return { year: y, month: m, label: `${MONTHS[m]} ${y}`, seeded: !!found, rows: found?.rowCount ?? 0 };
      })
    ),
  }));

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" />
            CAISO Hourly Price Data
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Real DA + RT hourly price profiles · NP15, SP15, ZP26 trading hubs · CAISO OASIS public API
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {totalRows > 0 ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">
              {totalRows.toLocaleString()} rows loaded
            </Badge>
          ) : (
            <Badge variant="outline" className="border-slate-500/40 text-slate-400 text-xs flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Seeding in progress
            </Badge>
          )}
          <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">
            {seededMonths}/{totalExpected} months seeded
          </Badge>
        </div>
      </div>

      {/* Seeding status banner */}
      {totalRows === 0 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-400">Data seeding in progress</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Run <code className="font-mono bg-muted px-1 rounded">pnpm --filter @workspace/scripts run seed-caiso-hourly</code> to populate this table.
                  ~63k rows total (3 nodes × 29 months × ~720 hrs). Takes ~15 min due to OASIS rate limits.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Selectors */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Hub:</span>
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="w-28 h-8 text-xs border-border bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NODES.map(n => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Year:</span>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-24 h-8 text-xs border-border bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Month:</span>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-24 h-8 text-xs border-border bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                <SelectItem key={m} value={String(m)} className="text-xs">{MONTHS[m]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {hourlyQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-3">
          {[
            { label: "Avg DA",        value: `$${summary.avgDA}`,      color: "text-indigo-400" },
            { label: "Avg RT",        value: `$${summary.avgRT}`,      color: "text-amber-400" },
            { label: "Capture Ratio", value: `${summary.captureRatio}%`, color: summary.captureRatio !== "N/A" && parseFloat(summary.captureRatio) < 90 ? "text-amber-400" : "text-teal-400" },
            { label: "Avg Basis",     value: `$${summary.avgBasis}`,   color: "text-foreground" },
            { label: "Basis P5",      value: `$${summary.p5}`,         color: "text-slate-400" },
            { label: "Basis P95",     value: `$${summary.p95}`,        color: "text-slate-400" },
            { label: "Trough Hour",   value: summary.troughHour,       color: "text-teal-400" },
            { label: "Trough DA",     value: `$${summary.troughPrice}`,color: "text-teal-400" },
            { label: "Peak DA",       value: `$${summary.peakPrice}`,  color: "text-amber-400" },
          ].map(s => (
            <Card key={s.label} className="bg-card border-border">
              <CardContent className="pt-3 pb-3">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className={`font-mono font-bold text-base ${s.color}`}>{s.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Duck curve callout for SP15 solar */}
      {node === "SP15" && hasData && summary && parseFloat(summary.captureRatio) < 92 && (
        <Card className="bg-amber-500/5 border-amber-500/20">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">
              <span className="font-semibold">Duck curve effect:</span> SP15 solar generation peaks between 10a–2p when DA prices are lowest ({summary.troughHour} @ ${summary.troughPrice}/MWh).
              Capture ratio {summary.captureRatio}% — SP15 solar PPAs face this shape mismatch vs flat-price contracts.
              Battery storage co-location can shift capture to 6p–8p peak.
            </p>
          </CardContent>
        </Card>
      )}

      {!hasData && !hourlyQ.isLoading && totalRows > 0 && (
        <Card className="bg-card border-border">
          <CardContent className="pt-6 pb-6 text-center text-muted-foreground text-sm">
            No data for {node} · {MONTHS[parseInt(month)]} {year}. Select a different month or node.
          </CardContent>
        </Card>
      )}

      {hasData && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Hourly DA vs RT profile */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Avg Hourly DA vs RT — {node} · {MONTHS[parseInt(month)]} {year}
              </CardTitle>
              <CardDescription className="text-xs">
                Average across all days in selected month · CAISO OASIS PRC_LMP · DA=DAM, RT=HASP
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={2} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v}`} />
                    <RechartsTooltip
                      contentStyle={TS}
                      formatter={(v: number, n: string) => [v != null ? `$${v.toFixed(2)}/MWh` : "N/A", n]}
                    />
                    <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                    <Line type="monotone" dataKey="daPrice" name="DA" stroke="#6366f1" strokeWidth={2} dot={false} connectNulls />
                    <Line type="monotone" dataKey="rtPrice" name="RT" stroke={nodeColor} strokeWidth={2} dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Basis (RT − DA) */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                Hourly RT − DA Basis — {node} · {MONTHS[parseInt(month)]} {year}
              </CardTitle>
              <CardDescription className="text-xs">
                Negative = RT below DA (curtailment signal) · Red = severe · Amber = moderate
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={2} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v}`} />
                    <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                    <RechartsTooltip
                      contentStyle={TS}
                      formatter={(v: number) => [v != null ? `$${v.toFixed(2)}/MWh` : "N/A", "RT − DA Basis"]}
                    />
                    <Bar dataKey="basis" radius={[2, 2, 0, 0]} isAnimationActive={false}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.basis != null ? basisColor(d.basis) : "#475569"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Full overlay bar chart */}
      {hasData && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Full 24-Hour Price Overlay — DA vs RT</CardTitle>
            <CardDescription className="text-xs">
              {node} · {MONTHS[parseInt(month)]} {year} · Averaged across all days in month
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} barSize={14} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v}`} />
                  <RechartsTooltip
                    contentStyle={TS}
                    formatter={(v: number, n: string) => [v != null ? `$${v.toFixed(2)}/MWh` : "N/A", n]}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                  <Bar dataKey="daPrice" name="DA" fill="#6366f1" radius={[2, 2, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="rtPrice" name="RT" fill={nodeColor} radius={[2, 2, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Coverage heatmap */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Data Coverage — Seeded Months by Node</CardTitle>
          <CardDescription className="text-xs">
            Teal = seeded · Empty = not yet seeded · Run seed-caiso-hourly to fill gaps
          </CardDescription>
        </CardHeader>
        <CardContent>
          {coverageQ.isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <div className="space-y-3">
              {covGrid.map(({ node: n, months }) => (
                <div key={n} className="flex items-center gap-2">
                  <span className="text-xs font-mono w-10 text-muted-foreground">{n}</span>
                  <div className="flex gap-[3px] flex-wrap">
                    {months.map(m => (
                      <div
                        key={`${m.year}-${m.month}`}
                        title={`${m.label}: ${m.seeded ? m.rows.toLocaleString() + " rows" : "not seeded"}`}
                        className="w-4 h-4 rounded-sm"
                        style={{ background: m.seeded ? "#14b8a6" : "#1e293b", border: "1px solid #334155" }}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-xs text-muted-foreground mt-2">
                Jan 2024 → May 2026 · 3 nodes · expected ~63k rows total
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Data source */}
      <Card className="bg-card/50 border-border/50">
        <CardContent className="pt-3 pb-3">
          <p className="text-xs text-muted-foreground">
            <span className="text-amber-400 font-medium">Data source:</span> CAISO OASIS public API — PRC_LMP query.
            DA prices from DAM (Day-Ahead Market). RT prices from HASP (Hour-Ahead Scheduling Process, 15-min intervals averaged to hourly).
            Nodes: TH_SP15_GEN-APND (SP15 Southern CA), TH_NP15_GEN-APND (NP15 Northern CA), TH_ZP26_GEN-APND (ZP26 Bay Area).
            Note: SP15 solar capture ratio typically 75–85% of DA due to midday duck curve curtailment — directly impacts the economics of solar VPPA settlements in Southern California.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
