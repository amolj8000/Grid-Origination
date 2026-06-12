import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Brain, BarChart2, Target } from "lucide-react";
import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer,
  Tooltip as RechartsTooltip, ScatterChart, Scatter, ReferenceLine, Cell,
} from "recharts";

const BASE = "/pypsa";
const TS = { backgroundColor: "#0f172a", borderColor: "#1e293b", color: "#f8fafc", fontSize: 11 };

const FEAT_LABELS: Record<string, string> = {
  node_enc: "Node (encoded)",
  node_type_enc: "Node type",
  year: "Year",
  month: "Month",
  season: "Season",
  is_peak_season: "Peak season",
  q: "Quarter",
  da: "DA price",
  on_peak: "On-peak avg",
  off_peak: "Off-peak avg",
  vol: "Volatility",
  neg_pct: "Neg price %",
  rolling_3m_basis: "3-month rolling basis",
  yoy_basis: "YoY basis change",
};

const HUBS = ["HB_NORTH","HB_SOUTH","HB_WEST","HB_PAN","HB_HOUSTON","HB_BUSAVG","HB_HUBAVG"];
const MONTHS_LABEL = ["","Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function PypsaML() {
  const [predNode,  setPredNode]  = useState("HB_NORTH");
  const [predMonth, setPredMonth] = useState("7");
  const [predYear,  setPredYear]  = useState("2026");

  const statusQ = useQuery({
    queryKey: ["pypsa-ml-status"],
    queryFn: () => fetch(`${BASE}/ml/status`).then(r => r.json()),
    refetchInterval: (q) => q.state.data?.training_in_progress ? 3000 : false,
  });

  const impQ = useQuery({
    queryKey: ["pypsa-ml-importance"],
    queryFn: () => fetch(`${BASE}/ml/importance`).then(r => r.json()),
    enabled: statusQ.data?.trained === true,
  });

  const scatterQ = useQuery({
    queryKey: ["pypsa-ml-scatter"],
    queryFn: () => fetch(`${BASE}/ml/scatter`).then(r => r.json()),
    enabled: statusQ.data?.trained === true,
  });

  const predQ = useQuery({
    queryKey: ["pypsa-ml-predict", predNode, predMonth, predYear],
    queryFn: () => fetch(`${BASE}/ml/predict?node=${predNode}&month=${predMonth}&year=${predYear}`).then(r => r.json()),
    enabled: statusQ.data?.trained === true,
  });

  const trainMut = useMutation({
    mutationFn: () => fetch(`${BASE}/ml/train`, { method: "POST" }).then(r => r.json()),
    onSuccess: () => statusQ.refetch(),
  });

  const meta = statusQ.data;
  const importance = impQ.data?.features ?? [];
  const scatter = (scatterQ.data?.scatter ?? []).slice(0, 400);
  const pred = predQ.data;

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Brain className="h-6 w-6 text-purple-400" />
            XGBoost Congestion Model
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Gradient boosted trees trained on 1,123 ERCOT nodes · Monthly features · Basis magnitude regression + congestion classification
          </p>
        </div>
        <Badge variant="outline" className="border-purple-500/40 text-purple-400 text-xs">ML v1</Badge>
      </div>

      {/* Train / Status panel */}
      <Card className="bg-card border-border">
        <CardContent className="pt-4 pb-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div>
              <Button
                onClick={() => trainMut.mutate()}
                disabled={trainMut.isPending || meta?.training_in_progress}
                className="bg-purple-600 hover:bg-purple-700 text-white text-sm"
              >
                {(trainMut.isPending || meta?.training_in_progress)
                  ? <><Loader2 className="h-3 w-3 animate-spin mr-1" />Training...</>
                  : meta?.trained ? "Re-train Model" : "Train Model"}
              </Button>
            </div>
            {meta?.trained && (
              <div className="flex gap-6 text-sm">
                <div><span className="text-muted-foreground">Train N: </span><span className="font-mono text-foreground">{meta.n_train?.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Test N: </span><span className="font-mono text-foreground">{meta.n_test?.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Nodes: </span><span className="font-mono text-foreground">{meta.n_nodes?.toLocaleString()}</span></div>
                <div><span className="text-muted-foreground">Train split: </span><span className="font-mono text-teal-400">{meta.train_years}</span></div>
                <div><span className="text-muted-foreground">Test split: </span><span className="font-mono text-amber-400">{meta.test_years}</span></div>
              </div>
            )}
            {!meta?.trained && !meta?.training_in_progress && (
              <span className="text-sm text-muted-foreground">Train the model to see feature importance and predictions.</span>
            )}
            {meta?.training_in_progress && (
              <span className="text-sm text-amber-400 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Training in progress — polling every 3s...
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {meta?.trained && (
        <>
          {/* Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "MAE", value: `$${meta.mae}/MWh`, color: "text-teal-400", desc: "Mean absolute error on test set" },
              { label: "RMSE", value: `$${meta.rmse}/MWh`, color: "text-amber-400", desc: "Root mean squared error" },
              { label: "Accuracy", value: `${(meta.accuracy * 100).toFixed(1)}%`, color: "text-purple-400", desc: "Congestion classification" },
              { label: "F1 Score", value: meta.f1?.toFixed(3), color: "text-teal-400", desc: "Congestion event F1" },
              { label: "Precision", value: meta.precision?.toFixed(3), color: "text-emerald-400", desc: "Congestion precision" },
            ].map(m => (
              <Card key={m.label} className="bg-card border-border">
                <CardContent className="pt-3 pb-2 px-3">
                  <div className="text-xs text-muted-foreground">{m.label}</div>
                  <div className={`text-xl font-bold font-mono ${m.color}`}>{m.value}</div>
                  <div className="text-xs text-muted-foreground">{m.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Feature importance */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Feature Importance (XGBoost gain)</CardTitle>
                <CardDescription className="text-xs">Which features drive basis prediction the most</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={importance.slice(0, 10).map((f: { feature: string; importance: number }) => ({
                        ...f,
                        label: FEAT_LABELS[f.feature] ?? f.feature,
                      }))}
                      layout="vertical"
                      margin={{ top: 4, right: 24, left: 90, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fill: "#94a3b8" }} />
                      <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#94a3b8" }} width={88} />
                      <RechartsTooltip contentStyle={TS} formatter={(v: number) => [`${(v*100).toFixed(2)}%`, "Importance"]} />
                      <Bar dataKey="importance" radius={[0,2,2,0]}>
                        {importance.slice(0, 10).map((_: unknown, i: number) => (
                          <Cell key={i} fill={i === 0 ? "#8b5cf6" : i < 3 ? "#14b8a6" : "#1e40af"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Predicted vs Actual scatter */}
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Predicted vs Actual Basis |RT–DA|</CardTitle>
                <CardDescription className="text-xs">Sample of {scatter.length} test points · Perfect = 45° diagonal</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 8, right: 12, left: -10, bottom: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                      <XAxis type="number" dataKey="actual" name="Actual" domain={[0, 60]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }} label={{ value: "Actual |basis| $/MWh", position: "insideBottom", offset: -2, fill: "#64748b", fontSize: 10 }} />
                      <YAxis type="number" dataKey="predicted" name="Predicted" domain={[0, 60]}
                        tick={{ fontSize: 10, fill: "#94a3b8" }} label={{ value: "Predicted", angle: -90, position: "insideLeft", fill: "#64748b", fontSize: 10 }} />
                      <ReferenceLine segment={[{x:0,y:0},{x:60,y:60}]} stroke="#14b8a6" strokeDasharray="4 4" strokeOpacity={0.5} />
                      <ReferenceLine y={10} stroke="#f59e0b" strokeDasharray="3 3" strokeOpacity={0.4} />
                      <Scatter data={scatter} fill="#8b5cf6" fillOpacity={0.5} r={2} />
                      <RechartsTooltip contentStyle={TS}
                        formatter={(v: number, n: string) => [`$${v?.toFixed(2)}/MWh`, n]} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Forward prediction */}
          <Card className="bg-card border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Target className="h-4 w-4 text-teal-400" />
                Forward Basis Prediction
              </CardTitle>
              <CardDescription className="text-xs">Predict expected basis for any node / month / year</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-4 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Node</div>
                  <Select value={predNode} onValueChange={setPredNode}>
                    <SelectTrigger className="w-36 h-8 text-xs border-border bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HUBS.map(n => <SelectItem key={n} value={n} className="text-xs">{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Month</div>
                  <Select value={predMonth} onValueChange={setPredMonth}>
                    <SelectTrigger className="w-24 h-8 text-xs border-border bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                        <SelectItem key={m} value={String(m)} className="text-xs">{MONTHS_LABEL[m]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Year</div>
                  <Select value={predYear} onValueChange={setPredYear}>
                    <SelectTrigger className="w-24 h-8 text-xs border-border bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["2025","2026","2027"].map(y => (
                        <SelectItem key={y} value={y} className="text-xs">{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {pred && !predQ.isLoading && (
                  <div className="flex gap-6 ml-4 flex-wrap">
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Predicted |basis|</div>
                      <div className={`text-2xl font-bold font-mono ${pred.predicted_abs_basis > 10 ? "text-amber-400" : "text-teal-400"}`}>
                        ${pred.predicted_abs_basis}/MWh
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground">Congestion Prob</div>
                      <div className={`text-2xl font-bold font-mono ${pred.congestion_probability > 0.5 ? "text-red-400" : "text-emerald-400"}`}>
                        {(pred.congestion_probability * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="flex items-center">
                      <Badge variant={pred.is_congested ? "destructive" : "outline"}
                        className={pred.is_congested ? "" : "border-emerald-500/40 text-emerald-400"}>
                        {pred.is_congested ? "⚠ Congested" : "✓ Normal"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground self-center">
                      Model MAE: ±${pred.model_mae}/MWh
                    </div>
                  </div>
                )}
                {predQ.isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground self-center" />}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
