import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldCheck, CheckCircle, AlertCircle, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip as RechartsTooltip, Cell } from "recharts";

const TS = { backgroundColor:"#0f172a", borderColor:"#1e293b", color:"#f8fafc", fontSize:11 };

type QualityData = {
  totalNodes: number; totalRecords: number; rtRecords: number;
  minPeriod: string; maxPeriod: string; rtCompleteness: number;
  byYearAndType: {
    year: number; nodeType: string;
    uniqueNodes: number; totalRecords: number; rtRecords: number;
    volRecords: number; negRecords: number; rtPct: number;
  }[];
};

const NODE_TYPE_LABELS: Record<string,string> = {
  resource_node: "Resource Nodes", hub: "Hubs", load_zone: "Load Zones",
};

const completenessColor = (pct: number) => {
  if (pct >= 95) return "text-emerald-400";
  if (pct >= 80) return "text-teal-400";
  if (pct >= 60) return "text-amber-400";
  return "text-red-400";
};

export default function CIQuality() {
  const { data, isLoading } = useQuery<QualityData>({
    queryKey: ["ci","data-quality"],
    queryFn:  () => fetch("/api/congestion-intel/data-quality").then(r => r.json()),
    staleTime: 600_000,
  });

  if (isLoading) return (
    <div className="flex-1 flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
  if (!data) return null;

  const byYear = Object.entries(
    data.byYearAndType.reduce((acc, r) => {
      if (!acc[r.year]) acc[r.year] = { year:r.year, total:0, rt:0 };
      acc[r.year].total += r.totalRecords;
      acc[r.year].rt    += r.rtRecords;
      return acc;
    }, {} as Record<number,{year:number;total:number;rt:number}>)
  ).map(([,v]) => ({ ...v, rtPct: Math.round(v.rt/v.total*100*10)/10 })).sort((a,b)=>a.year-b.year);

  const sources = [
    { label:"ERCOT CDR Reports 13061/13060", desc:"Hub & load zone prices (HB_*, LZ_*). Annual XLSX via public MIS download. 15-min RT, hourly DA intervals averaged monthly.", nodes:15, icon:CheckCircle, color:"text-emerald-400" },
    { label:"ERCOT API Bundles np6-905-cd", desc:"RT resource node prices — monthly ZIP bundles from ERCOT developer API. Python seeder downloads & parses all 1,108 nodes.", nodes:1108, icon:CheckCircle, color:"text-emerald-400" },
    { label:"ERCOT API Bundles np4-190-cd", desc:"DA resource node prices — monthly ZIP bundles. Coverage begins April 2024 (20 months available vs 28 for RT).", nodes:1108, icon:CheckCircle, color:"text-teal-400" },
    { label:"Derived fields", desc:"Basis (RT−DA), congestion flags, risk scores, and statistical model predictions are computed on-the-fly from raw price data.", nodes:0, icon:Info, color:"text-blue-400" },
  ];

  return (
    <div className="p-6 h-full flex flex-col space-y-5">
      <div className="shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="h-5 w-5 text-emerald-400" />
          <h1 className="text-2xl font-bold">Data Quality Dashboard</h1>
        </div>
        <p className="text-muted-foreground text-sm">
          Record completeness, coverage, and source provenance for the ERCOT congestion dataset
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">Total Nodes</CardDescription></CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-3xl font-bold text-teal-400">{data.totalNodes.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-0.5">ERCOT resource + hub/zone nodes</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">Total Records</CardDescription></CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-3xl font-bold text-blue-400">{data.totalRecords.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Monthly node-stats rows</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">RT Completeness</CardDescription></CardHeader>
          <CardContent className="pb-4 px-4">
            <div className={`text-3xl font-bold ${completenessColor(data.rtCompleteness)}`}>{data.rtCompleteness}%</div>
            <div className="text-xs text-muted-foreground mt-0.5">{data.rtRecords.toLocaleString()} / {data.totalRecords.toLocaleString()} records with RT price</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1 pt-4 px-4"><CardDescription className="text-xs">Coverage Period</CardDescription></CardHeader>
          <CardContent className="pb-4 px-4">
            <div className="text-xl font-bold text-purple-400">{data.minPeriod} → {data.maxPeriod}</div>
            <div className="text-xs text-muted-foreground mt-0.5">28 months of RT · 20 months of DA (resource nodes)</div>
          </CardContent>
        </Card>
      </div>

      {/* Records by year chart */}
      <Card className="shrink-0">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Records by Year</CardTitle>
          <CardDescription className="text-xs">2026 data partial (Jan–Apr only)</CardDescription>
        </CardHeader>
        <CardContent style={{ height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byYear} margin={{ top:0, right:8, left:0, bottom:0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2d3e" vertical={false} />
              <XAxis dataKey="year" stroke="#64748b" tick={{ fill:"#64748b", fontSize:11 }} />
              <YAxis stroke="#64748b" tick={{ fill:"#64748b", fontSize:10 }} width={50} tickFormatter={v=>v.toLocaleString()} />
              <RechartsTooltip contentStyle={TS} formatter={(v:number,n:string) => [v.toLocaleString(), n]} />
              <Bar dataKey="total" name="Total records" fill="#3b82f6" isAnimationActive={false} radius={[3,3,0,0]} />
              <Bar dataKey="rt"    name="w/ RT price"  fill="#14b8a6" isAnimationActive={false} radius={[3,3,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* By year + type table */}
      <div className="border rounded-md overflow-auto bg-card shrink-0">
        <table className="w-full text-xs">
          <thead className="bg-card sticky top-0 shadow-sm">
            <tr className="border-b border-border text-muted-foreground">
              <th className="px-3 py-2 text-left">Year</th>
              <th className="px-3 py-2 text-left">Node Type</th>
              <th className="px-3 py-2 text-right">Unique Nodes</th>
              <th className="px-3 py-2 text-right">Total Records</th>
              <th className="px-3 py-2 text-right">RT Records</th>
              <th className="px-3 py-2 text-right">RT %</th>
              <th className="px-3 py-2 text-right">w/ Volatility</th>
              <th className="px-3 py-2 text-right">w/ Neg Price</th>
            </tr>
          </thead>
          <tbody>
            {data.byYearAndType.map(r => (
              <tr key={`${r.year}-${r.nodeType}`} className="border-b border-border/40 hover:bg-muted/20">
                <td className="px-3 py-1.5 font-medium">{r.year}</td>
                <td className="px-3 py-1.5"><Badge variant="outline" className="text-xs">{NODE_TYPE_LABELS[r.nodeType] ?? r.nodeType}</Badge></td>
                <td className="px-3 py-1.5 text-right">{r.uniqueNodes.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{r.totalRecords.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{r.rtRecords.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">
                  <span className={completenessColor(r.rtPct)}>{r.rtPct}%</span>
                </td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.volRecords.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground">{r.negRecords.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Data sources */}
      <div className="shrink-0">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">Data Sources & Provenance</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {sources.map(s => (
            <div key={s.label} className="bg-card border border-border rounded-md px-4 py-3 flex items-start gap-3">
              <s.icon className={`h-4 w-4 mt-0.5 shrink-0 ${s.color}`} />
              <div>
                <div className="text-sm font-semibold">{s.label}</div>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
                {s.nodes > 0 && <div className="mt-1 text-xs font-medium" style={{ color:"#14b8a6" }}>{s.nodes.toLocaleString()} nodes</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
