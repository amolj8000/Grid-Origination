import { useGetAesoConstraints, useGetAesoTransmissionCorridors } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Congestion() {
  const { data: constraints, isLoading: isConstraintsLoading } = useGetAesoConstraints({ limit: 50 });
  const { data: corridors, isLoading: isCorridorsLoading } = useGetAesoTransmissionCorridors();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Congestion & Constraints</h1>
        <p className="text-muted-foreground text-sm mt-1">Transmission constraints and corridor analysis</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Recent Constraint Events</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {isConstraintsLoading ? (
              <Skeleton className="w-full h-96" />
            ) : constraints && constraints.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Corridor/Facility</th>
                    <th className="pb-2 font-medium text-muted-foreground">Constrained (MW)</th>
                    <th className="pb-2 font-medium text-muted-foreground">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {constraints.map((event) => (
                    <tr key={event.id} className="border-b border-border/50">
                      <td className="py-2 text-muted-foreground">{new Date(event.eventDate).toLocaleDateString()} HE{event.hourEnding}</td>
                      <td className="py-2 font-medium">{event.corridor || event.facility}</td>
                      <td className="py-2 font-mono">{event.mwConstrained || "---"}</td>
                      <td className="py-2 text-destructive">{event.costCad ? `$${event.costCad.toLocaleString()}` : "---"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">No recent constraints</div>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader>
            <CardTitle className="text-sm font-medium">Key Transmission Corridors</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto">
            {isCorridorsLoading ? (
              <Skeleton className="w-full h-96" />
            ) : corridors && corridors.length > 0 ? (
               <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Corridor</th>
                    <th className="pb-2 font-medium text-muted-foreground">Rating (MW)</th>
                    <th className="pb-2 font-medium text-muted-foreground">Congestion %</th>
                  </tr>
                </thead>
                <tbody>
                  {corridors.map((c) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="py-2 font-medium">{c.corridorName}</td>
                      <td className="py-2 font-mono">{c.ratingMw || "---"}</td>
                      <td className="py-2">
                        <Badge variant="outline" className={c.congestionFrequencyPct && c.congestionFrequencyPct > 10 ? 'border-destructive text-destructive' : ''}>
                          {c.congestionFrequencyPct ? `${c.congestionFrequencyPct}%` : '---'}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="flex h-64 items-center justify-center text-muted-foreground">No corridor data</div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
