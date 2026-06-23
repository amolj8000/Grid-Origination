import { useGetAesoGeneration, useGetAesoGenerationMonthly } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function Generation() {
  const { data: generation, isLoading: isGenLoading } = useGetAesoGeneration({ limit: 168 });
  const { data: monthly, isLoading: isMonthlyLoading } = useGetAesoGenerationMonthly();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generation Mix</h1>
        <p className="text-muted-foreground text-sm mt-1">Fuel type breakdown and renewable penetration</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Generation by Fuel Type (Last 7 Days)</CardTitle>
        </CardHeader>
        <CardContent className="h-96">
          {isGenLoading ? (
            <Skeleton className="w-full h-full" />
          ) : generation && generation.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={generation.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => val.split('T')[0]} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                />
                <Area type="monotone" dataKey="gasMw" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" />
                <Area type="monotone" dataKey="coalMw" stackId="1" stroke="hsl(var(--chart-5))" fill="hsl(var(--chart-5))" />
                <Area type="monotone" dataKey="windMw" stackId="1" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" />
                <Area type="monotone" dataKey="solarMw" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" />
                <Area type="monotone" dataKey="hydroMw" stackId="1" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 gap-4">
         <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Monthly Generation Stats</CardTitle>
          </CardHeader>
          <CardContent>
            {isMonthlyLoading ? (
              <Skeleton className="w-full h-64" />
            ) : monthly && monthly.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Month</th>
                      <th className="pb-2 font-medium text-muted-foreground">Avg Total (MW)</th>
                      <th className="pb-2 font-medium text-muted-foreground">Gas %</th>
                      <th className="pb-2 font-medium text-muted-foreground">Wind %</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((stat, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{stat.year}-{String(stat.month).padStart(2, '0')}</td>
                        <td className="py-2">{stat.avgTotalMw.toFixed(0)}</td>
                        <td className="py-2">{stat.gasPct.toFixed(1)}%</td>
                        <td className="py-2">{stat.windPct.toFixed(1)}%</td>
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
