import { useGetAesoDashboard, useGetAesoActualForecast } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Dashboard() {
  const { data: dashboard, isLoading } = useGetAesoDashboard();
  const { data: forecasts, isLoading: isForecastsLoading } = useGetAesoActualForecast({ limit: 24 });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Market Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time overview of the Alberta Interconnected Electric System</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))}
        </div>
      ) : dashboard ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Latest Pool Price</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">${dashboard.latestPoolPrice?.toFixed(2) || "---"} <span className="text-sm font-normal text-muted-foreground">/MWh</span></div>
                <div className="text-xs text-muted-foreground mt-1">Last 30d Avg: ${dashboard.avgPriceLast30Days?.toFixed(2)}</div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Current AIL Load</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.latestAilMw?.toLocaleString() || "---"} <span className="text-sm font-normal text-muted-foreground">MW</span></div>
                <div className="text-xs text-muted-foreground mt-1">Reserve Margin: {dashboard.latestReserveMarginPct?.toFixed(1)}%</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Active Outages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.activeOutagesMw?.toLocaleString() || "---"} <span className="text-sm font-normal text-muted-foreground">MW</span></div>
                <div className="text-xs text-muted-foreground mt-1">{dashboard.activeOutageCount} facilities offline</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Project Queue</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{dashboard.queueTotalMw?.toLocaleString() || "---"} <span className="text-sm font-normal text-muted-foreground">MW</span></div>
                <div className="text-xs text-muted-foreground mt-1">{dashboard.queueProjectCount} active projects</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="h-96">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Forecast vs Actual Price (Last 24h)</CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-4rem)]">
                {isForecastsLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : forecasts && forecasts.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecasts.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="hourEnding" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `HE${val}`} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `$${val}`} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                      />
                      <Line type="monotone" dataKey="actualPoolPrice" stroke="hsl(var(--primary))" name="Actual" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="forecastPoolPrice" stroke="hsl(var(--muted-foreground))" name="Forecast" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No forecast data</div>
                )}
              </CardContent>
            </Card>
            <Card className="h-96">
              <CardHeader>
                <CardTitle className="text-sm font-medium">Forecast vs Actual Wind (Last 24h)</CardTitle>
              </CardHeader>
              <CardContent className="h-[calc(100%-4rem)]">
                {isForecastsLoading ? (
                  <Skeleton className="w-full h-full" />
                ) : forecasts && forecasts.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={forecasts.slice().reverse()}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                      <XAxis dataKey="hourEnding" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => `HE${val}`} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                      />
                      <Line type="monotone" dataKey="actualWindMw" stroke="hsl(var(--chart-3))" name="Actual Wind" dot={false} strokeWidth={2} />
                      <Line type="monotone" dataKey="forecastWindMw" stroke="hsl(var(--muted-foreground))" name="Forecast Wind" strokeDasharray="5 5" dot={false} strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No forecast data</div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
