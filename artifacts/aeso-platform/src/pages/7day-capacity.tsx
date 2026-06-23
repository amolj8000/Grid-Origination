import { useGetAeso7dayCapability } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

export default function SevenDayCapacity() {
  const { data: capability, isLoading } = useGetAeso7dayCapability();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">7-Day Capacity Outlook</h1>
        <p className="text-muted-foreground text-sm mt-1">Forecast capability vs AIL forecast</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Capacity Forecast</CardTitle>
        </CardHeader>
        <CardContent className="h-[500px]">
          {isLoading ? (
            <Skeleton className="w-full h-full" />
          ) : capability && capability.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={capability}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="targetDate" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(val) => val.split('T')[0]} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))' }}
                />
                <Area type="monotone" dataKey="gasMw" stackId="1" stroke="hsl(var(--chart-1))" fill="hsl(var(--chart-1))" name="Gas" />
                <Area type="monotone" dataKey="coalMw" stackId="1" stroke="hsl(var(--chart-5))" fill="hsl(var(--chart-5))" name="Coal" />
                <Area type="monotone" dataKey="windMw" stackId="1" stroke="hsl(var(--chart-3))" fill="hsl(var(--chart-3))" name="Wind" />
                <Area type="monotone" dataKey="solarMw" stackId="1" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" name="Solar" />
                <Area type="monotone" dataKey="hydroMw" stackId="1" stroke="hsl(var(--chart-4))" fill="hsl(var(--chart-4))" name="Hydro" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">No forecast data available</div>
          )}
        </CardContent>
      </Card>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Placeholder cards for additional stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Min Margin Over 7d</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12.4%</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Peak Load Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">11,450 MW</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg Wind Forecast</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">1,820 MW</div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
