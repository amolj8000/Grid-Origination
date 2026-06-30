import { useState, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { useGetTemperature, useGetTemperatureStats } from "@workspace/api-client-react";

// ── Zone colour palettes ──────────────────────────────────────────────────────
const ERCOT_ZONES: Record<string, { label: string; color: string }> = {
  COAS: { label: "Coast (Houston)",       color: "#14b8a6" },
  NCEN: { label: "North Central (DFW)",   color: "#8b5cf6" },
  NRTH: { label: "North",                 color: "#f59e0b" },
  EAST: { label: "East",                  color: "#22c55e" },
  SCEN: { label: "South Central (SAT)",   color: "#ef4444" },
  SOUT: { label: "South (Corpus)",        color: "#3b82f6" },
  FWES: { label: "Far West (Midland)",    color: "#f97316" },
  WEST: { label: "West (Lubbock)",        color: "#ec4899" },
};

const CAISO_ZONES: Record<string, { label: string; color: string }> = {
  NP15: { label: "NP15 (Sacramento)", color: "#14b8a6" },
  SP15: { label: "SP15 (Los Angeles)", color: "#f59e0b" },
  ZP26: { label: "ZP26 (Fresno)",     color: "#8b5cf6" },
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function buildDailyAvg(
  rows: { zone: string; day: number; hour: number; tempF: number }[],
  zones: Record<string, { label: string; color: string }>,
): { day: number; [zone: string]: number }[] {
  const byDay: Record<number, Record<string, number[]>> = {};
  for (const r of rows) {
    if (!byDay[r.day]) byDay[r.day] = {};
    if (!byDay[r.day][r.zone]) byDay[r.day][r.zone] = [];
    byDay[r.day][r.zone].push(r.tempF);
  }
  return Object.entries(byDay)
    .map(([day, zoneMap]) => {
      const pt: { day: number; [k: string]: number } = { day: Number(day) };
      for (const z of Object.keys(zones)) {
        const arr = zoneMap[z];
        if (arr?.length) pt[z] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
      }
      return pt;
    })
    .sort((a, b) => a.day - b.day);
}

function buildHourlyProfile(
  rows: { zone: string; day: number; hour: number; tempF: number }[],
  zones: Record<string, { label: string; color: string }>,
): { hour: number; [zone: string]: number }[] {
  const byHour: Record<number, Record<string, number[]>> = {};
  for (const r of rows) {
    if (!byHour[r.hour]) byHour[r.hour] = {};
    if (!byHour[r.hour][r.zone]) byHour[r.hour][r.zone] = [];
    byHour[r.hour][r.zone].push(r.tempF);
  }
  return Object.entries(byHour)
    .map(([h, zoneMap]) => {
      const pt: { hour: number; [k: string]: number } = { hour: Number(h) };
      for (const z of Object.keys(zones)) {
        const arr = zoneMap[z];
        if (arr?.length) pt[z] = Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 10) / 10;
      }
      return pt;
    })
    .sort((a, b) => a.hour - b.hour);
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TempChart({
  data,
  xKey,
  xLabel,
  zones,
}: {
  data: Record<string, number>[];
  xKey: string;
  xLabel: string;
  zones: Record<string, { label: string; color: string }>;
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey={xKey}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          label={{ value: xLabel, position: "insideBottom", offset: -2, fill: "#94a3b8", fontSize: 11 }}
        />
        <YAxis
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          tickFormatter={(v) => `${v}°F`}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(v: number, name: string) => [`${v}°F`, zones[name]?.label || name]}
        />
        <Legend
          formatter={(val) => zones[val]?.label || val}
          wrapperStyle={{ color: "#94a3b8", fontSize: 11 }}
        />
        {Object.entries(zones).map(([z, meta]) => (
          <Line
            key={z}
            type="monotone"
            dataKey={z}
            stroke={meta.color}
            dot={false}
            strokeWidth={1.5}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

function StatsTable({
  stats,
  iso,
  year,
  month,
  zones,
}: {
  stats: { zone: string; year: number; month: number; avgF: number; minF: number; maxF: number }[];
  iso: string;
  year: number;
  month: number;
  zones: Record<string, { label: string; color: string }>;
}) {
  const filtered = stats
    .filter(s => s.year === year && s.month === month)
    .sort((a, b) => b.avgF - a.avgF);

  if (!filtered.length) {
    return <p className="text-slate-500 text-sm">No stats for this period.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-700 text-slate-400">
          <th className="text-left py-2 pr-4">Zone</th>
          <th className="text-right py-2 pr-4">Avg</th>
          <th className="text-right py-2 pr-4">Min</th>
          <th className="text-right">Max</th>
        </tr>
      </thead>
      <tbody>
        {filtered.map(s => (
          <tr key={s.zone} className="border-b border-slate-800 hover:bg-slate-800/30">
            <td className="py-2 pr-4 font-medium" style={{ color: zones[s.zone]?.color || "#94a3b8" }}>
              {zones[s.zone]?.label || s.zone}
            </td>
            <td className="text-right py-2 pr-4 text-slate-200">{s.avgF}°F</td>
            <td className="text-right py-2 pr-4 text-blue-400">{s.minF}°F</td>
            <td className="text-right text-red-400">{s.maxF}°F</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── ISO Section ───────────────────────────────────────────────────────────────
function IsoSection({
  iso,
  year,
  month,
  zones,
}: {
  iso: "ERCOT" | "CAISO";
  year: number;
  month: number;
  zones: Record<string, { label: string; color: string }>;
}) {
  const { data: hourly = [], isLoading } = useGetTemperature({ iso, year, month });
  const { data: stats = [] } = useGetTemperatureStats({ iso });

  const dailyAvg   = useMemo(() => buildDailyAvg(hourly,   zones), [hourly,   zones]);
  const hourlyProf = useMemo(() => buildHourlyProfile(hourly, zones), [hourly, zones]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500">
        Loading temperature data…
      </div>
    );
  }

  if (!hourly.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-500">
        No data for {iso} {MONTHS[month - 1]} {year}. Run seed-temperatures.py to populate.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Daily average chart */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Daily Average Temperature — {MONTHS[month - 1]} {year}
        </h3>
        <TempChart data={dailyAvg} xKey="day" xLabel="Day" zones={zones} />
      </div>

      {/* Hour-of-day profile */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Average Hour-of-Day Profile — {MONTHS[month - 1]} {year}
        </h3>
        <TempChart data={hourlyProf} xKey="hour" xLabel="Hour (local)" zones={zones} />
      </div>

      {/* Stats table */}
      <div className="bg-slate-800/50 rounded-lg p-4 border border-slate-700/50">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">
          Monthly Summary — {MONTHS[month - 1]} {year}
        </h3>
        <StatsTable stats={stats} iso={iso} year={year} month={month} zones={zones} />
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function WeatherPage() {
  const [activeIso, setActiveIso] = useState<"ERCOT" | "CAISO">("ERCOT");
  const [year,  setYear]  = useState(2025);
  const [month, setMonth] = useState(7);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Temperature Data</h1>
          <p className="text-slate-400 mt-1">
            Hourly temperatures by zone — ERCOT (8 sub-BA zones) and CAISO (3 pricing zones).
            Source: Open-Meteo archive API, Jan 2024–May 2026.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <select
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
          >
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="bg-slate-800 border border-slate-600 rounded px-3 py-1.5 text-sm text-slate-200"
          >
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        </div>
      </div>

      {/* ISO tabs */}
      <div className="flex gap-1 bg-slate-800/60 p-1 rounded-lg w-fit border border-slate-700/50">
        {(["ERCOT", "CAISO"] as const).map(iso => (
          <button
            key={iso}
            onClick={() => setActiveIso(iso)}
            className={`px-5 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeIso === iso
                ? "bg-teal-500 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            {iso}
          </button>
        ))}
      </div>

      {/* Section content */}
      {activeIso === "ERCOT" ? (
        <IsoSection iso="ERCOT" year={year} month={month} zones={ERCOT_ZONES} />
      ) : (
        <IsoSection iso="CAISO" year={year} month={month} zones={CAISO_ZONES} />
      )}
    </div>
  );
}
