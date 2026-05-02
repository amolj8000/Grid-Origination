import { useState } from "react";
import { useListQueueProjects, useGetQueueSummary } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer,
  Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";
import { Loader2, Search } from "lucide-react";

const FUEL_COLORS: Record<string, string> = {
  solar: "#f59e0b",
  wind: "#14b8a6",
  storage: "#8b5cf6",
  natural_gas: "#ef4444",
  nuclear: "#3b82f6",
  hydro: "#22c55e",
};
const FALLBACK_COLORS = ["#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#22c55e"];

const C = {
  teal: "#14b8a6",
  border: "#1e2d3e",
  mutedFg: "#64748b",
  tooltipBg: "#0f172a",
  tooltipBorder: "#1e293b",
  tooltipFg: "#f8fafc",
};
const TOOLTIP_STYLE = {
  backgroundColor: C.tooltipBg,
  borderColor: C.tooltipBorder,
  color: C.tooltipFg,
};

export default function InterconnectionQueue() {
  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilter, setMarketFilter] = useState<string | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);

  const { data: queueProjects, isLoading } = useListQueueProjects({
    market: marketFilter as any,
    status: statusFilter,
  });
  const { data: summary, isLoading: isLoadingSummary } = useGetQueueSummary();

  const filteredProjects = queueProjects?.filter(p =>
    p.projectName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (p.queueId && p.queueId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const fuelData = summary?.byFuelType?.map(d => ({
    ...d,
    fill: FUEL_COLORS[d.fuelType] ?? FALLBACK_COLORS[0],
  })) ?? [];

  return (
    <div className="p-8 h-full flex flex-col space-y-6">
      <div className="shrink-0">
        <h1 className="text-3xl font-bold tracking-tight">Interconnection Queue</h1>
        <p className="text-muted-foreground">Track public generation queue applications across ISOs.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 shrink-0">
        <Card>
          <CardHeader>
            <CardTitle>Capacity by Fuel Type</CardTitle>
            <CardDescription>Total MW queued by resource category</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            {isLoadingSummary ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : fuelData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={fuelData}
                    cx="40%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="totalCapacityMw"
                    nameKey="fuelType"
                  >
                    {fuelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} stroke="transparent" />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(value: number, name: string) => [`${value.toLocaleString()} MW`, name]}
                  />
                  <Legend
                    layout="vertical"
                    align="right"
                    verticalAlign="middle"
                    formatter={(value) => <span style={{ color: C.tooltipFg, fontSize: 12 }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Project Status Breakdown</CardTitle>
            <CardDescription>Count of projects by current phase</CardDescription>
          </CardHeader>
          <CardContent style={{ height: 260 }}>
            {isLoadingSummary ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : summary?.byStatus && summary.byStatus.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={summary.byStatus} layout="vertical" margin={{ top: 5, right: 30, left: 60, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={C.border} horizontal={false} />
                  <XAxis type="number" stroke={C.mutedFg} tick={{ fill: C.mutedFg, fontSize: 12 }} />
                  <YAxis dataKey="status" type="category" stroke={C.mutedFg} width={60} tick={{ fill: C.mutedFg, fontSize: 12 }} />
                  <RechartsTooltip contentStyle={TOOLTIP_STYLE} />
                  <Bar dataKey="count" name="Projects" fill={C.teal} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">No data</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-4 shrink-0">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search project or queue ID..."
            className="pl-8 bg-card"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        <Select value={marketFilter || "all"} onValueChange={v => setMarketFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Markets" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Markets</SelectItem>
            <SelectItem value="ERCOT">ERCOT</SelectItem>
            <SelectItem value="CAISO">CAISO</SelectItem>
            <SelectItem value="PJM">PJM</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Active">Active</SelectItem>
            <SelectItem value="Completed">Completed</SelectItem>
            <SelectItem value="Withdrawn">Withdrawn</SelectItem>
            <SelectItem value="Suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md flex-1 overflow-auto bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
            <TableRow>
              <TableHead>Queue ID</TableHead>
              <TableHead>Project Name</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Fuel Type</TableHead>
              <TableHead className="text-right">Capacity (MW)</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Location</TableHead>
              <TableHead>Request Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredProjects?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                  No queue projects found matching filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredProjects?.map((project) => (
                <TableRow key={project.id}>
                  <TableCell className="font-mono text-xs">{project.queueId || '—'}</TableCell>
                  <TableCell className="font-medium">{project.projectName}</TableCell>
                  <TableCell><Badge variant="outline">{project.market}</Badge></TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className="capitalize"
                      style={{ borderColor: FUEL_COLORS[project.fuelType] ?? "transparent", borderWidth: 1 }}
                    >
                      {project.fuelType}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-semibold">{project.capacityMw}</TableCell>
                  <TableCell>
                    <Badge variant={
                      project.status === 'Active' ? 'default' :
                      project.status === 'Withdrawn' ? 'destructive' : 'outline'
                    }>
                      {project.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {project.county ? `${project.county}, ${project.state}` : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {project.requestDate ? new Date(project.requestDate).toLocaleDateString() : '—'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
