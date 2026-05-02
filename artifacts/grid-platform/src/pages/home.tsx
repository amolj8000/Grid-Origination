import { useState } from "react";
import { useLocation } from "wouter";
import { useGetDashboardSummary, useGetMarketBreakdown } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Loader2, Activity, Zap, Server, Network } from "lucide-react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [market, setMarket] = useState<string>("ERCOT");
  const [assetType, setAssetType] = useState<string>("solar");
  const [objective, setObjective] = useState<string>("lowest_lcoe");

  const { data: summary, isLoading: isLoadingSummary } = useGetDashboardSummary();
  const { data: breakdown, isLoading: isLoadingBreakdown } = useGetMarketBreakdown();

  const handleScreeningSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (market) params.append("market", market);
    if (assetType) params.append("assetType", assetType);
    params.append("objective", objective);
    setLocation(`/rankings?${params.toString()}`);
  };

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">Platform Overview</h1>
        <p className="text-muted-foreground">Market intelligence and candidate screening cockpit.</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Candidates</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="text-2xl font-bold">{summary?.activeCandidates || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              out of {summary?.totalCandidates || 0} total
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Capacity</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="text-2xl font-bold">{(summary?.totalCapacityMw || 0).toLocaleString()} MW</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across all markets</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Score</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="text-2xl font-bold text-primary">{(summary?.avgOverallScore || 0).toFixed(1)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Overall candidate health</p>
          </CardContent>
        </Card>
        <Card className="bg-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Queue Projects</CardTitle>
            <Network className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSummary ? <Loader2 className="h-4 w-4 animate-spin" /> : (
              <div className="text-2xl font-bold">{(summary?.queueProjectCount || 0).toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Tracked in ISO queues</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Screening Form */}
        <Card className="col-span-1 bg-card border-border">
          <CardHeader>
            <CardTitle>Start Screening</CardTitle>
            <CardDescription>Configure parameters to find optimal assets.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleScreeningSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="market">Market</Label>
                <Select value={market} onValueChange={setMarket}>
                  <SelectTrigger id="market">
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ERCOT">ERCOT</SelectItem>
                    <SelectItem value="CAISO">CAISO</SelectItem>
                    <SelectItem value="PJM">PJM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="assetType">Asset Type</Label>
                <Select value={assetType} onValueChange={setAssetType}>
                  <SelectTrigger id="assetType">
                    <SelectValue placeholder="Select asset type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solar">Solar</SelectItem>
                    <SelectItem value="wind">Wind</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="solar_storage">Solar + Storage</SelectItem>
                    <SelectItem value="wind_storage">Wind + Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="objective">Investment Objective</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger id="objective">
                    <SelectValue placeholder="Select objective" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lowest_lcoe">Lowest LCOE</SelectItem>
                    <SelectItem value="risk_adjusted_value">Risk-Adjusted Value</SelectItem>
                    <SelectItem value="load_hedge">Load Hedge</SelectItem>
                    <SelectItem value="decarbonization">Decarbonization Impact</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit" className="w-full">
                Run Screen
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Market Chart */}
        <Card className="col-span-2 bg-card border-border">
          <CardHeader>
            <CardTitle>Market Breakdown</CardTitle>
            <CardDescription>Candidate distribution by ISO and asset type.</CardDescription>
          </CardHeader>
          <CardContent className="h-[350px]">
            {isLoadingBreakdown ? (
              <div className="h-full flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : breakdown && Array.isArray(breakdown) && breakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={breakdown} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="market" stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} />
                  <YAxis stroke="hsl(var(--muted-foreground))" tick={{fill: 'hsl(var(--muted-foreground))'}} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--popover-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--popover-foreground))' }}
                  />
                  <Bar dataKey="count" name="Candidates" radius={[4, 4, 0, 0]}>
                    {breakdown.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-muted-foreground">
                No breakdown data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
