import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Loader2, Zap, Activity, TrendingUp, Wind } from "lucide-react";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

const BASE = "/pypsa";
const TS = { backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc", fontSize: 11 };

function lmpColor(lmp: number, min: number, max: number) {
  if (max === min) return "#14b8a6";
  const t = (lmp - min) / (max - min);
  if (t < 0.33) return "#14b8a6";
  if (t < 0.66) return "#f59e0b";
  return "#ef4444";
}

function loadingColor(pct: number) {
  if (pct >= 95) return "#ef4444";
  if (pct >= 70) return "#f59e0b";
  return "#22c55e";
}

// Simple SVG schematic of ERCOT 5-bus network
// Approximate positions: NORTH=top-center, WEST=left, PAN=top-left, SOUTH=bottom-left, HOUSTON=right
const BUS_POS: Record<string, { cx: number; cy: number }> = {
  NORTH:   { cx: 300, cy: 100 },
  WEST:    { cx: 110, cy: 210 },
  PAN:     { cx: 80,  cy: 90  },
  SOUTH:   { cx: 180, cy: 320 },
  HOUSTON: { cx: 440, cy: 260 },
};

const LINE_PAIRS = [
  ["NORTH", "HOUSTON"],
  ["NORTH", "WEST"],
  ["NORTH", "SOUTH"],
  ["WEST",  "PAN"],
  ["WEST",  "SOUTH"],
  ["SOUTH", "HOUSTON"],
];

interface OPFResult {
  status: string;
  system_load_mw: number;
  avg_lmp: number;
  max_lmp: number;
  min_lmp: number;
  lmp_spread: number;
  wind_mw: number;
  solar_mw: number;
  nuclear_mw: number;
  gas_mw: number;
  renewable_pct: number;
  total_cost_per_hour: number;
  congested_lines: number;
  buses: Array<{
    id: string; hub: string; label: string;
    lmp: number; load_mw: number; gen_mw: number; net_export_mw: number;
  }>;
  lines: Array<{
    name: string; bus0: string; bus1: string;
    flow_mw: number; capacity_mw: number; loading_pct: number;
    congestion_rent_k$: number; is_congested: boolean;
  }>;
  generators: Array<{
    name: string; bus: string; carrier: string;
    dispatch_mw: number; capacity_mw: number; cf: number; marginal_cost: number;
  }>;
}

export default function PypsaNetwork() {
  const [windCf,  setWindCf]  = useState(55);  // default: high-wind scenario shows CREZ congestion
  const [solarCf, setSolarCf] = useState(25);
  const [gasPrice, setGasPrice] = useState(350);  // cents → divide by 100
  const [loadMw,  setLoadMw]  = useState(55000);
  const [dirty, setDirty] = useState(false);

  const defaultQ = useQuery<OPFResult>({
    queryKey: ["pypsa-opf-default"],
    queryFn: () => fetch(`${BASE}/opf/default`).then(r => r.json()),
    staleTime: 60_000,
  });

  const [customResult, setCustomResult] = useState<OPFResult | null>(null);
  const opfMut = useMutation({
    mutationFn: (params: object) =>
      fetch(`${BASE}/opf`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }).then(r => r.json()),
    onSuccess: (data) => { setCustomResult(data); setDirty(false); },
  });

  const result: OPFResult | undefined = customResult ?? defaultQ.data;
  const loading = defaultQ.isLoading || opfMut.isPending;

  const busMap = Object.fromEntries((result?.buses ?? []).map(b => [b.id, b]));
  const lmpMin = result ? Math.min(...result.buses.map(b => b.lmp)) : 0;
  const lmpMax = result ? Math.max(...result.buses.map(b => b.lmp)) : 1;

  const lineMap = Object.fromEntries((result?.lines ?? []).map(l => [l.name, l]));
  const lineKey = (a: string, b: string) =>
    [a, b].sort().join("-") in lineMap ? [a, b].sort().join("-") :
    `${a}-${b}` in lineMap ? `${a}-${b}` : `${b}-${a}`;

  function getLine(a: string, b: string) {
    return result?.lines?.find(l => (l.bus0 === a && l.bus1 === b) || (l.bus0 === b && l.bus1 === a));
  }

  const genByCarrier = ["gas", "wind", "solar", "nuclear"].map(c => ({
    carrier: c,
    dispatch: (result?.generators ?? []).filter(g => g.carrier === c).reduce((s, g) => s + g.dispatch_mw, 0),
    capacity: (result?.generators ?? []).filter(g => g.carrier === c).reduce((s, g) => s + g.capacity_mw, 0),
  }));

  const carrierColors: Record<string, string> = {
    gas: "#f59e0b", wind: "#14b8a6", solar: "#fbbf24", nuclear: "#8b5cf6",
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="h-6 w-6 text-amber-400" />
            PyPSA Network — ERCOT 5-Bus Model
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Reduced-order DC optimal power flow · 5 geographic zones · HiGHS LP solver
          </p>
        </div>
        <Badge variant="outline" className="border-amber-500/40 text-amber-400 text-xs">DC OPF</Badge>
      </div>

      {/* Scenario controls */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">Scenario Parameters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">System Load</span>
                <span className="font-mono text-teal-400">{(loadMw/1000).toFixed(0)} GW</span>
              </div>
              <Slider min={30000} max={75000} step={1000} value={[loadMw]}
                onValueChange={([v]) => { setLoadMw(v); setDirty(true); }} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Wind CF</span>
                <span className="font-mono text-teal-400">{windCf}%</span>
              </div>
              <Slider min={5} max={65} step={1} value={[windCf]}
                onValueChange={([v]) => { setWindCf(v); setDirty(true); }} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Solar CF</span>
                <span className="font-mono text-amber-400">{solarCf}%</span>
              </div>
              <Slider min={0} max={35} step={1} value={[solarCf]}
                onValueChange={([v]) => { setSolarCf(v); setDirty(true); }} />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Gas Price</span>
                <span className="font-mono text-orange-400">${(gasPrice/100).toFixed(2)}/MMBtu</span>
              </div>
              <Slider min={200} max={800} step={10} value={[gasPrice]}
                onValueChange={([v]) => { setGasPrice(v); setDirty(true); }} />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3">
            <Button size="sm" variant={dirty ? "default" : "outline"}
              className={dirty ? "bg-teal-600 hover:bg-teal-700" : ""}
              disabled={opfMut.isPending}
              onClick={() => opfMut.mutate({
                system_load_mw: loadMw,
                wind_cf: windCf / 100,
                solar_cf: solarCf / 100,
                gas_price_mmbtu: gasPrice / 100,
              })}>
              {opfMut.isPending ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Running OPF...</> : "Run OPF"}
            </Button>
            {dirty && <span className="text-xs text-muted-foreground">Parameters changed — click Run OPF to update</span>}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span>Running DC optimal power flow...</span>
        </div>
      )}

      {result && !loading && (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { label: "Avg LMP", value: `$${result.avg_lmp.toFixed(2)}`, sub: "/MWh", color: "text-teal-400" },
              { label: "LMP Spread", value: `$${result.lmp_spread.toFixed(2)}`, sub: "/MWh", color: result.lmp_spread > 5 ? "text-amber-400" : "text-teal-400" },
              { label: "Renewable", value: `${result.renewable_pct.toFixed(1)}%`, sub: "of gen", color: "text-emerald-400" },
              { label: "Wind", value: `${(result.wind_mw/1000).toFixed(1)} GW`, sub: "dispatched", color: "text-teal-400" },
              { label: "Total Cost", value: `$${(result.total_cost_per_hour/1000).toFixed(0)}k`, sub: "/hour", color: "text-amber-400" },
              { label: "Congested", value: result.congested_lines.toString(), sub: "lines", color: result.congested_lines > 0 ? "text-red-400" : "text-emerald-400" },
            ].map(kpi => (
              <Card key={kpi.label} className="bg-card border-border">
                <CardContent className="pt-3 pb-2 px-3">
                  <div className="text-xs text-muted-foreground">{kpi.label}</div>
                  <div className={`text-xl font-bold font-mono ${kpi.color}`}>{kpi.value}</div>
                  <div className="text-xs text-muted-foreground">{kpi.sub}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Network schematic */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Network Topology — Nodal LMPs</CardTitle>
                <CardDescription className="text-xs">
                  Node color = LMP level (teal→amber→red). Line thickness = loading %.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <svg viewBox="0 0 540 420" className="w-full" style={{ background: "#0a1628", borderRadius: 8 }}>
                  {/* Transmission lines */}
                  {LINE_PAIRS.map(([a, b]) => {
                    const pa = BUS_POS[a], pb = BUS_POS[b];
                    const line = getLine(a, b);
                    const lp = line?.loading_pct ?? 0;
                    const color = loadingColor(lp);
                    const sw = Math.max(1.5, Math.min(6, lp / 15));
                    return (
                      <g key={`${a}-${b}`}>
                        <line x1={pa.cx} y1={pa.cy} x2={pb.cx} y2={pb.cy}
                          stroke={color} strokeWidth={sw} strokeOpacity={0.8} />
                        {line && (
                          <text
                            x={(pa.cx + pb.cx) / 2}
                            y={(pa.cy + pb.cy) / 2 - 5}
                            fontSize="9" fill={color} textAnchor="middle" fontFamily="monospace">
                            {line.loading_pct.toFixed(0)}%
                          </text>
                        )}
                      </g>
                    );
                  })}
                  {/* Buses */}
                  {Object.entries(BUS_POS).map(([busId, pos]) => {
                    const bus = busMap[busId];
                    const lmp = bus?.lmp ?? 0;
                    const color = lmpColor(lmp, lmpMin, lmpMax);
                    return (
                      <g key={busId}>
                        <circle cx={pos.cx} cy={pos.cy} r={28} fill={color} fillOpacity={0.25} stroke={color} strokeWidth={2} />
                        <text x={pos.cx} y={pos.cy - 8} fontSize="9" fill={color} textAnchor="middle" fontWeight="bold" fontFamily="monospace">
                          {busId}
                        </text>
                        <text x={pos.cx} y={pos.cy + 5} fontSize="10" fill="#f8fafc" textAnchor="middle" fontWeight="bold" fontFamily="monospace">
                          ${lmp.toFixed(1)}
                        </text>
                        <text x={pos.cx} y={pos.cy + 16} fontSize="8" fill="#94a3b8" textAnchor="middle" fontFamily="monospace">
                          {bus ? `↓${(bus.load_mw/1000).toFixed(0)}GW` : ""}
                        </text>
                      </g>
                    );
                  })}
                  {/* Legend */}
                  <g>
                    <text x={460} y={360} fontSize="8" fill="#94a3b8">Lines:</text>
                    {[["#22c55e","<70%"],["#f59e0b","70–95%"],["#ef4444","≥95%"]].map(([c, l], i) => (
                      <g key={l}>
                        <line x1={460} y1={370+i*12} x2={475} y2={370+i*12} stroke={c} strokeWidth={2.5} />
                        <text x={480} y={373+i*12} fontSize="7.5" fill={c}>{l}</text>
                      </g>
                    ))}
                    <text x={460} y={412} fontSize="8" fill="#94a3b8">$/MWh = Nodal LMP</text>
                  </g>
                </svg>
              </CardContent>
            </Card>

            {/* Dispatch by carrier */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Generation Dispatch by Carrier</CardTitle>
                <CardDescription className="text-xs">MW dispatched vs installed capacity</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={genByCarrier} margin={{ top: 8, right: 8, left: -20, bottom: 4 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis dataKey="carrier" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `${(v/1000).toFixed(0)}GW`} />
                      <RechartsTooltip contentStyle={TS} formatter={(v: number) => [`${(v/1000).toFixed(1)} GW`]} />
                      <Bar dataKey="capacity" name="Capacity" fill="#1e293b" radius={[2,2,0,0]} />
                      <Bar dataKey="dispatch" name="Dispatch" radius={[2,2,0,0]}>
                        {genByCarrier.map(g => (
                          <Cell key={g.carrier} fill={carrierColors[g.carrier] ?? "#14b8a6"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Bus table */}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-muted-foreground border-b border-border">
                        <th className="text-left pb-1 font-normal">Zone</th>
                        <th className="text-right pb-1 font-normal">LMP</th>
                        <th className="text-right pb-1 font-normal">Load</th>
                        <th className="text-right pb-1 font-normal">Gen</th>
                        <th className="text-right pb-1 font-normal">Net Export</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(result.buses ?? []).map(b => (
                        <tr key={b.id} className="border-b border-border/40">
                          <td className="py-1 font-mono text-teal-400">{b.id}</td>
                          <td className="text-right font-mono">${b.lmp.toFixed(2)}</td>
                          <td className="text-right text-muted-foreground">{(b.load_mw/1000).toFixed(1)} GW</td>
                          <td className="text-right text-muted-foreground">{(b.gen_mw/1000).toFixed(1)} GW</td>
                          <td className={`text-right font-mono ${b.net_export_mw > 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            {b.net_export_mw > 0 ? "+" : ""}{(b.net_export_mw/1000).toFixed(1)} GW
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Line loading details */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Transmission Line Loading & Congestion Rent</CardTitle>
              <CardDescription className="text-xs">Line flow as % of thermal capacity · Congestion rent = shadow price × flow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={result.lines ?? []} margin={{ top: 4, right: 24, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }}
                      tickFormatter={v => v.replace("NORTH", "N").replace("HOUSTON", "HOU").replace("SOUTH", "S").replace("WEST", "W")} />
                    <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickFormatter={v => `${v}%`} domain={[0, 100]} />
                    <RechartsTooltip contentStyle={TS}
                      formatter={(v: number, name: string) => [
                        name === "loading_pct" ? `${v.toFixed(1)}%` : `$${v.toFixed(1)}k`,
                        name === "loading_pct" ? "Loading %" : "Cong Rent"
                      ]} />
                    <Bar dataKey="loading_pct" name="loading_pct" radius={[2,2,0,0]}>
                      {(result.lines ?? []).map(l => (
                        <Cell key={l.name} fill={loadingColor(l.loading_pct)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-3 text-xs text-muted-foreground">
                Congestion rents by line: {(result.lines ?? []).map(l => (
                  <span key={l.name} className="inline-block mr-3 font-mono">
                    {l.name}: <span className={l.congestion_rent_k$ > 0 ? "text-amber-400" : "text-muted-foreground"}>${l.congestion_rent_k$.toFixed(1)}k/hr</span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
