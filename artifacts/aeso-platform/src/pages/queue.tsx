import { useGetAesoQueue, useGetAesoQueueStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

export default function Queue() {
  const { data: queue, isLoading: isQueueLoading } = useGetAesoQueue();
  const { data: stats, isLoading: isStatsLoading } = useGetAesoQueueStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Interconnection Queue</h1>
        <p className="text-muted-foreground text-sm mt-1">AESO project queue and development pipeline</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalProjects || "---"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Total Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalCapacityMw?.toLocaleString() || "---"} <span className="text-sm font-normal text-muted-foreground">MW</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase">Top Fuel Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.byFuelType?.[0]?.fuelType || "---"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats?.byFuelType?.[0]?.totalCapacityMw?.toLocaleString() || "0"} MW
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Queue Projects</CardTitle>
        </CardHeader>
        <CardContent>
          {isQueueLoading ? (
            <Skeleton className="w-full h-[500px]" />
          ) : queue && queue.length > 0 ? (
            <div className="overflow-x-auto h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Project Name</th>
                    <th className="pb-2 font-medium text-muted-foreground">Fuel Type</th>
                    <th className="pb-2 font-medium text-muted-foreground">Capacity</th>
                    <th className="pb-2 font-medium text-muted-foreground">Region</th>
                    <th className="pb-2 font-medium text-muted-foreground">Status</th>
                    <th className="pb-2 font-medium text-muted-foreground">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((project) => (
                    <tr key={project.id} className="border-b border-border/50">
                      <td className="py-3 font-medium">{project.projectName}</td>
                      <td className="py-3 text-muted-foreground">{project.fuelType}</td>
                      <td className="py-3 font-mono">{project.capacityMw} MW</td>
                      <td className="py-3">{project.region || project.county || "Unknown"}</td>
                      <td className="py-3">
                        <Badge variant="outline">{project.status}</Badge>
                      </td>
                      <td className="py-3">{project.expectedOnline || "TBD"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">No projects found in queue</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
