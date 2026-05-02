import { useState } from "react";
import { useListPjmNodeStats } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer, Cell,
  ReferenceLine
} from "recharts";
import { Loader2 } from "lucide-react";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const NODES = [
  "Western Hub",
  "Eastern Hub",
  "AEP-Dayton Hub",
  "NI Hub",
  "PSEG",
  "PPL",
  "DOM",
  "BGE",
];

const NODE_LABELS: Record<string, string> = {
  "Western Hub":    "Western Hub (most liquid)",
  "Eastern Hub":    "Eastern Hub",
  "AEP-Dayton Hub": "AEP-Dayton Hub",
  "NI Hub":         "NI Hub (ComEd)",
  "PSEG":           "PSEG Zone (NJ)",
  "PPL":            "PPL Zone (PA)",
  "DOM":            "DOM Zone (VA)",
  "BGE":            "BGE Zone (MD)",
};

const YEARS = [2022, 2023, 2024, 2025, 2026];

const C = {
  teal: "#14b8a6",
  amber: "#f59e0b",
  purple: "#8b5cf6",
  red: "#ef4444",
  green: "#22c55e",
  blue: "#3b82f6",
  border: "#1e2d3e",
  mutedFg: "#64748b",
  tooltipBg: "#0f172a",
  tooltipBorder: "#1e293b",
  tooltipFg: "#f8fafc",
};

const TOOLTIP_STYLE = {
  backgroundColor: C.tooltipBg,
  borderColor: C.tooltipBorder,
  color: C.tooltipFg,
};

// Colors per zone for multi-zone comparison
const ZONE_COLORS: Record<string, string> = {
  "Western Hub":    "#14b8a6",
  "Eastern Hub":    "#3b82f6",
  "AEP-Dayton Hub": "#f59e0b",
  "NI Hub":         "#8b5cf6",
  "PSEG":           "#ef4444",
  "PPL":            "#22c55e",
  "DOM":            "#ec4899",
  "BGE":            "#06b6d4",
};

function EmptyState() {
  return (
    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
      No data available for selected period
    </div>
  );
}

export default function PjmHistorical() {
  const [node, setNode] = useState<string>("Western Hub");
  const [year, setYear] = useState<number>(2025);
  const [compareYear, setCompareYear] = useState<number>(2022);
  const [showCompare, setShowCompare] = useState(false);
  const [compareNode, setCompareNode] = useState<string>("PSEG");
  const [showZoneCompare, setShowZoneCompare] = useState(false);

  const { data: stats, isLoading } = useListPjmNodeStats({ node, year });
  const { data: compareStats } = useListPjmNodeStats(
    { node, year: compareYear },
    { enabled: showCompare }
  );
  const { data: compareZoneStats } = useListPjmNodeStats(
    { node: compareNode, year },
    { enabled: showZoneCompare }
  );

  const chartData = stats?.sort((a, b) => a.month - b.month).map(s => {
    const comp = compareStats?.find(c => c.month === s.month);
    const zoneComp = compareZoneStats?.find(c => c.month === s.month);
    return {
      month: MONTHS[s.month - 1],
      daPrice: Number(s.avgDaPrice.toFixed(2)),
      rtPrice: s.avgRtPrice ? Number(s.avgRtPrice.toFixed(2)) : null,
      volatility: s.volatility ? Number(s.volatility.toFixed(2)) : null,
      negPercent: s.negPricePercent ? Number(s.negPricePercent.toFixed(3)) : null,
      onPeak: s.onPeakAvg ? Number(s.onPeakAvg.toFixed(2)) : null,
      offPeak: s.offPeakAvg ? Number(s.offPeakAvg.toFixed(2)) : null,
      daComp: comp ? Number(comp.avgDaPrice.toFixed(2)) : undefined,
      rtComp: comp && comp.avgRtPrice ? Number(comp.avgRtPrice.toFixed(2)) : undefined,
      daZone: zoneComp ? Number(zoneComp.avgDaPrice.toFixed(2)) : undefined,
    };
  }) || [];

  const empty = !isLoading && chartData.length === 0;

  const annualAvgDa = chartData.length > 0
    ? (chartData.reduce((s, d) => s + d.daPrice, 0) / chartData.length).toFixed(2)
    : null;
  const annualAvgOnPeak = chartData.filter(d => d.onPeak).length > 0
    ? (chartData.reduce((s, d) => s + (d.onPeak ?? 0), 0) / chartData.filter(d => d.onPeak).length).toFixed(2)
    : null;
  const peakSpread = annualAvgDa && annualAvgOnPeak
    ? (Number(annualAvgOnPeak) - Number(annualAvgDa)).toFixed(2)
    : null;

  return (
    <div className="p-8 h-full overflow-auto space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">PJM Historical Analysis</h1>
          <p className="text-muted-foreground">Day-Ahead vs Real-Time pricing, volatility, and peak spreads across PJM hubs and load zones.</p>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Select value={node} onValueChange={setNode}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NODES.map(n => (
                <SelectItem key={n} value={n}>{NODE_LABELS[n]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <button
            onClick={() => setShowCompare(v => !v)}
            className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${showCompare ? "border-primary text-primary bg-primary/10" : "border-border text-muted-foreground hover:text-foreground"}`}
          >
            YoY Compare
          </button>
          {showCompare && (
            <Select value={String(compareYear)} onValueChange={v => setCompareYear(Number(v))}>
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.filter(y => y !== year).map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      {/* KPI strip */}
      {annualAvgDa && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
          {[
            { label: "Annual Avg DA", value: `$${annualAvgDa}/MWh`, color: C.teal },
            { label: "On-Peak Avg", value: annualAvgOnPeak ? `$${annualAvgOnPeak}/MWh` : "—", color: C.amber },
            { label: "Peak Spread", value: peakSpread ? `$${peakSpread}/MWh` : "—", color: C.purple },
            { label: "Node", value: node, color: C.blue },
          ].map(kpi => (
            <Card key={kpi.label}>
              <CardContent className="pt-4 pb-3">
                <div className="text-xl font-bold" style={{ color: kpi.color }}>{kpi.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{kpi.label} · {year}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Tabs defaultValue="da_rt">
        <TabsList className="mb-4">
          <TabsTrigger value="da_rt">DA vs RT</TabsTrigger>
          <TabsTrigger value="peak">On/Off-Peak Split</TabsTrigger>
          <TabsTrigger value="volatility">Volatility</TabsTrigger>
          <TabsTrigger value="zone_compare">Zone Spread</TabsTrigger>
        </TabsList>

        {/* DA vs RT */}
        <TabsContent value="da_rt">
          <Card>
            <CardHeader>
              <CardTitle>Day-Ahead vs Real-Time Price</CardTitle>
              <CardDescription>
                Monthly average LMP for {NODE_LABELS[node]} · {year}
                {showCompare && ` vs ${compareYear}`}
              </CardDescription>
            </CardHeader>
            <CardContent style={{ height: 340 }}>
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : empty ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="month" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} />
                    <YAxis stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} tickFormatter={v => `$${v}`} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`$${v}/MWh`, name]} />
                    <Legend formatter={(v) => <span style={{ color: C.tooltipFg, fontSize: 12 }}>{v}</span>} />
                    <ReferenceLine y={0} stroke={C.border} strokeDasharray="3 3" />
                    <Line isAnimationActive={false} type="monotone" dataKey="daPrice" name={`DA ${year}`} stroke={C.teal} strokeWidth={2} dot={{ r: 3, fill: C.teal }} />
                    <Line isAnimationActive={false} type="monotone" dataKey="rtPrice" name={`RT ${year}`} stroke={C.amber} strokeWidth={2} strokeDasharray="4 2" dot={{ r: 3, fill: C.amber }} />
                    {showCompare && <Line isAnimationActive={false} type="monotone" dataKey="daComp" name={`DA ${compareYear}`} stroke={C.purple} strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: C.purple }} />}
                    {showCompare && <Line isAnimationActive={false} type="monotone" dataKey="rtComp" name={`RT ${compareYear}`} stroke={C.blue} strokeWidth={2} strokeDasharray="4 2" dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* On/Off-Peak */}
        <TabsContent value="peak">
          <Card>
            <CardHeader>
              <CardTitle>On-Peak vs Off-Peak Average Price</CardTitle>
              <CardDescription>
                PJM peak hours HE07–HE22 · {NODE_LABELS[node]} · {year}
              </CardDescription>
            </CardHeader>
            <CardContent style={{ height: 340 }}>
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : empty ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                    <XAxis dataKey="month" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} />
                    <YAxis stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} tickFormatter={v => `$${v}`} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`$${v}/MWh`, name]} />
                    <Legend formatter={(v) => <span style={{ color: C.tooltipFg, fontSize: 12 }}>{v}</span>} />
                    <Bar isAnimationActive={false} dataKey="onPeak" name="On-Peak" fill={C.amber} radius={[3, 3, 0, 0]} />
                    <Bar isAnimationActive={false} dataKey="offPeak" name="Off-Peak" fill={C.teal} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Volatility */}
        <TabsContent value="volatility">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Price Volatility (Std Dev)</CardTitle>
                <CardDescription>Monthly LMP standard deviation · {NODE_LABELS[node]} · {year}</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 280 }}>
                {isLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : empty ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="month" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 11 }} />
                      <YAxis stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 11 }} tickFormatter={v => `$${v}`} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`$${v}/MWh`]} />
                      <Bar isAnimationActive={false} dataKey="volatility" name="Std Dev" radius={[3, 3, 0, 0]}>
                        {chartData.map((entry, i) => (
                          <Cell key={i} fill={(entry.volatility ?? 0) > 20 ? C.red : C.purple} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Negative Price Frequency</CardTitle>
                <CardDescription>% of intervals with LMP &lt; $0 · {NODE_LABELS[node]} · {year}</CardDescription>
              </CardHeader>
              <CardContent style={{ height: 280 }}>
                {isLoading ? (
                  <div className="h-full flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : empty ? <EmptyState /> : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={C.border} vertical={false} />
                      <XAxis dataKey="month" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 11 }} />
                      <YAxis stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 11 }} tickFormatter={v => `${v}%`} />
                      <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`]} />
                      <Bar isAnimationActive={false} dataKey="negPercent" name="Neg Price %" fill={C.red} radius={[3, 3, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Zone Spread */}
        <TabsContent value="zone_compare">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <CardTitle>Zone-to-Zone DA Price Spread</CardTitle>
                  <CardDescription>Compare {NODE_LABELS[node]} vs another PJM zone · {year}</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Compare vs:</span>
                  <Select value={compareNode} onValueChange={v => { setCompareNode(v); setShowZoneCompare(true); }}>
                    <SelectTrigger className="w-[180px]" onClick={() => setShowZoneCompare(true)}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NODES.filter(n => n !== node).map(n => (
                        <SelectItem key={n} value={n}>{NODE_LABELS[n]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent style={{ height: 340 }}>
              {isLoading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : empty ? <EmptyState /> : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
                    <XAxis dataKey="month" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} />
                    <YAxis stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} tickFormatter={v => `$${v}`} />
                    <RechartsTooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number, name: string) => [`$${v}/MWh`, name]} />
                    <Legend formatter={(v) => <span style={{ color: C.tooltipFg, fontSize: 12 }}>{v}</span>} />
                    <ReferenceLine y={0} stroke={C.border} strokeDasharray="3 3" />
                    <Line isAnimationActive={false} type="monotone" dataKey="daPrice" name={node} stroke={ZONE_COLORS[node] ?? C.teal} strokeWidth={2.5} dot={{ r: 3 }} />
                    {showZoneCompare && (
                      <Line isAnimationActive={false} type="monotone" dataKey="daZone" name={compareNode} stroke={ZONE_COLORS[compareNode] ?? C.amber} strokeWidth={2.5} strokeDasharray="5 3" dot={{ r: 3 }} />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
