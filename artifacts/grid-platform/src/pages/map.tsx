import { useState, useMemo, useEffect, useRef } from "react";
import { useListCandidates, useListQueueProjects } from "@workspace/api-client-react";
import { MapContainer, TileLayer, Marker, Popup, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Layers, Zap, Server, ChevronDown, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";

// Log-scale helpers
const LOG_MIN = Math.log10(1);
const LOG_MAX = Math.log10(3000);
const posToMw = (pos: number) => Math.round(Math.pow(10, LOG_MIN + (pos / 100) * (LOG_MAX - LOG_MIN)));
const fmtMw   = (mw: number)  => mw >= 1000 ? `${(mw / 1000).toFixed(1)} GW` : `${mw} MW`;

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

// ── Shared fuel-type colors ──────────────────────────────────────────────────
const FUEL_COLORS: Record<string, string> = {
  solar:         "#f59e0b",
  wind:          "#14b8a6",
  offshore_wind: "#06b6d4",
  storage:       "#8b5cf6",
  natural_gas:   "#f97316",
  nuclear:       "#3b82f6",
  hydro:         "#22c55e",
  geothermal:    "#ec4899",
  hybrid:        "#a3e635",
  solar_storage: "#f59e0b",
  wind_storage:  "#14b8a6",
  biomass:       "#84cc16",
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

// ── Transmission voltage bands — matching OpenGridWorks categories ────────────
const VOLTAGE_BANDS = [
  { min: 735, max: Infinity, label: "735kV+",     color: "#ef4444", weight: 3.5 },
  { min: 500, max: 734,      label: "500–734kV",  color: "#f97316", weight: 2.5 },
  { min: 345, max: 499,      label: "345–499kV",  color: "#f59e0b", weight: 2.0 },
  { min: 230, max: 344,      label: "230–344kV",  color: "#a78bfa", weight: 1.5 },
  { min: 100, max: 229,      label: "100–229kV",  color: "#3b82f6", weight: 1.0 },
  { min: 31,  max: 99,       label: "31–99kV",    color: "#22c55e", weight: 0.7 },
  { min: 0,   max: 30,       label: "<31kV",      color: "#6b7280", weight: 0.5 },
];

const VOLTAGE_BAND_LABELS = VOLTAGE_BANDS.map(b => b.label);

function getVoltageBandLabel(voltage: number): string {
  for (const band of VOLTAGE_BANDS) {
    if (voltage >= band.min && voltage <= band.max) return band.label;
  }
  return "<31kV";
}

function getVoltageStyle(voltage: number) {
  const label = getVoltageBandLabel(voltage);
  const band = VOLTAGE_BANDS.find(b => b.label === label) ?? VOLTAGE_BANDS[VOLTAGE_BANDS.length - 1];
  return { color: band.color, weight: band.weight };
}

// ── Marker factories ─────────────────────────────────────────────────────────
const createDot = (color: string, size = 14) =>
  new L.DivIcon({
    className: "",
    html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:2px solid rgba(255,255,255,0.7);box-shadow:0 0 4px rgba(0,0,0,0.6)"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

const createDiamond = (color: string, size = 12) => {
  const inner = size * 0.75;
  return new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;display:flex;align-items:center;justify-content:center;">
      <div style="width:${inner}px;height:${inner}px;background:${color};transform:rotate(45deg);border:1.5px solid rgba(255,255,255,0.8);box-shadow:0 0 4px rgba(0,0,0,0.7);opacity:0.9;"></div>
    </div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

// Square marker — data centers
const DC_COLOR = "#38bdf8"; // sky blue
const createSquare = (size = 11) =>
  new L.DivIcon({
    className: "",
    html: `<div style="width:${size}px;height:${size}px;background:${DC_COLOR};border:2px solid rgba(255,255,255,0.75);box-shadow:0 0 5px rgba(56,189,248,0.6);border-radius:2px;"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });

// ── HIFLD fetch config — 100kV+ to cover all OpenGridWorks voltage bands ─────
const HIFLD_BASE =
  "https://services1.arcgis.com/Hp6G80Pky0om7QvQ/arcgis/rest/services/Electric_Power_Transmission_Lines/FeatureServer/0/query";
const HIFLD_PARAMS =
  "where=VOLTAGE%3E%3D100+AND+STATUS%3D%27IN+SERVICE%27" +
  "&outFields=VOLTAGE%2CTYPE" +
  "&f=geojson" +
  "&resultRecordCount=2000";
const HIFLD_PAGES = [0, 2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000, 18000]; // ≥100kV

// ── OpenStreetMap datacenter fetch config ─────────────────────────────────
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const OVERPASS_DC_QUERY = `[out:json][timeout:45];(node["building"="data_center"](24,-126,50,-66);way["building"="data_center"](24,-126,50,-66);node["man_made"="data_center"](24,-126,50,-66);way["man_made"="data_center"](24,-126,50,-66););out center tags;`;

interface DcMarker {
  id: string | number;
  lat: number;
  lon: number;
  name: string;
  operator: string;
  city: string;
  website: string;
}

// ── Filter constants ─────────────────────────────────────────────────────────
const MARKETS = ["all", "ERCOT", "CAISO", "PJM"];
const EIA_LEGEND    = ["solar", "wind", "storage", "natural_gas", "nuclear", "hydro"] as const;
const QUEUE_LEGEND  = ["solar", "wind", "offshore_wind", "storage", "natural_gas", "hybrid", "geothermal"] as const;

// All fuel types (OpenGridWorks style)
const ALL_FUELS = [
  "solar", "wind", "offshore_wind", "storage", "pumped_storage",
  "hydro", "nuclear", "natural_gas", "coal", "oil", "geothermal", "biomass", "other",
] as const;
const ALL_FUEL_LABELS: Record<string, string> = {
  ...Object.fromEntries(Object.entries(FUEL_LABELS)),
  pumped_storage: "Pumped Storage",
  coal: "Coal",
  oil: "Oil",
  other: "Other",
};

// ── MultiSelect dropdown component ───────────────────────────────────────────
function MultiSelect({
  options,
  selected,
  onToggle,
  placeholder,
  renderLabel,
}: {
  options: readonly string[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  placeholder: string;
  renderLabel?: (v: string) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = selected.size;

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="h-8 w-full text-xs bg-background border border-input rounded-md px-3 flex items-center justify-between gap-1.5 hover:bg-accent/50 transition-colors"
      >
        <span className={`truncate ${count === 0 ? "text-muted-foreground" : "text-foreground"}`}>
          {count === 0 ? placeholder : `${count} selected`}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-popover border border-border rounded-md shadow-lg z-[9999] max-h-56 overflow-y-auto">
          {count > 0 && (
            <button
              type="button"
              onClick={() => options.forEach(o => selected.has(o) && onToggle(o))}
              className="w-full text-left text-xs px-3 py-1.5 text-primary hover:bg-accent border-b border-border"
            >
              Clear all
            </button>
          )}
          {options.map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => onToggle(opt)}
              className="flex items-center gap-2 px-3 py-1.5 w-full text-xs hover:bg-accent text-left"
            >
              <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 ${selected.has(opt) ? "bg-primary border-primary" : "border-input"}`}>
                {selected.has(opt) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
              </div>
              {renderLabel ? renderLabel(opt) : opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function MapWorkspace() {
  const [showEia860,       setShowEia860]       = useState(true);
  const [showQueue,        setShowQueue]        = useState(true);
  const [showTransmission, setShowTransmission] = useState(false);
  // Multi-select fuel filter — empty set = show all
  const [fuelFilters,      setFuelFilters]      = useState<Set<string>>(new Set());
  // Multi-select voltage band filter — empty set = show all bands
  const [txVoltageFilters, setTxVoltageFilters] = useState<Set<string>>(new Set());
  const [marketFilter,     setMarketFilter]     = useState("all");
  const [mwPos,            setMwPos]            = useState<[number, number]>([0, 100]);

  function toggleFuel(v: string) {
    setFuelFilters(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }

  function toggleVoltage(v: string) {
    setTxVoltageFilters(prev => {
      const next = new Set(prev);
      next.has(v) ? next.delete(v) : next.add(v);
      return next;
    });
  }
  const minMw = posToMw(mwPos[0]);
  const maxMw = posToMw(mwPos[1]);

  // Datacenter state
  const [showDatacenters,  setShowDatacenters]  = useState(false);
  const [dcMarkers,        setDcMarkers]        = useState<DcMarker[]>([]);
  const [dcLoading,        setDcLoading]        = useState(false);
  const [dcError,          setDcError]          = useState<string | null>(null);
  const dcFetched = useRef(false);

  // Transmission state
  const [txLines,         setTxLines]         = useState<FeatureCollection | null>(null);
  const [txLoading,       setTxLoading]       = useState(false);
  const [txError,         setTxError]         = useState<string | null>(null);
  const txFetched = useRef(false);

  // Fetch datacenters lazily from OpenStreetMap Overpass API
  useEffect(() => {
    if (!showDatacenters || dcFetched.current) return;
    dcFetched.current = true;
    setDcLoading(true);
    setDcError(null);

    fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: OVERPASS_DC_QUERY,
    })
      .then(r => r.json())
      .then((d: { elements?: any[] }) => {
        const markers: DcMarker[] = (d.elements ?? [])
          .map((el: any) => {
            const lat = el.lat ?? el.center?.lat;
            const lon = el.lon ?? el.center?.lon;
            if (!lat || !lon) return null;
            const t = el.tags ?? {};
            const city = [t["addr:city"], t["addr:state"]].filter(Boolean).join(", ");
            return {
              id: el.id,
              lat,
              lon,
              name:     t.name     ?? t["short_name"] ?? "Data Center",
              operator: t.operator ?? t.owner ?? "",
              city,
              website:  t.website  ?? "",
            } as DcMarker;
          })
          .filter(Boolean) as DcMarker[];
        setDcMarkers(markers);
        setDcLoading(false);
      })
      .catch(() => {
        setDcError("Failed to load datacenter data");
        setDcLoading(false);
      });
  }, [showDatacenters]);

  // Fetch transmission lines lazily when toggle is first turned on
  useEffect(() => {
    if (!showTransmission || txFetched.current) return;
    txFetched.current = true;
    setTxLoading(true);
    setTxError(null);

    Promise.all(
      HIFLD_PAGES.map(offset =>
        fetch(`${HIFLD_BASE}?${HIFLD_PARAMS}&resultOffset=${offset}`)
          .then(r => r.json() as Promise<FeatureCollection>)
      )
    )
      .then(pages => {
        const features = pages.flatMap((p: FeatureCollection) => (p.features ?? []).filter((f: Feature) => f.geometry != null));
        setTxLines({ type: "FeatureCollection", features });
        setTxLoading(false);
      })
      .catch(err => {
        setTxError("Failed to load transmission data");
        setTxLoading(false);
      });
  }, [showTransmission]);

  const { data: candidates,    isLoading: isLoadingCandidates } = useListCandidates({ limit: 5000 });
  const { data: queueProjects, isLoading: isLoadingQueue }      = useListQueueProjects();

  const filteredCandidates = useMemo(() => {
    if (!candidates) return [];
    return candidates.filter(c => {
      if (!c.latitude || !c.longitude) return false;
      if (fuelFilters.size > 0 && !fuelFilters.has(c.assetType)) return false;
      if (marketFilter !== "all" && c.market !== marketFilter) return false;
      if (c.capacityMw < minMw || c.capacityMw > maxMw) return false;
      return true;
    });
  }, [candidates, fuelFilters, marketFilter, minMw, maxMw]);

  const filteredQueue = useMemo(() => {
    if (!queueProjects) return [];
    return queueProjects.filter(q => {
      if (!q.latitude || !q.longitude) return false;
      if (marketFilter !== "all" && q.market !== marketFilter) return false;
      if (fuelFilters.size > 0 && !fuelFilters.has(q.fuelType)) return false;
      return true;
    });
  }, [queueProjects, marketFilter, fuelFilters]);

  // Filter transmission lines by selected voltage bands (empty = show all)
  const filteredTxLines = useMemo((): FeatureCollection | null => {
    if (!txLines) return null;
    if (txVoltageFilters.size === 0) return txLines;
    return {
      type: "FeatureCollection",
      features: txLines.features.filter((f: Feature) => {
        const v = f.properties?.VOLTAGE ?? 0;
        const label = getVoltageBandLabel(v);
        return txVoltageFilters.has(label);
      }),
    };
  }, [txLines, txVoltageFilters]);

  const isLoading = isLoadingCandidates || isLoadingQueue;

  // GeoJSON style function (must be stable ref to prevent constant re-render)
  const txStyle = useMemo(() => (feature?: Feature<Geometry, any>) => {
    const voltage = feature?.properties?.VOLTAGE ?? 0;
    const { color, weight } = getVoltageStyle(voltage);
    return { color, weight, opacity: 0.75 };
  }, []);

  return (
    <div className="h-full flex relative">
      <div className="flex-1 h-full z-0 relative">
        {/* Data loading overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="flex items-center gap-2 bg-card p-4 rounded-md shadow-md border">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm">Loading map data…</span>
            </div>
          </div>
        )}

        {/* Transmission loading indicator (non-blocking) */}
        {txLoading && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-card/95 px-3 py-2 rounded-full shadow border text-xs">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Loading transmission lines (~8,000 features)…
          </div>
        )}
        {txError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-destructive/90 px-3 py-2 rounded-full shadow text-xs text-white">
            {txError}
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

          {/* ── Transmission Lines (bottom layer) ── */}
          {showTransmission && filteredTxLines && (
            <GeoJSON
              key={`transmission-${txVoltageFilters.size}`}
              data={filteredTxLines}
              style={txStyle}
              interactive={false}
            />
          )}

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
                          {c.notes.replace(/^.*Owner: /, "")}
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
                    {q.interconnectionNode && (
                      <div className="col-span-2">
                        <span className="text-muted-foreground">Interconnect Point</span><br />
                        <span className="font-medium">{q.interconnectionNode}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-gray-700 flex items-center gap-1.5 text-xs text-amber-400">
                    <span style={{ width: 6, height: 6, background: "#f59e0b", transform: "rotate(45deg)", display: "inline-block" }} />
                    Queue / Pipeline
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* ── Data Centers ── */}
          {showDatacenters && dcMarkers.map(dc => (
            <Marker
              key={`dc-${dc.id}`}
              position={[dc.lat, dc.lon]}
              icon={createSquare()}
            >
              <Popup>
                <div className="min-w-[200px]">
                  <div className="font-semibold text-sm mb-1">{dc.name}</div>
                  {dc.operator && (
                    <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
                      <div style={{ width: 8, height: 8, background: DC_COLOR, borderRadius: 1, border: "1px solid rgba(255,255,255,0.4)", flexShrink: 0 }} />
                      {dc.operator}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-y-1.5 text-xs">
                    {dc.city && (
                      <div>
                        <span className="text-muted-foreground">Location</span><br />
                        <span className="font-medium">{dc.city}</span>
                      </div>
                    )}
                    {dc.website && (
                      <div>
                        <a href={dc.website} target="_blank" rel="noopener noreferrer" className="text-sky-400 hover:underline truncate block">{dc.website.replace(/^https?:\/\//, "")}</a>
                      </div>
                    )}
                  </div>
                  <div className="mt-2 pt-1.5 border-t border-gray-700 text-xs text-sky-400 flex items-center gap-1.5">
                    <div style={{ width: 6, height: 6, background: DC_COLOR, borderRadius: 1, flexShrink: 0 }} />
                    Data Center · OSM
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

            {/* EIA 860 */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">EIA 860 Plants</Label>
                <p className="text-xs text-muted-foreground">Operational only</p>
              </div>
              <Switch checked={showEia860} onCheckedChange={setShowEia860} />
            </div>

            {/* ISO Queue */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium">ISO Queue Projects</Label>
                <p className="text-xs text-muted-foreground">Interconnection pipeline</p>
              </div>
              <Switch checked={showQueue} onCheckedChange={setShowQueue} />
            </div>

            {/* Transmission lines */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    Transmission Lines
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {txLines
                      ? `${(filteredTxLines?.features.length ?? 0).toLocaleString()} / ${txLines.features.length.toLocaleString()} lines`
                      : txLoading
                      ? "Loading from HIFLD…"
                      : "≥100kV backbone, US-wide"}
                  </p>
                </div>
                <Switch checked={showTransmission} onCheckedChange={setShowTransmission} />
              </div>
              {showTransmission && (
                <MultiSelect
                  options={VOLTAGE_BAND_LABELS}
                  selected={txVoltageFilters}
                  onToggle={toggleVoltage}
                  placeholder="All voltage bands"
                  renderLabel={label => {
                    const band = VOLTAGE_BANDS.find(b => b.label === label)!;
                    return (
                      <span className="flex items-center gap-2">
                        <span className="shrink-0 rounded" style={{ display: "inline-block", width: 18, height: band.weight + 1, backgroundColor: band.color, opacity: 0.9 }} />
                        {label}
                      </span>
                    );
                  }}
                />
              )}
            </div>

            {/* Data Centers */}
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5" style={{ color: DC_COLOR }} />
                  Data Centers
                </Label>
                <p className="text-xs text-muted-foreground">
                  {dcMarkers.length > 0
                    ? `${dcMarkers.length} facilities`
                    : dcLoading
                    ? "Loading from OSM…"
                    : dcError
                    ? "Load error — retry"
                    : "Hyperscale & colo, US-wide"}
                </p>
              </div>
              <Switch
                checked={showDatacenters}
                onCheckedChange={setShowDatacenters}
              />
            </div>

            {/* Market + fuel filters */}
            <div className="pt-1 space-y-2">
              <Select value={marketFilter} onValueChange={setMarketFilter}>
                <SelectTrigger className="h-8 text-xs bg-background"><SelectValue placeholder="All Markets" /></SelectTrigger>
                <SelectContent>
                  {MARKETS.map(m => (
                    <SelectItem key={m} value={m} className="text-xs">{m === "all" ? "All Markets" : m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MultiSelect
                options={ALL_FUELS}
                selected={fuelFilters}
                onToggle={toggleFuel}
                placeholder="All Fuel Types"
                renderLabel={v => (
                  <span className="flex items-center gap-2">
                    <span className="shrink-0 rounded-full border border-white/20" style={{ display: "inline-block", width: 8, height: 8, backgroundColor: FUEL_COLORS[v] ?? "#94a3b8" }} />
                    {ALL_FUEL_LABELS[v] ?? v}
                  </span>
                )}
              />
            </div>

            {/* MW capacity slider */}
            {showEia860 && (
              <div className="pt-1 space-y-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Capacity Range</Label>
                  <button className="text-xs text-primary hover:underline" onClick={() => setMwPos([0, 100])}>Reset</button>
                </div>
                <Slider min={0} max={100} step={1} value={mwPos} onValueChange={v => setMwPos(v as [number, number])} className="my-1" />
                <div className="flex justify-between text-xs font-medium">
                  <span className="text-primary">{fmtMw(minMw)}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-primary">{fmtMw(maxMw)}</span>
                </div>
              </div>
            )}

            {/* Counts */}
            <div className="flex gap-3 text-xs pt-1 text-muted-foreground border-t border-border flex-wrap">
              {showEia860 && <span><span className="font-semibold text-foreground">{filteredCandidates.length}</span> plants</span>}
              {showQueue  && <span><span className="font-semibold text-foreground">{filteredQueue.length}</span> queue</span>}
              {showTransmission && txLines && <span><span className="font-semibold text-foreground">{txLines.features.length.toLocaleString()}</span> tx lines</span>}
              {showDatacenters && dcMarkers.length > 0 && <span><span className="font-semibold text-foreground">{dcMarkers.length}</span> DCs</span>}
            </div>
          </CardContent>
        </Card>

        {/* Legend */}
        <Card className="bg-card/95 backdrop-blur shadow-lg border-border">
          <CardContent className="px-4 py-3 space-y-1">

            {/* EIA 860 fuel */}
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              EIA 860 — Operational <span className="font-normal normal-case">(circle)</span>
            </div>
            {EIA_LEGEND.map(key => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div className="shrink-0 rounded-full border border-white/30" style={{ width: 10, height: 10, backgroundColor: FUEL_COLORS[key] }} />
                <span>{FUEL_LABELS[key]}</span>
              </div>
            ))}

            {/* ISO Queue fuel */}
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5 pt-2 border-t border-border">
              ISO Queue — Pipeline <span className="font-normal normal-case">(diamond)</span>
            </div>
            {QUEUE_LEGEND.map(key => (
              <div key={key} className="flex items-center gap-2 text-xs">
                <div className="shrink-0 flex items-center justify-center" style={{ width: 10, height: 10 }}>
                  <div style={{ width: 7, height: 7, backgroundColor: FUEL_COLORS[key], transform: "rotate(45deg)", border: "1px solid rgba(255,255,255,0.4)" }} />
                </div>
                <span>{FUEL_LABELS[key]}</span>
              </div>
            ))}

            {/* Transmission lines voltage */}
            {showTransmission && (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5 pt-2 border-t border-border">
                  Transmission <span className="font-normal normal-case">(HIFLD ≥100kV)</span>
                </div>
                {VOLTAGE_BANDS.map(band => {
                  const active = txVoltageFilters.size === 0 || txVoltageFilters.has(band.label);
                  return (
                    <div key={band.label} className={`flex items-center gap-2 text-xs transition-opacity ${active ? "opacity-100" : "opacity-30"}`}>
                      <div className="shrink-0 rounded" style={{ width: 20, height: Math.max(band.weight, 1.5) + 1, backgroundColor: band.color, opacity: 0.9 }} />
                      <span>{band.label}</span>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground mt-1">
                  Source: HIFLD Open Data · AC in service
                </p>
              </>
            )}

            {/* Data Centers */}
            {showDatacenters && (
              <>
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mt-3 mb-1.5 pt-2 border-t border-border">
                  Data Centers <span className="font-normal normal-case">(square)</span>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <div className="shrink-0" style={{ width: 10, height: 10, background: DC_COLOR, borderRadius: 2, border: "1.5px solid rgba(255,255,255,0.4)", boxShadow: `0 0 4px ${DC_COLOR}66` }} />
                  <span>Hyperscale &amp; Colocation</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Source: OpenStreetMap · 408 US facilities
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
