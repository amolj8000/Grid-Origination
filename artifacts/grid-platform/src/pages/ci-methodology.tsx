import { Badge } from "@/components/ui/badge";
import {
  BookMarked, Database, BarChart3, FlaskConical, Cpu, BriefcaseBusiness,
  CheckCircle, ArrowRight, Zap, Wind, Sun, Flame, GitBranch,
} from "lucide-react";

const SKILLS = [
  "Power market analytics (ERCOT, CAISO, PJM)",
  "LMP / congestion / basis risk analysis",
  "ERCOT CDR reports and API integration",
  "Data engineering (Python, Node.js, PostgreSQL)",
  "Statistical modelling (seasonal mean, rolling basis, percentile forecasting)",
  "Model evaluation: MAE, RMSE, F1, directional accuracy",
  "Backtesting on held-out out-of-sample data",
  "Energy market data pipelines (ZIP/XLSX ingestion)",
  "React + TypeScript full-stack product design",
  "Recharts / Leaflet data visualization",
];

const SECTIONS = [
  {
    icon: Flame,
    color: "text-orange-400",
    title: "Problem Statement",
    content: `ERCOT settlement point and resource node prices exhibit persistent congestion patterns driven by transmission constraints, 
    wind and solar generation concentration in West Texas, and correlated load events. For renewable developers, IPPs, and corporate 
    offtakers (like Walmart), understanding where basis risk concentrates — and when — is material to project siting, PPA pricing, 
    and portfolio risk management. This feature quantifies that risk using real ERCOT market data from 2024 onward.`,
  },
  {
    icon: Database,
    color: "text-teal-400",
    title: "Data Pipeline",
    content: `Two real ERCOT data sources are ingested:

    1. CDR Reports 13061 (RT) and 13060 (DA): Annual XLSX files covering all ERCOT hubs and load zones (HB_NORTH, HB_HOUSTON, HB_SOUTH, 
    HB_WEST, LZ_*). 15-minute RT intervals and hourly DA intervals are averaged to monthly stats. 15 nodes × 28 months = 420 rows.

    2. ERCOT API Bundles: np6-905-cd (RT) and np4-190-cd (DA) monthly ZIP bundles from the ERCOT developer portal. Each bundle 
    contains daily CSV files for all ~1,108 resource settlement points. A Python seeder script processes all bundles, extracts 
    prices, and upserts monthly aggregates (avg, min, max, volatility, negative-price frequency).

    All data stored in PostgreSQL. Schema: ercot_node_stats (node, node_type, year, month, avgDaPrice, avgRtPrice, volatility, 
    negPricePercent, minPrice, maxPrice). No synthetic or imputed values — 100% real market data.`,
  },
  {
    icon: BarChart3,
    color: "text-blue-400",
    title: "Analytics Layer",
    content: `Key computed metrics:

    Basis = avg monthly RT price − avg monthly DA price. This is the settlement point basis, a direct measure of congestion and 
    loss costs not captured in the DAM clearing price.

    Congestion event: |basis| > $10/MWh (configurable). Severe: > $25. Extreme: > $50.

    Risk Score (0–100): Composite metric weighted 40% by average absolute basis, 25% by basis standard deviation, 25% by 
    congestion frequency, 10% by negative-price exposure. Normalized to 0–100 for comparability across node types.

    Node ranking: All nodes ranked by risk score in the Heat Map, enabling quick identification of where congestion 
    concentrates in the ERCOT footprint.`,
  },
  {
    icon: FlaskConical,
    color: "text-amber-400",
    title: "Predictive Model & Backtest",
    content: `Model: Seasonal Mean Baseline

    The simplest credible congestion forecast is a same-month seasonal average: for a given node and calendar month, the 
    expected basis in 2026 equals the mean basis for that same month in 2024 and 2025. This is the standard benchmark 
    before introducing ML.

    Training period: Jan 2024 – Dec 2025 (all available monthly observations per node per month).
    Test period: Jan–Apr 2026 (actual data in the DB, never used during "training").

    Evaluation metrics reported:
    • MAE and RMSE for point basis prediction
    • Directional accuracy (correct sign of basis)
    • F1 score for binary congestion event detection (|basis| > $10)
    • Precision / recall / confusion matrix

    Approximately 4,500+ node-month test pairs evaluated. The results show both where the seasonal model generalizes well 
    (stable nodes with clear seasonal patterns) and where it struggles (high-volatility resource nodes with year-over-year 
    structural shifts — often the most interesting from a risk perspective).`,
  },
  {
    icon: Cpu,
    color: "text-purple-400",
    title: "Technical Architecture",
    content: `Backend: Express 5 + TypeScript. All congestion analytics computed via PostgreSQL SQL aggregations — CTEs 
    for training/test split, window functions for percentile stats, correlation computed in JS from aligned series arrays.
    
    Frontend: React 18 + Vite + TanStack Query. Charts: Recharts (AreaChart, BarChart, ScatterChart, LineChart). 
    Navigation: Wouter. Styling: Tailwind CSS + shadcn/ui.

    No pre-computed analytics tables — all metrics computed on-demand from the raw node_stats table, keeping the data 
    pipeline simple and the computation transparent.

    API routes: /congestion-intel/overview, /heatmap, /node-series, /basis-compare, /backtest, /data-quality, /node-list.
    Each route accepts optional query params for filtering and threshold customization.`,
  },
  {
    icon: BriefcaseBusiness,
    color: "text-emerald-400",
    title: "Business Value",
    content: `This feature directly supports:

    Renewable developers: Identify which nodes carry the highest basis risk before siting a new wind or solar project. 
    A 1,000 MW project at a node with persistent $15/MWh negative basis loses ~$131M/year in realized revenue vs DAM price.

    Corporate offtakers (Walmart): Evaluate which PPA nodes create the most versus least basis exposure. Choose settlement 
    points with historically stable DA/RT spreads to reduce P&L volatility.

    Traders and analysts: Understand where congestion concentrates seasonally, allowing tactical hedging positions or 
    transmission congestion rights (TCR) strategy.

    Risk teams: The backtest framework supports ongoing model validation — as 2026 and 2027 data accumulates, the seasonal 
    model can be extended with ML approaches (Random Forest, gradient boosting) using the same train/test infrastructure.`,
  },
];

export default function CIMethodology() {
  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Hero */}
        <div className="border border-border rounded-lg bg-gradient-to-br from-card to-slate-900 p-6">
          <div className="flex items-center gap-3 mb-3">
            <BookMarked className="h-6 w-6 text-orange-400" />
            <h1 className="text-2xl font-bold">Methodology & Portfolio Case Study</h1>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed mb-4">
            End-to-end design and implementation of a portfolio-grade ERCOT congestion analytics engine — from raw market 
            data ingestion through statistical forecasting and backtesting, built for energy analytics and quantitative 
            power markets roles.
          </p>
          <div className="flex flex-wrap gap-2">
            {["Power Markets", "Data Engineering", "Statistical ML", "Backtesting", "React + TypeScript", "PostgreSQL", "ERCOT CDR API"].map(tag => (
              <Badge key={tag} variant="outline" className="text-xs border-primary/40 text-primary/80">{tag}</Badge>
            ))}
          </div>
        </div>

        {/* Methodology sections */}
        {SECTIONS.map(s => (
          <div key={s.title} className="space-y-3">
            <div className="flex items-center gap-3">
              <s.icon className={`h-5 w-5 ${s.color} shrink-0`} />
              <h2 className="text-lg font-bold">{s.title}</h2>
            </div>
            <div className="bg-card border border-border rounded-md px-4 py-4">
              {s.content.split("\n\n").map((para, i) => (
                <p key={i} className={`text-sm text-foreground/80 leading-relaxed whitespace-pre-line ${i > 0 ? "mt-3" : ""}`}>
                  {para.trim()}
                </p>
              ))}
            </div>
          </div>
        ))}

        {/* Skills demonstrated */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-emerald-400 shrink-0" />
            <h2 className="text-lg font-bold">Technical Skills Demonstrated</h2>
          </div>
          <div className="bg-card border border-border rounded-md px-4 py-4 grid grid-cols-1 lg:grid-cols-2 gap-2">
            {SKILLS.map(s => (
              <div key={s} className="flex items-start gap-2 text-sm">
                <ArrowRight className="h-3.5 w-3.5 mt-0.5 text-teal-400 shrink-0" />
                <span className="text-foreground/80">{s}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Limitations & honest framing */}
        <div className="space-y-3">
          <h2 className="text-lg font-bold">Honest Framing</h2>
          <div className="bg-amber-950/20 border border-amber-800/30 rounded-md px-4 py-4 text-sm text-foreground/80 space-y-2">
            <p>• <b className="text-foreground">Data granularity:</b> All analytics use monthly aggregates from raw interval data. Intraday patterns (hour-of-day, on-peak vs off-peak) are partially captured via on/off-peak averages but not at interval resolution for the 1,108 resource nodes.</p>
            <p>• <b className="text-foreground">Predictive model:</b> The seasonal mean model is a baseline, not a production-grade forecast. It demonstrates the correct train/test methodology; extending to ML would require hourly features and more training observations.</p>
            <p>• <b className="text-foreground">Data coverage:</b> RT data available for all 28 months (Jan 2024–Apr 2026). DA data for resource nodes starts April 2024 (20 months). Some nodes have sparse coverage in early months.</p>
            <p>• <b className="text-foreground">Node topology:</b> Settlement point names correspond to ERCOT resource nodes, hubs, and load zones — not physical buses. Full bus-level LMP decomposition requires the ERCOT real-time system model (not publicly available).</p>
          </div>
        </div>

        <div className="text-xs text-muted-foreground pb-8">
          Built with: React 18 · TypeScript · Express 5 · PostgreSQL · Drizzle ORM · Recharts · Tailwind CSS · shadcn/ui ·
          ERCOT CDR public data · ERCOT developer API
        </div>
      </div>
    </div>
  );
}
