import { useState } from "react";
import { useListErcotNodalStats } from "@workspace/api-client-react";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, Search, ArrowUpDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NodalAnalysis() {
  const [searchTerm, setSearchTerm] = useState("");
  const [year, setYear] = useState<number>(2023);
  const [month, setMonth] = useState<number>(6); // Default June
  
  const { data: nodalStats, isLoading } = useListErcotNodalStats({ year, month });

  const filteredStats = nodalStats?.filter(s => 
    s.settlementPoint.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  // Sort by price descending to get top/bottom nodes
  const sortedByPrice = [...(nodalStats || [])].sort((a, b) => b.avgDaPrice - a.avgDaPrice);
  const topNodes = sortedByPrice.slice(0, 5);
  const bottomNodes = sortedByPrice.slice(-5).reverse();
  
  const chartData = [
    ...topNodes.map(n => ({ name: n.settlementPoint.split('_').pop()?.substring(0, 10) || n.settlementPoint, price: n.avgDaPrice, type: 'highest' })),
    ...bottomNodes.map(n => ({ name: n.settlementPoint.split('_').pop()?.substring(0, 10) || n.settlementPoint, price: n.avgDaPrice, type: 'lowest' }))
  ];

  return (
    <div className="p-8 h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Nodal Analysis</h1>
          <p className="text-muted-foreground">Settlement point spread calculator and ranking.</p>
        </div>
        <div className="flex gap-4">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2023">2023</SelectItem>
              <SelectItem value="2022">2022</SelectItem>
            </SelectContent>
          </Select>
          <Select value={month.toString()} onValueChange={(v) => setMonth(parseInt(v))}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">January</SelectItem>
              <SelectItem value="2">February</SelectItem>
              <SelectItem value="3">March</SelectItem>
              <SelectItem value="4">April</SelectItem>
              <SelectItem value="5">May</SelectItem>
              <SelectItem value="6">June</SelectItem>
              <SelectItem value="7">July</SelectItem>
              <SelectItem value="8">August</SelectItem>
              <SelectItem value="9">September</SelectItem>
              <SelectItem value="10">October</SelectItem>
              <SelectItem value="11">November</SelectItem>
              <SelectItem value="12">December</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 shrink-0">
        <Card className="col-span-1 lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle>Highest vs Lowest Pricing Nodes ($/MWh)</CardTitle>
          </CardHeader>
          <CardContent className="h-[250px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{fontSize: 12}} />
                  <YAxis stroke="hsl(var(--muted-foreground))" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                    cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                  />
                  <Bar dataKey="price" name="Avg DA Price" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.type === 'highest' ? 'hsl(var(--primary))' : 'hsl(var(--chart-2))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground border rounded-md border-dashed">
                No data available for this period.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex shrink-0">
        <div className="relative w-full max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search settlement point..." 
            className="pl-8 bg-card" 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="border rounded-md flex-1 overflow-auto bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
            <TableRow>
              <TableHead>Settlement Point</TableHead>
              <TableHead className="text-right">
                <div className="flex items-center justify-end gap-2 cursor-pointer hover:text-primary">
                  Avg DA Price <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead className="text-right">On-Peak Avg</TableHead>
              <TableHead className="text-right">Off-Peak Avg</TableHead>
              <TableHead className="text-right">Spread</TableHead>
              <TableHead className="text-right">Volatility (StdDev)</TableHead>
              <TableHead className="text-right">Negative %</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredStats.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No settlement points found.
                </TableCell>
              </TableRow>
            ) : (
              filteredStats.map((node) => {
                const spread = (node.onPeakAvg || 0) - (node.offPeakAvg || 0);
                return (
                  <TableRow key={node.id}>
                    <TableCell className="font-medium font-mono text-xs">{node.settlementPoint}</TableCell>
                    <TableCell className="text-right font-semibold">${node.avgDaPrice.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${(node.onPeakAvg || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${(node.offPeakAvg || 0).toFixed(2)}</TableCell>
                    <TableCell className="text-right font-medium text-primary">${spread.toFixed(2)}</TableCell>
                    <TableCell className="text-right">${(node.stdDev || 0).toFixed(2)}</TableCell>
                    <TableCell className={`text-right ${(node.negPricePercent || 0) > 5 ? 'text-destructive font-medium' : ''}`}>
                      {(node.negPricePercent || 0).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
