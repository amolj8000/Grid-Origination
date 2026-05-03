import { useState, useMemo } from "react";
import { useListCandidates, useListQueueProjects } from "@workspace/api-client-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Layers } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

// Log-scale helpers — range 1 MW to 3000 MW
const LOG_MIN = Math.log10(1);
const LOG_MAX = Math.log10(3000);
const posToMw = (pos: number) => Math.round(Math.pow(10, LOG_MIN + (pos / 100) * (LOG_MAX - LOG_MIN)));
const mwToPos = (mw: number) => Math.round(((Math.log10(Math.max(1, mw)) - LOG_MIN) / (LOG_MAX - LOG_MIN)) * 100);
const fmtMw = (mw: number) => mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw} MW`;

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ── Shared fuel-type color palette (EIA 860 plants + ISO queue) ──────────────
const FUEL_COLORS: Record<string, string> = {
  solar:         "#f59e0b",  // amber
  wind:          "#14b8a6",  // teal
  offshore_wind: "#06b6d4",  // cyan  (distinct from onshore)
  storage:       "#8b5cf6",  // purple
  natural_gas:   "#f97316",  // orange
  nuclear:       "#3b82f6",  // blue
  hydro:         "#22c55e",  // green
  geothermal:    "#ec4899",  // pink
  hybrid:        "#a3e635",  // lime  (solar+storage combos)
  solar_storage: "#f59e0b",
  wind_storage:  "#14b8a6",
  biomass:       "#84cc16",  // yellow-green
};

const FUEL_LABELS: Record<string, string> = {
  solar:         "Solar",
  wind:          "Wind",
  offshore_wind: "Offshore Wind",
  storage:       "Battery Storage",
  natural_gas:   "Natural Gas",
  nuclear:       "Nuclear",
  hydro:         "Hydro",
  geothermal:    "Geothermal",
  hybrid:        "Hybrid (Solar+Storage)",
};

// EIA 860 — circle marker (operational plants)
const createDot = (color: string, size = 14) =>
  new L.DivIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid rgba(255,255,255,0.7);box-shadow:0 0 4px rgba(0,0,0,0.6)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

// ISO Queue — diamond marker (queue/pipeline projects)
// A CSS-rotated square produces a diamond. Outer wrapper is unrotated so anchor math works.
const createDiamond = (color: string, size = 12) => {
  const inner = size * 0.75;
  const pad = (size - inner) / 2;
  return new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      <div style="width:${inner}px;height:${inner}px;background:${color};transform:rotate(45deg);border:1.5px solid rgba(255,255,255,0.8);box-shadow:0 0 4px rgba(0,0,0,0.7);opacity:0.9;"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

const FUEL_TYPES_EIA = ["all", "solar", "wind", "storage", "natural_gas", "nuclear", "hydro", "biomass", "geothermal"];
const FUEL_TYPES_QUEUE = ["all", "solar", "wind", "offshore_wind", "storage", "natural_gas", "hybrid", "geothermal"];
const MARKETS = ["all", "ERCOT", "CAISO", "PJM"];

// EIA 860 legend entries (fuels actually present in dataset)
const EIA_LEGEND = ["solar", "wind", "storage", "natural_gas", "nuclear", "hydro"] as const;
// Queue legend entries
const QUEUE_LEGEND = ["solar", "wind", "offshore_wind", "storage", "natural_gas", "hybrid", "geothermal"] as const;

export default function MapWorkspace() {
  const [showEia860, setShowEia860] = useState(true);
  const [showQueue, setShowQueue] = useState(true);
  const [fuelFilter, setFuelFilter] = useState("all");
  const [marketFilter, setMarketFilter] = useState("all");
  const [mwPos, setMwPos] = useState<[number, number]>([0, 100]);
  const minMw = posToMw(mwPos[0]);
  const maxMw = posToMw(mwPos[1]);

  const { data: candidates, isLoading: isLoadingCandidates } = useListCandidates({ limit: 5000 });
  const { data: queueProjects, isLoading: isLoadingQueue } = useListQueueProjects();

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter(c => {
      if (!c.latitude || !c.longitude) return false;
      if (fuelFilter !== "all" && c.assetType !== fuelFilter) return false;
      if (marketFilter !== "all" && c.market !== marketFilter) return false;
      if (c.capacityMw < minMw || c.capacityMw > maxMw) return false;
      return true;
    });
  }, [candidates, fuelFilter, marketFilter, minMw, maxMw]);

  const filteredQueue = useMemo(() => {
    if (!queueProjects) return [];
    return queueProjects.filter(q => {
      if (!q.latitude || !q.longitude) return false;
      if (marketFilter !== "all" && q.market !== marketFilter) return false;
      // mirror fuel filter to queue when set
      if (fuelFilter !== "all" && q.fuelType !== fuelFilter) return false;
      return true;
    });
  }, [queueProjects, marketFilter, fuelFilter]);

  const isLoading = isLoadingCandidates || isLoadingQueue;

  return (
    <div className="h-full flex relative">
      <div className="flex-1 h-full z-0 relative">
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="flex items-center gap-2 bg-card p-4 rounded-md shadow-md border">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading map data…</span>
            </div>
          </div>
        )}

        <MapContainer
          center={[39.0, -98.0]}
          zoom={4}
          style={{ height: "100%", width: "100%", zIndex: 0 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          />

          {/* ── EIA 860 Operational Plants — circles ── */}
          {showEia860 && filteredCandidates.map(c => (
            <Marker
              key={`eia-${c.id}`}
              position={[c.latitude, c.longitude]}
              icon={createDot(FUEL_COLORS[c.assetType] ?? "#94a3b8")}
            >
              <Popup>
                <div className="min-w-[210px]">
                  <div className="font-semibold text-sm mb-1">{c.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: FUEL_COLORS[c.assetType] ?? "#94a3b8" }}
                    />
                    {c.market} · {FUEL_LABELS[c.assetType] ?? c.assetType}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Capacity</span><br />
                      <span className="font-semibold">{c.capacityMw.toLocaleString()} MW</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">COD</span><br />
                      <span className="font-semibold">{(c as any).commissioningYear ?? "—"}</span>
                    </div>
                    {(c.county || c.state) && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Location</span><br />
                        <span className="font-medium">{[c.county, c.state].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {c.notes && c.notes.includes("Owner:") && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Owner</span><br />
                        <span className="font-medium">
                          {c.notes.replace("Source: EIA 860 2024 | Owner: ", "").replace(/^.*Owner: /, "")}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-gray-700 flex items-center gap-1.5 text-xs text-green-400">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-400" />
                    Operational
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* ── ISO Queue Projects — diamonds ── */}
          {showQueue && filteredQueue.map(q => (
            <Marker
              key={`q-${q.id}`}
              position={[q.latitude!, q.longitude!]}
              icon={createDiamond(FUEL_COLORS[q.fuelType] ?? "#94a3b8")}
            >
              <Popup>
                <div className="min-w-[210px]">
                  <div className="font-semibold text-sm mb-1">{q.projectName}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                    {/* Diamond indicator matching the map marker */}
                    <span
                      className="inline-block shrink-0"
                      style={{
                        width: 8, height: 8,
                        background: FUEL_COLORS[q.fuelType] ?? "#94a3b8",
                        transform: "rotate(45deg)",
                        display: "inline-block",
                      }}
                    />
                    {q.market} Queue · {FUEL_LABELS[q.fuelType] ?? q.fuelType.replace(/_/g, " ")}
                  </div>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Capacity</span><br />
                      <span className="font-semibold">{q.capacityMw?.toLocaleString()} MW</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Status</span><br />
                      <span className="font-medium capitalize">{q.status}</span>
                    </div>
                    {q.studyGroupPhase && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Study Phase</span><br />
                        <span className="font-medium">{q.studyGroupPhase}</span>
                      </div>
                    )}
                    {q.interconnectionPoint && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Interconnection Point</span><br />
                        <span className="font-medium">{q.interconnectionPoint}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-gray-700 flex items-center gap-1.5 text-xs text-amber-400">
                    <span
                      className="inline-block shrink-0"
                      style={{ width: 6, height: 6, background: "#f59e0b", transform: "rotate(45deg)", display: "inline-block" }}
                    />
                    Queue / Pipeline
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* ── Side Panel ── */}
      <div className="absolute top-4 right-4 z-10 w-72 space-y-3">

        {/* Layer toggles + filters */}
        <Card className="bg-card/95 backdrop-blur shadow-lg border-border">
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider text-muted-foreground">
              <Layers className="h-3.5 w-3.5" /> Map Layers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-4 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">EIA 860 Plants</Label>
                <p className="text-xs text-muted-foreground">Operational only</p>
              </div>
              <Switch checked={showEia860} onCheckedChange={setShowEia860} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">ISO Queue Projects</Label>
                <p className="text-xs text-muted-foreground">Interconnection pipeline</p>
              </div>
              <Switch checked={showQueue} onCheckedChange={setShowQueue} />
            </div>

            <div className="pt-1 space-y-2">
              <Select value={marketFilter} onValueChange={setMarketFilter}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Markets" />
                </SelectTrigger>
                <SelectContent>
                  {MARKETS.map(m => (
                    <SelectItem key={m} value={m} className="text-xs">
                      {m === "all" ? "All Markets" : m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={fuelFilter} onValueChange={setFuelFilter}>
                <SelectTrigger className="h-8 text-xs bg-background">
                  <SelectValue placeholder="All Fuel Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Fuel Types</SelectItem>
                  <SelectItem value="solar" className="text-xs">Solar</SelectItem>
                  <SelectItem value="wind" className="text-xs">Wind</SelectItem>
                  <SelectItem value="offshore_wind" className="text-xs">Offshore Wind</SelectItem>
                  <SelectItem value="storage" className="text-xs">Battery Storage</SelectItem>
                  <SelectItem value="natural_gas" className="text-xs">Natural Gas</SelectItem>
                  <SelectItem value="nuclear" className="text-xs">Nuclear</SelectItem>
                  <SelectItem value="hydro" className="text-xs">Hydro</SelectItem>
                  <SelectItem value="hybrid" className="text-xs">Hybrid</SelectItem>
                  <SelectItem value="geothermal" className="text-xs">Geothermal</SelectItem>
                  <SelectItem value="biomass" className="text-xs">Biomass</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* MW range slider — EIA 860 only */}
            {showEia860 && (
              <div className="pt-1 space-y-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Capacity Range</Label>
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => setMwPos([0, 100])}
                  >
                    Reset
                  </button>
                </div>
                <Slider
                  min={0} max={100} step={1}
                  value={mwPos}
                  onValueChange={(v) => setMwPos(v as [number, number])}
                  className="my-1"
                />
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-primary">{fmtMw(minMw)}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-primary">{fmtMw(maxMw)}</span>
                </div>
              </div>
            )}

            {/* Counts */}
            <div className="flex gap-3 text-xs pt-1 text-muted-foreground border-t border-border">
              {showEia860 && (
                <span><span className="font-semibold text-foreground">{filteredCandidates.length}</span> plants</span>
              )}
              {showQueue && (
                <span><span className="font-semibold text-foreground">{filteredQueue.length}</span> queue</span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="bg-card/95 backdrop-blur shadow-lg border-border">
          <CardContent className="px-4 py-3 space-y-1">

            {/* EIA 860 — circles */}
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              EIA 860 — Operational <span className="font-normal normal-case text-muted-foreground">(circle)</span>
            </div>
            {EIA_LEGEND.map(key => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div
                  className="shrink-0 rounded-full border border-white/40"
                  style={{ width: 10, height: 10, backgroundColor: FUEL_COLORS[key] }}
                />
                <span>{FUEL_LABELS[key]}</span>
              </div>
            ))}

            {/* ISO Queue — diamonds */}
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5 pt-2 border-t border-border">
              ISO Queue — Pipeline <span className="font-normal normal-case text-muted-foreground">(diamond)</span>
            </div>
            {QUEUE_LEGEND.map(key => (
              <div key={key} className="flex items-center gap-2 text-xs">
                {/* Diamond shape in legend */}
                <div className="shrink-0 flex items-center justify-center" style={{ width: 10, height: 10 }}>
                  <div
                    style={{
                      width: 7, height: 7,
                      backgroundColor: FUEL_COLORS[key],
                      transform: "rotate(45deg)",
                      border: "1px solid rgba(255,255,255,0.5)",
                    }}
                  />
                </div>
                <span>{FUEL_LABELS[key]}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
