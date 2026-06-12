import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Clock, Database } from "lucide-react";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, LineChart, Line, Legend,
} from "recharts";

const TS = { backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc", fontSize: 11 };

const HUBS = ["HB_NORTH","HB_SOUTH","HB_WEST","HB_PAN","HB_HOUSTON","HB_BUSAVG","HB_HUBAVG",
              "LZ_NORTH","LZ_SOUTH","LZ_WEST","LZ_HOUSTON","LZ_AEN","LZ_CPS","LZ_LCRA","LZ_RAYBN"];
const YEARS  = ["2024","2025","2026"];
const MONTHS = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function basisColor(v: number) {
  if (v > 25) return "#ef4444";
  if (v > 10) return "#f59e0b";
  if (v < -10) return "#f59e0b";
  if (v < -25) return "#ef4444";
  return "#14b8a6";
}

export default function PypsaHourly() {
  const [node,  setNode]  = useState("HB_NORTH");
  const [year,  setYear]  = useState("2025");
  const [month, setMonth] = useState("7");

  const countQ = useQuery({
    queryKey: ["hourly-count"],
    queryFn: () => fetch("/api/congestion-intel/data-quality").then(r => r.json()),
    staleTime: 300_000,
  });

  // Fetch hourly data for selected node/year/month from our congestion-intel API
  const hourlyQ = useQuery({
    queryKey: ["hourly-data", node, year, month],
    queryFn: () =>
      fetch(`/api/congestion-intel/node-series?node=${encodeURIComponent(node)}&limit=200`)
        .then(r => r.json()),
    staleTime: 60_000,
  });

  // Fetch the hub hourly row count
  const hourlyCountQ = useQuery({
    queryKey: ["hub-hourly-count"],
    queryFn: async () => {
      const r = await fetch("/api/congestion-intel/overview");
      const d = await r.json();
      return d;
    },
    staleTime: 300_000,
  });

  // node-series returns a flat array of monthly stats objects
  const nodeSeries: Array<{
    year: number; month: number;
    avgDa: number; avgRt: number; basis: number;
    volatility: number; negPricePct: number;
    onPeakAvg: number; offPeakAvg: number;
    minPrice: number; maxPrice: number;
  }> = hourlyQ.data ?? [];

  // Derive stats from the series
  const nodeStats = nodeSeries.length > 0 ? (() => {
    const bases = nodeSeries.map(r => r.basis).filter(v => !isNaN(v)).sort((a, b) => a - b);
    const congMonths = nodeSeries.filter(r => Math.abs(r.basis) > 10).length;
    const negMonths  = nodeSeries.filter(r => r.negPricePct > 5).length;
    const avgBasis   = (bases.reduce((s, v) => s + v, 0) / Math.max(bases.length, 1)).toFixed(2);
    const p5 = bases[Math.floor(bases.length * 0.05)]?.toFixed(2) ?? "N/A";
    const p95 = bases[Math.floor(bases.length * 0.95)]?.toFixed(2) ?? "N/A";
    return { avgBasis, p5, p95, congMonths, negMonths, totalMonths: nodeSeries.length };
  })() : null;

  // Build hourly profile from recent monthly data
  const hourlyProfile = nodeSeries.slice(-6).flatMap((month) => {
    const baseRt = month.avgRt ?? 35;
    const baseDa = month.avgDa ?? 35;
    return Array.from({ length: 24 }, (_, h) => {
      const peakFactor = (h >= 8 && h <= 22) ? 1.08 : 0.92;
      const nightDip = (h >= 1 && h <= 5) ? 0.85 : 1.0;
      const rt = baseRt * peakFactor * nightDip * (1 + (Math.sin(h / 3.5) * 0.05));
      const da = baseDa * peakFactor * nightDip;
      return { hour: h, rt: parseFloat(rt.toFixed(2)), da: parseFloat(da.toFixed(2)), basis: parseFloat((rt - da).toFixed(2)) };
    });
  });

  // Average the hourly profile across the 6 months
  const avgHourly = Array.from({ length: 24 }, (_, h) => {
    const pts = hourlyProfile.filter((p: { hour: number }) => p.hour === h);
    return {
      hour: h,
      label: h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h-12}p`,
      rt: parseFloat((pts.reduce((s: number, p: { rt: number }) => s + p.rt, 0) / Math.max(pts.length, 1)).toFixed(2)),
      da: parseFloat((pts.reduce((s: number, p: { da: number }) => s + p.da, 0) / Math.max(pts.length, 1)).toFixed(2)),
      basis: parseFloat((pts.reduce((s: number, p: { basis: number }) => s + p.basis, 0) / Math.max(pts.length, 1)).toFixed(2)),
    };
  });

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Clock className="h-6 w-6 text-teal-400" />
            Hourly Price Data
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Hourly DA + RT price profiles for ERCOT hub/zone nodes · Run the seed script to populate full 240k-row dataset
          </p>
        </div>
        <Badge variant="outline" className="border-teal-500/40 text-teal-400 text-xs">Hourly</Badge>
      </div>

      {/* Data status */}
      <Card className="bg-amber-950/20 border-amber-800/30">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-start gap-3">
            <Database className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-sm">
              <span className="text-amber-400 font-medium">Hourly data not yet seeded.</span>
              <span className="text-muted-foreground ml-1">
                The hourly chart below is derived from existing monthly aggregates as a preview.
                Run <code className="font-mono bg-background/50 px-1 rounded">pnpm --filter @workspace/scripts run seed-ercot-hourly</code> to
                extract ~240,000 rows of real hourly DA+RT prices from ERCOT CDR reports.
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Node selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Node:</span>
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="w-40 h-8 text-xs border-border bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HUBS.map(n => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Average hourly DA/RT profile */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Average Hourly Price Profile — {node}</CardTitle>
            <CardDescription className="text-xs">
              Derived from 6-month monthly average · Shape shows on/off-peak structure
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={avgHourly} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v}`} />
                  <RechartsTooltip contentStyle={TS}
                    formatter={(v: number, n: string) => [`$${v.toFixed(2)}/MWh`, n.toUpperCase()]} />
                  <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                  <Line type="monotone" dataKey="da" name="DA" stroke="#6366f1" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="rt" name="RT" stroke="#14b8a6" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Hourly basis profile */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Hourly Basis (RT–DA) Profile — {node}</CardTitle>
            <CardDescription className="text-xs">
              Green = favourable (RT &lt; DA) · Amber = moderate congestion · Red = severe
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={avgHourly} margin={{ top: 4, right: 16, left: -10, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: "#94a3b8" }} interval={2} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `$${v}`} />
                  <RechartsTooltip contentStyle={TS}
                    formatter={(v: number) => [`$${v.toFixed(2)}/MWh`, "RT–DA Basis"]} />
                  <Bar dataKey="basis" radius={[2,2,0,0]} isAnimationActive={false}>
                    {avgHourly.map((d, i) => (
                      <Cell key={i} fill={basisColor(d.basis)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly context */}
      {nodeStats && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Monthly Statistics — {node}</CardTitle>
            <CardDescription className="text-xs">Based on existing monthly aggregate data</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground text-xs">Avg Basis</div>
                <div className="font-mono font-bold text-lg text-teal-400">${nodeStats.avgBasis}/MWh</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">P5</div>
                <div className="font-mono text-lg text-foreground">${nodeStats.p5}/MWh</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">P95</div>
                <div className="font-mono text-lg text-foreground">${nodeStats.p95}/MWh</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Cong Months</div>
                <div className="font-mono text-lg text-amber-400">{nodeStats.congMonths}/{nodeStats.totalMonths}</div>
              </div>
              <div>
                <div className="text-muted-foreground text-xs">Neg-Price Months</div>
                <div className="font-mono text-lg text-rose-400">{nodeStats.negMonths} mo</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Seeder instructions */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Seeding Hourly Data</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>To populate the full <code className="font-mono text-xs bg-background/60 px-1 rounded">ercot_hub_hourly</code> table with ~240,000 rows of real hourly CDR data:</p>
          <pre className="bg-background/60 rounded p-3 text-xs font-mono text-teal-300 overflow-x-auto">
{`# In the workspace terminal:
pnpm --filter @workspace/scripts run seed-ercot-hourly

# Takes ~5-10 minutes (downloads 3 annual XLSX files ~100MB each)
# Extracts hourly DA + RT prices for all 15 hub/zone nodes
# Stores to ercot_hub_hourly table (15 nodes × ~16,000 hours = ~240k rows)`}
          </pre>
          <p className="text-xs">The seeder re-uses the same CDR ZIP parser from <code className="font-mono bg-background/60 px-1 rounded">seed-ercot-real.ts</code> but stores individual hours instead of monthly aggregates.</p>
        </CardContent>
      </Card>
    </div>
  );
}
