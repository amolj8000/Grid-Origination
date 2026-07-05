import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

const COLS = [
  { key: "sc", label: "SC" },
  { key: "cogen", label: "Cogen" },
  { key: "cc", label: "CC" },
  { key: "gfs", label: "GFS" },
  { key: "hydro", label: "Hydro" },
  { key: "wind", label: "Wind" },
  { key: "solar", label: "Solar" },
  { key: "energyStorage", label: "Energy Storage" },
  { key: "biomassOther", label: "Biomass & Other" },
  { key: "mbo", label: "MBO" },
];

type DailyRow = {
  date: string;
  sc: number; cogen: number; cc: number; gfs: number; hydro: number;
  wind: number; solar: number; energyStorage: number; biomassOther: number;
  mbo: number; load: number;
};

type MonthlyRow = {
  month: string;
  sc: number; cogen: number; cc: number; gfs: number; hydro: number;
  wind: number; solar: number; energyStorage: number; biomassOther: number;
  mbo: number;
};

function cellColor(val: number): string {
  if (val === 0) return "";
  if (val >= 1000) return "bg-red-900/40 text-red-300";
  if (val >= 500) return "bg-orange-900/40 text-orange-300";
  if (val >= 200) return "bg-amber-900/40 text-amber-300";
  return "bg-yellow-900/20 text-yellow-200";
}

export default function Outages() {
  const [view, setView] = useState<"daily" | "monthly">("daily");

  const { data: dailyData, isLoading: isDailyLoading } = useQuery<{ lastUpdated: string | null; rows: DailyRow[] }>({
    queryKey: ["aeso-outages-daily"],
    queryFn: () => fetch("/api/aeso/outages/daily").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: view === "daily",
  });

  const { data: monthlyData, isLoading: isMonthlyLoading } = useQuery<{ lastUpdated: string | null; rows: MonthlyRow[] }>({
    queryKey: ["aeso-outages-monthly"],
    queryFn: () => fetch("/api/aeso/outages/monthly").then((r) => r.json()),
    staleTime: 5 * 60 * 1000,
    enabled: view === "monthly",
  });

  const isLoading = view === "daily" ? isDailyLoading : isMonthlyLoading;
  const lastUpdated = view === "daily" ? dailyData?.lastUpdated : monthlyData?.lastUpdated;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outage Report</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Generation outages by fuel type — live from AESO ETS
        </p>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={view === "daily" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("daily")}
          >
            Daily
          </Button>
          <Button
            variant={view === "monthly" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("monthly")}
          >
            Monthly Forecast
          </Button>
        </div>
        {lastUpdated && (
          <p className="text-xs text-muted-foreground">Last Updated: {lastUpdated}</p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {view === "daily" ? "Daily Generation Outages (MW)" : "Monthly Outage Forecast (MW)"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="w-full h-96" />
          ) : view === "daily" && dailyData?.rows && dailyData.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium border border-border/30 whitespace-nowrap">Date</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-right text-muted-foreground font-medium border border-border/30 whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-right text-muted-foreground font-medium border border-border/30">Load</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyData.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-1.5 border border-border/20 text-foreground whitespace-nowrap font-medium">{row.date}</td>
                      {COLS.map((c) => {
                        const val = row[c.key as keyof DailyRow] as number;
                        return (
                          <td key={c.key} className={`px-3 py-1.5 border border-border/20 text-right ${cellColor(val)}`}>
                            {val.toLocaleString()}
                          </td>
                        );
                      })}
                      <td className={`px-3 py-1.5 border border-border/20 text-right ${cellColor(row.load)}`}>
                        {row.load.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : view === "monthly" && monthlyData?.rows && monthlyData.rows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono border-collapse">
                <thead>
                  <tr className="bg-muted/50">
                    <th className="px-3 py-2 text-left text-muted-foreground font-medium border border-border/30 whitespace-nowrap">Month</th>
                    {COLS.map((c) => (
                      <th key={c.key} className="px-3 py-2 text-right text-muted-foreground font-medium border border-border/30 whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.rows.map((row, i) => (
                    <tr key={i} className="hover:bg-muted/20 transition-colors">
                      <td className="px-3 py-1.5 border border-border/20 text-foreground whitespace-nowrap font-medium">{row.month}</td>
                      {COLS.map((c) => {
                        const val = row[c.key as keyof MonthlyRow] as number;
                        return (
                          <td key={c.key} className={`px-3 py-1.5 border border-border/20 text-right ${cellColor(val)}`}>
                            {val.toLocaleString()}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              {isLoading ? "Loading..." : "No data available"}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Source: AESO ETS — Generation outage records. All values in MW. Colour intensity indicates severity.
        SC = Simple Cycle · Cogen = Cogeneration · CC = Combined Cycle · GFS = Gas Fired Steam · MBO = Must Benefit Others
      </p>
    </div>
  );
}
