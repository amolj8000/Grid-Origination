import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

type HacRow = { date: string; hours: number[] };
type FuelType = { name: string; mcMw: number; rows: HacRow[] };
type HacData = { lastUpdated: string | null; fuelTypes: FuelType[] };

const HOURS = Array.from({ length: 24 }, (_, i) => i + 1);

function hacColor(pct: number): string {
  if (pct >= 95) return "bg-emerald-700/80 text-white";
  if (pct >= 85) return "bg-green-700/70 text-white";
  if (pct >= 75) return "bg-lime-700/60 text-lime-100";
  if (pct >= 65) return "bg-yellow-700/60 text-yellow-100";
  if (pct >= 55) return "bg-amber-700/70 text-amber-100";
  if (pct >= 45) return "bg-orange-700/70 text-orange-100";
  return "bg-red-800/80 text-red-100";
}

const FUEL_COLORS: Record<string, string> = {
  SC: "text-orange-400",
  Cogen: "text-amber-400",
  CC: "text-yellow-400",
  GFS: "text-orange-300",
  HYDRO: "text-blue-400",
  WIND: "text-teal-400",
  SOLAR: "text-yellow-300",
  "ENERGY STORAGE": "text-purple-400",
  "BIOMASS and OTHER": "text-green-400",
};

export default function SevenDayCapacity() {
  const { data, isLoading } = useQuery<HacData>({
    queryKey: ["aeso-hac-7day"],
    queryFn: () => fetch("/api/aeso/hac/7day").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">7-Day Hourly Available Capability</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Available capacity as % of Maximum Capability (MC) — live from AESO ETS
          </p>
        </div>
        {data?.lastUpdated && (
          <p className="text-xs text-muted-foreground mt-1">Last Updated: {data.lastUpdated}</p>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs">
        {[
          { label: "≥ 95%", cls: "bg-emerald-700/80" },
          { label: "≥ 85%", cls: "bg-green-700/70" },
          { label: "≥ 75%", cls: "bg-lime-700/60" },
          { label: "≥ 65%", cls: "bg-yellow-700/60" },
          { label: "≥ 55%", cls: "bg-amber-700/70" },
          { label: "≥ 45%", cls: "bg-orange-700/70" },
          { label: "< 45%", cls: "bg-red-800/80" },
        ].map(({ label, cls }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className={`w-4 h-4 rounded ${cls}`} />
            <span className="text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="w-full h-96" />
      ) : data?.fuelTypes && data.fuelTypes.length > 0 ? (
        <div className="space-y-4">
          {data.fuelTypes.map((ft) => (
            <Card key={ft.name} className="overflow-hidden">
              <CardHeader className="py-3 px-4 border-b border-border/50">
                <CardTitle className="text-sm font-semibold flex items-center gap-3">
                  <span className={FUEL_COLORS[ft.name] ?? "text-foreground"}>{ft.name}</span>
                  <span className="text-xs font-normal text-muted-foreground">
                    MC = {ft.mcMw.toLocaleString()} MW
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse min-w-max">
                    <thead>
                      <tr className="bg-muted/30">
                        <th className="px-3 py-1.5 text-left text-muted-foreground font-medium border border-border/20 whitespace-nowrap min-w-[90px]">
                          Date
                        </th>
                        {HOURS.map((h) => (
                          <th
                            key={h}
                            className="px-1.5 py-1.5 text-center text-muted-foreground font-medium border border-border/20 min-w-[42px]"
                          >
                            HE{h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ft.rows.map((row, ri) => (
                        <tr key={ri}>
                          <td className="px-3 py-1 border border-border/20 text-foreground font-medium whitespace-nowrap">
                            {row.date}
                          </td>
                          {row.hours.map((pct, hi) => (
                            <td
                              key={hi}
                              className={`px-1.5 py-1 border border-border/10 text-center font-mono ${hacColor(pct)}`}
                            >
                              {pct.toFixed(1)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex h-64 items-center justify-center text-muted-foreground">
          No data available
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Source: AESO ETS — 7-Day Hourly Available Capability Report. Values shown as % of Maximum Capability (MC).
        HE = Hour Ending (Mountain Time). Updated every 15 minutes by AESO.
      </p>
    </div>
  );
}
