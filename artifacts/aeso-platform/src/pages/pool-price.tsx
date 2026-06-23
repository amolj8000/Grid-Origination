import { useGetAesoPoolPrice, useGetAesoPoolPriceStats, useGetAesoPoolPriceSpikes } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function PoolPrice() {
  const { data: prices, isLoading: isPricesLoading } = useGetAesoPoolPrice({ limit: 168 });
  const { data: stats, isLoading: isStatsLoading } = useGetAesoPoolPriceStats();
  const { data: spikes, isLoading: isSpikesLoading } = useGetAesoPoolPriceSpikes({ threshold: 500, limit: 10 });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Pool Price History</h1>
        <p className="text-muted-foreground text-sm mt-1">Hourly settlement prices and monthly statistics</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Last 7 Days (Hourly)</CardTitle>
        </CardHeader>
        <CardContent className="h-96">
          {isPricesLoading ? (
            <Skeleton className="w-full h-full" />
          ) : prices && prices.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={prices.slice().reverse()}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => val.split('T')[0]} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} domain={[0, 1000]} tickFormatter={(val) => `$${val}`} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                />
                <Line type="monotone" dataKey="poolPrice" stroke="hsl(var(--primary))" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No data available</div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
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
                      <th className="pb-2 font-medium text-muted-foreground">Avg Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Max Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">Spikes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.map((stat, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{stat.year}-{String(stat.month).padStart(2, '0')}</td>
                        <td className="py-2">${stat.avgPrice.toFixed(2)}</td>
                        <td className="py-2">${stat.maxPrice.toFixed(2)}</td>
                        <td className="py-2">{stat.spikeCount}</td>
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

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Spikes (&gt;$500/MWh)</CardTitle>
          </CardHeader>
          <CardContent>
            {isSpikesLoading ? (
              <Skeleton className="w-full h-64" />
            ) : spikes && spikes.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="pb-2 font-medium text-muted-foreground">Date</th>
                      <th className="pb-2 font-medium text-muted-foreground">HE</th>
                      <th className="pb-2 font-medium text-muted-foreground">Price</th>
                      <th className="pb-2 font-medium text-muted-foreground">AIL Load</th>
                    </tr>
                  </thead>
                  <tbody>
                    {spikes.map((spike, i) => (
                      <tr key={i} className="border-b border-border/50">
                        <td className="py-2">{new Date(spike.date).toLocaleDateString()}</td>
                        <td className="py-2">HE{spike.hourEnding}</td>
                        <td className="py-2 font-medium text-destructive">${spike.poolPrice?.toFixed(2)}</td>
                        <td className="py-2">{spike.ailMw?.toLocaleString()} MW</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">No recent spikes</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
