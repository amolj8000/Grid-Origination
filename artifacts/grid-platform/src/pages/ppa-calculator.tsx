import { useState, useCallback, useMemo, useEffect } from "react";
import { useListCandidates, type Candidate } from "@workspace/api-client-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Minus, DollarSign, AlertCircle, Loader2,
  ChevronDown, ChevronUp, Leaf, Zap, Shield,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PriceWaterfall {
  marketRefDa:       number;
  captureRatio:      number;
  rawCapturePrice:   number;
  shapeDiscount:     number;
  afterShapePrice:   number;
  basisAdjMwh:       number;
  powerCapturePrice: number;
  recRevenueMwh:     number;
  totalRevenueMwh:   number;
}

interface VolumeWaterfall {
  grossMwhYr:            number;
  curtailmentHaircut:    number;
  curtailmentLossMwhYr:  number;
  afterCurtailmentMwh:   number;
  availabilityFactor:    number;
  availabilityLossMwhYr: number;
  deliveredMwhYr:        number;
}

interface RiskFactors {
  // Slider inputs
  locationScore:       number;
  curtailmentScore:    number;
  gridStabilityScore:  number;
  interconnectionScore: number;
  developmentRiskScore: number;
  environmentalScore:  number;
  // Context only
  financialScore:      number;
  demandProximityScore: number;
  regulatoryScore:     number;
  // Applied values
  basisAdjMwh:         number;
  curtailmentHaircut:  number;
  shapeDiscount:       number;
  availabilityFactor:  number;
  recRevenueMwh:       number;
  p10Multiplier:       number;
  p90Multiplier:       number;
}

interface ScenarioResult {
  label: string;
  priceMultiplier: number;
  npvM: number;
  avgAnnualCashflowM: number;
}

interface PpaNpvResult {
  candidateId:       number;
  candidateName:     string;
  assetType:         string;
  market:            string;
  capacityMw:        number;
  grossMwhYr:        number;
  contractedMwhYr:   number;
  inputs:            { strike: number; term: number; wacc: number; escalation: number };
  priceWaterfall:    PriceWaterfall;
  volumeWaterfall:   VolumeWaterfall;
  riskFactors:       RiskFactors;
  baseCapturePriceMwh: number;
  scenarios:         { p10: ScenarioResult; p50: ScenarioResult; p90: ScenarioResult };
  breakevenPriceMwh: number;
  annualCashflowsP50M: { year: number; cashflowM: number; marketPriceMwh: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_PATH = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const ISO_OPTIONS = ["ERCOT", "CAISO"] as const;
const TECH_LABELS: Record<string, string> = {
  solar: "Solar", wind: "Wind", storage: "Battery Storage",
  natural_gas: "Natural Gas", nuclear: "Nuclear", hydro: "Hydro",
  coal: "Coal", geothermal: "Geothermal", other: "Other",
};
const REC_BASE: Record<string, number> = { ERCOT: 2.0, CAISO: 7.0 };

function techLabel(t: string) {
  return TECH_LABELS[t] ?? t.charAt(0).toUpperCase() + t.slice(1);
}

// Mirror backend scoreToRiskDefaults() — avoids an extra round-trip when project changes
function scoreToRiskDefaults(s: {
  locationScore: number; curtailmentScore: number; gridStabilityScore: number;
  interconnectionScore: number; developmentRiskScore: number; environmentalScore: number;
  financialScore: number; market: string;
}) {
  const basisAdjMwh = s.locationScore >= 50
    ? ((s.locationScore - 50) / 50) * 6
    : ((s.locationScore - 50) / 50) * 12;
  const curtailmentHaircut  = Math.max(0, Math.min(0.25, (100 - s.curtailmentScore)  / 100 * 0.22));
  const shapeDiscount       = Math.max(0, Math.min(0.20, (100 - s.gridStabilityScore) / 100 * 0.15));
  const avgReliability      = (s.interconnectionScore + s.developmentRiskScore) / 2;
  const availabilityFactor  = 0.93 + (avgReliability / 100) * 0.06;
  const recRevenueMwh       = (REC_BASE[s.market] ?? 4) * (s.environmentalScore / 100);
  return {
    basisAdjMwh:        Math.round(basisAdjMwh * 100) / 100,
    curtailmentHaircut: Math.round(curtailmentHaircut * 1000) / 1000,
    shapeDiscount:      Math.round(shapeDiscount * 1000) / 1000,
    availabilityFactor: Math.round(availabilityFactor * 1000) / 1000,
    recRevenueMwh:      Math.round(recRevenueMwh * 100) / 100,
  };
}

function regulatoryLabel(score: number) {
  if (score >= 65) return { text: "ITC 30% eligible", color: "text-teal-400 bg-teal-900/30 border-teal-700" };
  if (score >= 40) return { text: "PTC eligible", color: "text-amber-400 bg-amber-900/30 border-amber-700" };
  return { text: "Limited tax credits", color: "text-slate-400 bg-slate-800 border-slate-600" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NpvCard({ scenario, k }: { scenario: ScenarioResult; k: "p10" | "p50" | "p90" }) {
  const positive  = scenario.npvM >= 0;
  const neutral   = Math.abs(scenario.npvM) < 0.5;
  const color     = neutral ? "border-slate-600" : positive ? "border-teal-500" : "border-red-500";
  const Icon      = neutral ? Minus : positive ? TrendingUp : TrendingDown;
  const iconColor = neutral ? "text-slate-400" : positive ? "text-teal-400" : "text-red-400";
  const badge     = {
    p10: "bg-teal-900/40 text-teal-300 border border-teal-700",
    p50: "bg-slate-700 text-slate-200",
    p90: "bg-red-900/40 text-red-300 border border-red-700",
  }[k];
  const fmt = (n: number) => n >= 0 ? `+$${n.toFixed(1)}M` : `-$${Math.abs(n).toFixed(1)}M`;
  return (
    <div className={`rounded-lg border-2 ${color} bg-slate-800/60 p-4`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badge}`}>{k.toUpperCase()}</span>
        <Icon className={`h-4 w-4 ${iconColor}`} />
      </div>
      <p className="text-xs text-slate-400 mb-1">{scenario.label}</p>
      <p className={`text-2xl font-bold ${positive ? "text-teal-300" : neutral ? "text-slate-300" : "text-red-300"}`}>
        {fmt(scenario.npvM)}
      </p>
      <p className="text-xs text-slate-500 mt-1">Avg {fmt(scenario.avgAnnualCashflowM)}/yr</p>
    </div>
  );
}

function ScoreBadge({ score, size = "sm" }: { score: number; size?: "xs" | "sm" }) {
  const color = score >= 70 ? "text-teal-400" : score >= 45 ? "text-amber-400" : "text-red-400";
  return <span className={`font-semibold ${color} ${size === "xs" ? "text-[11px]" : "text-xs"}`}>{score.toFixed(0)}</span>;
}

function WaterfallRow({ label, value, note, highlight, indent }: {
  label: string; value: string; note?: string; highlight?: boolean; indent?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${highlight ? "border-t border-slate-600 mt-1 pt-2.5" : ""}`}>
      <div className={indent ? "pl-3" : ""}>
        <span className={`text-xs ${highlight ? "text-slate-200 font-semibold" : "text-slate-400"}`}>{label}</span>
        {note && <span className="text-[10px] text-slate-600 ml-1.5">{note}</span>}
      </div>
      <span className={`text-xs font-mono ${highlight ? "text-teal-300 font-bold" : "text-slate-300"}`}>{value}</span>
    </div>
  );
}

const ALL_SCORES: { key: keyof Candidate; label: string; desc: string }[] = [
  { key: "curtailmentScore",    label: "Curtailment",   desc: "Volume haircut" },
  { key: "locationScore",       label: "Basis",         desc: "Node-hub spread" },
  { key: "gridStabilityScore",  label: "Shape",         desc: "Gen/load timing" },
  { key: "interconnectionScore",label: "Congestion",    desc: "Transmission" },
  { key: "developmentRiskScore",label: "Dev Risk",      desc: "Availability" },
  { key: "environmentalScore",  label: "RECs",          desc: "REC revenue" },
  { key: "financialScore",      label: "Mkt Rev",       desc: "Price certainty" },
  { key: "regulatoryScore",     label: "Tax Credit",    desc: "ITC / PTC" },
];

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PpaCalculator() {
  // Project selection
  const [selectedIso,  setSelectedIso]  = useState<string>("");
  const [selectedTech, setSelectedTech] = useState<string>("");
  const [candidateId,  setCandidateId]  = useState<number | null>(null);

  // Contract terms
  const [strike,     setStrike]     = useState(35);
  const [term,       setTerm]       = useState(15);
  const [wacc,       setWacc]       = useState(8);
  const [escalation, setEscalation] = useState(1.5);

  // All 5 financial risk sliders
  const [basisAdj,     setBasisAdj]     = useState(0);
  const [curtailment,  setCurtailment]  = useState(0.05);
  const [shapeDsc,     setShapeDsc]     = useState(0.05);
  const [availability, setAvailability] = useState(0.96);
  const [recRevenue,   setRecRevenue]   = useState(2.0);
  const [riskExpanded, setRiskExpanded] = useState(false);

  const [result,  setResult]  = useState<PpaNpvResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Candidates
  const { data: candidatesData, isLoading: candidatesLoading } = useListCandidates(
    selectedIso ? { market: selectedIso as "ERCOT" | "CAISO", limit: 2000 } : { limit: 0 }
  );
  const allForIso: Candidate[] = candidatesData ?? [];

  const techOptions = useMemo(() => {
    const seen = new Set<string>();
    allForIso.forEach(c => { if (c.assetType) seen.add(c.assetType); });
    return Array.from(seen).sort();
  }, [allForIso]);

  const projectOptions = useMemo(() => {
    if (!selectedTech) return [];
    return allForIso
      .filter(c => c.assetType === selectedTech)
      .sort((a, b) => (b.capacityMw ?? 0) - (a.capacityMw ?? 0));
  }, [allForIso, selectedTech]);

  const selectedCandidate = useMemo(
    () => projectOptions.find(c => c.id === candidateId) ?? null,
    [projectOptions, candidateId]
  );

  // Auto-populate risk sliders from candidate scores
  useEffect(() => {
    if (!candidateId || !selectedCandidate) return;
    const d = scoreToRiskDefaults({
      locationScore:       selectedCandidate.locationScore       ?? 50,
      curtailmentScore:    selectedCandidate.curtailmentScore    ?? 50,
      gridStabilityScore:  selectedCandidate.gridStabilityScore  ?? 50,
      interconnectionScore: selectedCandidate.interconnectionScore ?? 50,
      developmentRiskScore: selectedCandidate.developmentRiskScore ?? 50,
      environmentalScore:  selectedCandidate.environmentalScore  ?? 50,
      financialScore:      selectedCandidate.financialScore      ?? 50,
      market:              selectedCandidate.market ?? selectedIso,
    });
    setBasisAdj(d.basisAdjMwh);
    setCurtailment(d.curtailmentHaircut);
    setShapeDsc(d.shapeDiscount);
    setAvailability(d.availabilityFactor);
    setRecRevenue(d.recRevenueMwh);
    setRiskExpanded(true);
    setResult(null);
  }, [candidateId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleIsoChange(iso: string) {
    setSelectedIso(iso); setSelectedTech(""); setCandidateId(null); setResult(null);
  }
  function handleTechChange(tech: string) {
    setSelectedTech(tech); setCandidateId(null); setResult(null);
  }
  function handleProjectChange(id: number | null) {
    setCandidateId(id); setResult(null);
  }

  const compute = useCallback(async () => {
    if (!candidateId) return;
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({
        candidateId:         String(candidateId),
        strike:              String(strike),
        term:                String(term),
        wacc:                String(wacc / 100),
        escalation:          String(escalation / 100),
        basisAdjMwh:         String(basisAdj),
        curtailmentHaircut:  String(curtailment),
        shapeDiscount:       String(shapeDsc),
        availabilityFactor:  String(availability),
        recRevenueMwh:       String(recRevenue),
      });
      const res = await fetch(`${BASE_PATH}/api/ppa-npv?${params}`);
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      setResult(await res.json() as PpaNpvResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [candidateId, strike, term, wacc, escalation, basisAdj, curtailment, shapeDsc, availability, recRevenue]);

  const selectCls = "w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:opacity-40 disabled:cursor-not-allowed";
  const chartData = result?.annualCashflowsP50M.map(r => ({ year: `Y${r.year}`, cashflow: r.cashflowM })) ?? [];

  return (
    <div className="p-6 space-y-6 min-h-screen bg-slate-900 text-slate-100">
      <div>
        <h1 className="text-2xl font-bold text-white">NPV Calculator</h1>
        <p className="text-sm text-slate-400 mt-1">
          All 8 ranking dimensions feed the model — basis, curtailment, shape, availability, and REC revenue
          are editable for stress testing; market price spread auto-derives from the financial quality score.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* ── Left panel ── */}
        <div className="lg:col-span-1 space-y-4 bg-slate-800 rounded-xl p-5 border border-slate-700">

          {/* Step 1 — ISO */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-700 text-teal-100 text-[10px] font-bold mr-1.5">1</span>
              Market (ISO)
            </label>
            <select className={selectCls} value={selectedIso} onChange={e => handleIsoChange(e.target.value)}>
              <option value="">— Select ISO —</option>
              {ISO_OPTIONS.map(iso => <option key={iso} value={iso}>{iso}</option>)}
            </select>
          </div>

          {/* Step 2 — Technology */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-700 text-teal-100 text-[10px] font-bold mr-1.5">2</span>
              Technology
              {candidatesLoading && selectedIso && <Loader2 className="inline h-3 w-3 ml-1.5 animate-spin text-teal-400" />}
            </label>
            <select className={selectCls} value={selectedTech}
              disabled={!selectedIso || candidatesLoading}
              onChange={e => handleTechChange(e.target.value)}>
              <option value="">— Select technology —</option>
              {techOptions.map(t => (
                <option key={t} value={t}>
                  {techLabel(t)} ({allForIso.filter(c => c.assetType === t).length})
                </option>
              ))}
            </select>
          </div>

          {/* Step 3 — Project */}
          <div>
            <label className="block text-xs text-slate-400 mb-1">
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-teal-700 text-teal-100 text-[10px] font-bold mr-1.5">3</span>
              Project
              {selectedTech && <span className="ml-1.5 text-slate-500">({projectOptions.length} · sorted by MW)</span>}
            </label>
            <select className={selectCls} value={candidateId ?? ""}
              disabled={!selectedTech}
              onChange={e => handleProjectChange(Number(e.target.value) || null)}>
              <option value="">— Select a project —</option>
              {projectOptions.map(c => (
                <option key={c.id} value={c.id}>{c.name} · {c.capacityMw} MW</option>
              ))}
            </select>
          </div>

          {/* ── Risk Factors ── */}
          {candidateId && selectedCandidate && (
            <div className="rounded-lg border border-slate-600 bg-slate-900/50 overflow-hidden">
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-slate-300 hover:bg-slate-800/60 transition-colors"
                onClick={() => setRiskExpanded(v => !v)}
              >
                <span className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-amber-400" />
                  Risk Factors
                  <span className="text-slate-500 font-normal">· 5 sliders · auto-loaded from scores</span>
                </span>
                {riskExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {riskExpanded && (
                <div className="px-4 pb-4 space-y-1 border-t border-slate-700">
                  {/* All 8 score badges */}
                  <div className="grid grid-cols-4 gap-1.5 pt-3 pb-3">
                    {ALL_SCORES.map(({ key, label }) => {
                      const score = (selectedCandidate[key] as number | null | undefined) ?? 50;
                      return (
                        <div key={key} className="text-center bg-slate-800 rounded-lg p-1.5">
                          <p className="text-[9px] text-slate-500 leading-tight mb-0.5">{label}</p>
                          <ScoreBadge score={score} size="xs" />
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-slate-700/60 pt-3 space-y-4">
                    {/* Basis adj */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Basis Adj <span className={`font-semibold ml-1 ${basisAdj >= 0 ? "text-teal-400" : "text-red-400"}`}>
                          {basisAdj >= 0 ? "+" : ""}{basisAdj.toFixed(2)} $/MWh
                        </span>
                        <span className="text-[10px] text-slate-600 ml-1">(from Basis score)</span>
                      </label>
                      <input type="range" min={-12} max={8} step={0.25} value={basisAdj}
                        onChange={e => setBasisAdj(Number(e.target.value))}
                        className="w-full accent-teal-500" />
                      <div className="flex justify-between text-[10px] text-slate-600"><span>−$12 congested</span><span>+$8 clear</span></div>
                    </div>

                    {/* Curtailment */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Curtailment <span className="font-semibold text-amber-400 ml-1">{(curtailment * 100).toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-600 ml-1">(from Curtailment score)</span>
                      </label>
                      <input type="range" min={0} max={0.25} step={0.005} value={curtailment}
                        onChange={e => setCurtailment(Number(e.target.value))}
                        className="w-full accent-amber-500" />
                      <div className="flex justify-between text-[10px] text-slate-600"><span>0%</span><span>25% of volume</span></div>
                    </div>

                    {/* Shape discount */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Shape Discount <span className="font-semibold text-purple-400 ml-1">{(shapeDsc * 100).toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-600 ml-1">(from Shape score)</span>
                      </label>
                      <input type="range" min={0} max={0.20} step={0.005} value={shapeDsc}
                        onChange={e => setShapeDsc(Number(e.target.value))}
                        className="w-full accent-purple-500" />
                      <div className="flex justify-between text-[10px] text-slate-600"><span>0%</span><span>20% price discount</span></div>
                    </div>

                    {/* Availability */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">
                        Availability <span className="font-semibold text-blue-400 ml-1">{(availability * 100).toFixed(1)}%</span>
                        <span className="text-[10px] text-slate-600 ml-1">(from Congestion + Dev Risk)</span>
                      </label>
                      <input type="range" min={0.80} max={0.99} step={0.005} value={availability}
                        onChange={e => setAvailability(Number(e.target.value))}
                        className="w-full accent-blue-500" />
                      <div className="flex justify-between text-[10px] text-slate-600"><span>80% (unreliable)</span><span>99%</span></div>
                    </div>

                    {/* REC revenue */}
                    <div>
                      <label className="block text-xs text-slate-400 mb-1 flex items-center gap-1">
                        <Leaf className="h-3 w-3 text-green-400" />
                        REC Revenue <span className="font-semibold text-green-400 ml-1">${recRevenue.toFixed(2)}/MWh</span>
                        <span className="text-[10px] text-slate-600 ml-1">(from RECs score)</span>
                      </label>
                      <input type="range" min={0} max={15} step={0.25} value={recRevenue}
                        onChange={e => setRecRevenue(Number(e.target.value))}
                        className="w-full accent-green-500" />
                      <div className="flex justify-between text-[10px] text-slate-600"><span>$0</span><span>$15/MWh</span></div>
                    </div>

                    {/* Financial score → P10/P90 spread (auto, not a slider) */}
                    <div className="rounded-lg bg-slate-800 px-3 py-2 flex items-center justify-between">
                      <span className="text-[10px] text-slate-500 flex items-center gap-1">
                        <Zap className="h-3 w-3 text-slate-500" />
                        P10/P90 spread (from Mkt Rev score {(selectedCandidate.financialScore ?? 50).toFixed(0)})
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono">
                        ±{(15 + (1 - (selectedCandidate.financialScore ?? 50) / 100) * 10).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Contract Terms ── */}
          <div className="border-t border-slate-700 pt-4 space-y-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Contract Terms</h3>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Strike Price: <span className="text-teal-400 font-semibold">${strike}/MWh</span>
              </label>
              <input type="range" min={15} max={80} step={0.5} value={strike}
                onChange={e => setStrike(Number(e.target.value))}
                className="w-full accent-teal-500" />
              <div className="flex justify-between text-xs text-slate-600"><span>$15</span><span>$80</span></div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Contract Term: <span className="text-teal-400 font-semibold">{term} years</span>
              </label>
              <input type="range" min={5} max={25} step={1} value={term}
                onChange={e => setTerm(Number(e.target.value))}
                className="w-full accent-teal-500" />
              <div className="flex justify-between text-xs text-slate-600"><span>5 yr</span><span>25 yr</span></div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                WACC: <span className="text-amber-400 font-semibold">{wacc}%</span>
              </label>
              <input type="range" min={4} max={15} step={0.5} value={wacc}
                onChange={e => setWacc(Number(e.target.value))}
                className="w-full accent-amber-500" />
              <div className="flex justify-between text-xs text-slate-600"><span>4%</span><span>15%</span></div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Price Escalation: <span className="text-purple-400 font-semibold">{escalation}%/yr</span>
              </label>
              <input type="range" min={0} max={5} step={0.25} value={escalation}
                onChange={e => setEscalation(Number(e.target.value))}
                className="w-full accent-purple-500" />
              <div className="flex justify-between text-xs text-slate-600"><span>0%</span><span>5%/yr</span></div>
            </div>
          </div>

          <button onClick={compute} disabled={!candidateId || loading}
            className="w-full py-2.5 rounded-lg font-semibold text-sm bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 transition-colors flex items-center justify-center gap-2">
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Computing…</>
              : <><DollarSign className="h-4 w-4" /> Compute NPV</>}
          </button>

          {error && (
            <div className="flex gap-2 text-xs text-red-400 bg-red-900/20 border border-red-800 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}
            </div>
          )}
        </div>

        {/* ── Results panel ── */}
        <div className="lg:col-span-2 space-y-5">
          {!result && !loading && (
            <div className="flex flex-col items-center justify-center h-72 bg-slate-800/40 border border-slate-700 border-dashed rounded-xl text-slate-500">
              <DollarSign className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Select a project and compute NPV</p>
              <p className="text-xs mt-2 text-center max-w-xs leading-relaxed">
                All 8 ranking scores auto-populate as financial adjustments.<br />
                Drag any slider to stress-test assumptions before computing.
              </p>
            </div>
          )}

          {result && (
            <>
              {/* ── Project header ── */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-200">{result.candidateName}</p>
                    <p className="text-xs text-slate-400">{result.market} · {techLabel(result.assetType)} · {result.capacityMw} MW</p>
                  </div>
                  {/* Tax credit context badge */}
                  {result.riskFactors.regulatoryScore !== undefined && (() => {
                    const rl = regulatoryLabel(result.riskFactors.regulatoryScore);
                    return (
                      <span className={`text-[10px] font-semibold px-2 py-1 rounded border ${rl.color}`}>
                        {rl.text}
                      </span>
                    );
                  })()}
                </div>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {[
                    { label: "Gross Gen",    value: `${(result.grossMwhYr / 1000).toFixed(0)} GWh/yr` },
                    { label: "Delivered",    value: `${(result.contractedMwhYr / 1000).toFixed(0)} GWh/yr` },
                    { label: "Strike",       value: `$${result.inputs.strike}/MWh` },
                    { label: "Total Revenue",value: `$${result.baseCapturePriceMwh}/MWh` },
                    { label: "Breakeven",    value: `$${result.breakevenPriceMwh}/MWh` },
                    { label: "Term / WACC",  value: `${result.inputs.term} yr / ${(result.inputs.wacc * 100).toFixed(1)}%` },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-[10px] text-slate-500">{label}</p>
                      <p className="text-xs font-medium text-slate-200">{value}</p>
                    </div>
                  ))}
                </div>
                {result.baseCapturePriceMwh < result.inputs.strike && (
                  <div className="mt-3 text-xs text-amber-400 bg-amber-900/20 border border-amber-800/40 rounded px-3 py-2">
                    ⚠ Total revenue (${result.baseCapturePriceMwh}/MWh incl. RECs) is below strike — offtaker carries net hedge cost at P50
                  </div>
                )}
              </div>

              {/* ── Price waterfall + Volume waterfall ── */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Price waterfall */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Revenue Build-Up ($/MWh)</h3>
                  <WaterfallRow label="Market DA Reference" value={`$${result.priceWaterfall.marketRefDa}`} note="2024 avg" />
                  <WaterfallRow label={`× Capture Ratio (${(result.priceWaterfall.captureRatio * 100).toFixed(1)}%)`}
                    value={`$${result.priceWaterfall.rawCapturePrice.toFixed(2)}`} note="tech × market" indent />
                  <WaterfallRow label={`− Shape Discount (${(result.priceWaterfall.shapeDiscount * 100).toFixed(1)}%)`}
                    value={`$${result.priceWaterfall.afterShapePrice.toFixed(2)}`} note="timing mismatch" indent />
                  <WaterfallRow label={`± Basis Adj (${result.priceWaterfall.basisAdjMwh >= 0 ? "+" : ""}${result.priceWaterfall.basisAdjMwh.toFixed(2)})`}
                    value={`$${result.priceWaterfall.powerCapturePrice.toFixed(2)}`} note="node-hub spread" indent />
                  <WaterfallRow label={`+ REC Revenue ($${result.priceWaterfall.recRevenueMwh.toFixed(2)}/MWh)`}
                    value={`$${result.priceWaterfall.totalRevenueMwh.toFixed(2)}`} note="bundled RECs" indent />
                  <WaterfallRow label="vs Strike" value={`$${result.inputs.strike}/MWh`} highlight />
                  <WaterfallRow
                    label="Net $/MWh at P50"
                    value={`${(result.priceWaterfall.totalRevenueMwh - result.inputs.strike) >= 0 ? "+" : ""}$${(result.priceWaterfall.totalRevenueMwh - result.inputs.strike).toFixed(2)}`}
                    highlight
                  />
                </div>

                {/* Volume waterfall */}
                <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                  <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Volume Waterfall (GWh/yr)</h3>
                  <WaterfallRow label="Nameplate Generation"
                    value={`${(result.volumeWaterfall.grossMwhYr / 1000).toFixed(1)} GWh`} />
                  <WaterfallRow label={`− Curtailment (${(result.volumeWaterfall.curtailmentHaircut * 100).toFixed(1)}%)`}
                    value={`−${(result.volumeWaterfall.curtailmentLossMwhYr / 1000).toFixed(1)} GWh`} indent />
                  <WaterfallRow label="After curtailment"
                    value={`${(result.volumeWaterfall.afterCurtailmentMwh / 1000).toFixed(1)} GWh`} indent />
                  <WaterfallRow label={`× Availability (${(result.volumeWaterfall.availabilityFactor * 100).toFixed(1)}%)`}
                    value={`−${(result.volumeWaterfall.availabilityLossMwhYr / 1000).toFixed(1)} GWh`} indent />
                  <WaterfallRow label="Delivered Volume"
                    value={`${(result.volumeWaterfall.deliveredMwhYr / 1000).toFixed(1)} GWh`} highlight />

                  {/* Mini score reference */}
                  <div className="mt-3 pt-3 border-t border-slate-700 grid grid-cols-4 gap-1.5">
                    {[
                      { label: "Basis",        score: result.riskFactors.locationScore },
                      { label: "Curtailment",  score: result.riskFactors.curtailmentScore },
                      { label: "Shape",        score: result.riskFactors.gridStabilityScore },
                      { label: "Congestion",   score: result.riskFactors.interconnectionScore },
                      { label: "Dev Risk",     score: result.riskFactors.developmentRiskScore },
                      { label: "RECs",         score: result.riskFactors.environmentalScore },
                      { label: "Mkt Rev",      score: result.riskFactors.financialScore },
                      { label: "Tax Credit",   score: result.riskFactors.regulatoryScore },
                    ].map(({ label, score }) => (
                      <div key={label} className="text-center bg-slate-900/60 rounded py-1.5 px-1">
                        <p className="text-[9px] text-slate-500 leading-tight">{label}</p>
                        <ScoreBadge score={score} size="xs" />
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── P10/P50/P90 scenario cards ── */}
              <div className="grid grid-cols-3 gap-3">
                <NpvCard scenario={result.scenarios.p10} k="p10" />
                <NpvCard scenario={result.scenarios.p50} k="p50" />
                <NpvCard scenario={result.scenarios.p90} k="p90" />
              </div>

              {/* ── Annual cashflow chart ── */}
              <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">
                  P50 Annual Cashflows — (Revenue − Strike) × Delivered Volume
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#64748b" }} tickFormatter={v => `$${v}M`} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 8 }}
                      labelStyle={{ color: "#94a3b8" }}
                      formatter={(v: number) => [`$${v.toFixed(1)}M`, "Cash Flow"]}
                    />
                    <ReferenceLine y={0} stroke="#64748b" strokeDasharray="4 2" />
                    <Bar dataKey="cashflow" radius={[3, 3, 0, 0]} fill="#14b8a6" />
                  </BarChart>
                </ResponsiveContainer>
                <p className="text-xs text-slate-500 mt-2 text-center">
                  Revenue = power capture + REC · Positive = hedge gain · Negative = hedge cost · {result.inputs.escalation * 100}%/yr escalation
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
