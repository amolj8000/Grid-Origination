import { useGetAesoOutages, useGetAesoOutagesUpcoming } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Outages() {
  const { data: outages, isLoading } = useGetAesoOutages({ limit: 50 });
  const { data: upcoming, isLoading: isUpcomingLoading } = useGetAesoOutagesUpcoming();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Outage Tracker</h1>
        <p className="text-muted-foreground text-sm mt-1">Forced and planned generator outages</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Outages</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="w-full h-96" />
          ) : outages && outages.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Facility</th>
                    <th className="pb-2 font-medium text-muted-foreground">Fuel</th>
                    <th className="pb-2 font-medium text-muted-foreground">Type</th>
                    <th className="pb-2 font-medium text-muted-foreground">Start</th>
                    <th className="pb-2 font-medium text-muted-foreground">MW Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {outages.map((outage) => (
                    <tr key={outage.id} className="border-b border-border/50">
                      <td className="py-3 font-medium">{outage.facility}</td>
                      <td className="py-3 text-muted-foreground">{outage.fuelType || "Unknown"}</td>
                      <td className="py-3">
                        <Badge variant="outline" className={outage.outageType?.toLowerCase() === 'forced' ? 'border-destructive text-destructive' : ''}>
                          {outage.outageType || "Unknown"}
                        </Badge>
                      </td>
                      <td className="py-3">{new Date(outage.outageStart).toLocaleDateString()}</td>
                      <td className="py-3 font-mono">{outage.mwOffline} MW</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">No recent outages recorded</div>
          )}
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Upcoming Planned Outages</CardTitle>
        </CardHeader>
        <CardContent>
          {isUpcomingLoading ? (
            <Skeleton className="w-full h-64" />
          ) : upcoming && upcoming.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Facility</th>
                    <th className="pb-2 font-medium text-muted-foreground">Start</th>
                    <th className="pb-2 font-medium text-muted-foreground">Expected End</th>
                    <th className="pb-2 font-medium text-muted-foreground">MW Offline</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((outage) => (
                    <tr key={outage.id} className="border-b border-border/50">
                      <td className="py-3 font-medium">{outage.facility}</td>
                      <td className="py-3">{new Date(outage.outageStart).toLocaleDateString()}</td>
                      <td className="py-3">{outage.outageEnd ? new Date(outage.outageEnd).toLocaleDateString() : 'TBD'}</td>
                      <td className="py-3 font-mono">{outage.mwOffline} MW</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">No upcoming outages recorded</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
