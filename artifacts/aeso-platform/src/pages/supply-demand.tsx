import { useGetAesoSupplyDemand, useGetAesoSupplyDemandStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SupplyDemand() {
  const { data: supplyDemand, isLoading: isSdLoading } = useGetAesoSupplyDemand({ limit: 168 });
  const { data: stats, isLoading: isStatsLoading } = useGetAesoSupplyDemandStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Supply & Demand</h1>
        <p className="text-muted-foreground text-sm mt-1">AIL load, capacity, and reserve margin</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Load & Capacity (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-96">
          {isSdLoading ? (
            <Skeleton className="w-full h-full" />
          ) : supplyDemand && supplyDemand.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={supplyDemand.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => val.split('T')[0]} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                />
                <Line type="monotone" dataKey="ailMw" name="AIL Load" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="availableCapacityMw" name="Available Capacity" stroke="hsl(var(--chart-3))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 gap-4">
         <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Monthly Statistics</CardTitle>
          </CardHeader>
          <CardContent>
            {isStatsLoading ? (
              <Skeleton className="w-full h-64" />
            ) : stats && stats.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Month</th>
                      <th className="pb-2 font-medium text-muted-foreground">Peak AIL (MW)</th>
                      <th className="pb-2 font-medium text-muted-foreground">Avg Reserve Margin</th>
                      <th className="pb-2 font-medium text-muted-foreground">Min Reserve Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{stat.year}-{String(stat.month).padStart(2, '0')}</td>
                        <td className="py-2">{stat.peakAilMw.toFixed(0)}</td>
                        <td className="py-2">{stat.avgReserveMarginPct.toFixed(1)}%</td>
                        <td className="py-2 text-destructive">{stat.minReserveMarginPct.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">No data available</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
