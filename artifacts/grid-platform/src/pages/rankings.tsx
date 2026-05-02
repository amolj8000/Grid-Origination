import { useState } from "react";
import { useLocation } from "wouter";
import { 
  useListCandidates, 
  useDeleteCandidate, 
  useCreateScreening,
  getListCandidatesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Loader2, Search, Download, Save, Trash2, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Rankings() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const marketParam = searchParams.get("market") as any || undefined;
  const assetTypeParam = searchParams.get("assetType") as any || undefined;
  
  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilter, setMarketFilter] = useState<string | undefined>(marketParam);
  const [assetTypeFilter, setAssetTypeFilter] = useState<string | undefined>(assetTypeParam);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: candidates, isLoading } = useListCandidates({
    market: marketFilter as any,
    assetType: assetTypeFilter as any,
    status: statusFilter as any,
  });

  const deleteCandidate = useDeleteCandidate();
  const createScreening = useCreateScreening();

  const handleExportCsv = () => {
    if (!candidates) return;
    
    const headers = ["Name", "Market", "Asset Type", "Capacity (MW)", "Score", "Status"];
    const rows = candidates.map(c => [
      c.name, c.market, c.assetType, c.capacityMw, c.overallScore, c.status
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(r => r.join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "candidates_export.csv");
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSaveScreening = () => {
    createScreening.mutate({
      data: {
        name: `Screening ${new Date().toLocaleDateString()}`,
        market: marketFilter || "All",
        assetType: assetTypeFilter || "All",
        objective: searchParams.get("objective") || "Custom",
        filters: {
          market: marketFilter,
          assetType: assetTypeFilter,
          status: statusFilter
        },
        candidateIds: candidates?.map(c => c.id) || []
      }
    }, {
      onSuccess: () => {
        toast({ title: "Screening saved successfully" });
      },
      onError: () => {
        toast({ title: "Failed to save screening", variant: "destructive" });
      }
    });
  };

  const handleDelete = (id: number) => {
    deleteCandidate.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Candidate deleted" });
        queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      }
    });
  };

  const filteredCandidates = candidates?.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-8 h-full flex flex-col space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Candidate Rankings</h1>
          <p className="text-muted-foreground">Evaluate and compare siting opportunities.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCsv} disabled={!candidates?.length}>
            <Download className="mr-2 h-4 w-4" /> Export CSV
          </Button>
          <Button onClick={handleSaveScreening} disabled={createScreening.isPending || !candidates?.length}>
            {createScreening.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save Screening
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 shrink-0">
        <div className="relative w-[300px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search candidates..." 
            className="pl-8" 
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
        <Select value={assetTypeFilter || "all"} onValueChange={v => setAssetTypeFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="All Asset Types" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Asset Types</SelectItem>
            <SelectItem value="solar">Solar</SelectItem>
            <SelectItem value="wind">Wind</SelectItem>
            <SelectItem value="storage">Storage</SelectItem>
            <SelectItem value="solar_storage">Solar + Storage</SelectItem>
            <SelectItem value="wind_storage">Wind + Storage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="under_review">Under Review</SelectItem>
            <SelectItem value="contracted">Contracted</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border rounded-md flex-1 overflow-auto bg-card">
        <Table>
          <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
            <TableRow>
              <TableHead className="w-[250px]">Name</TableHead>
              <TableHead>Market</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Capacity</TableHead>
              <TableHead className="w-[150px]">
                <div className="flex items-center gap-2 cursor-pointer hover:text-primary">
                  Score <ArrowUpDown className="h-3 w-3" />
                </div>
              </TableHead>
              <TableHead>Sub-Scores</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : filteredCandidates?.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No candidates found matching filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredCandidates?.map((candidate) => (
                <TableRow key={candidate.id}>
                  <TableCell className="font-medium">{candidate.name}</TableCell>
                  <TableCell><Badge variant="outline">{candidate.market}</Badge></TableCell>
                  <TableCell><Badge variant="secondary" className="capitalize">{candidate.assetType.replace('_', ' ')}</Badge></TableCell>
                  <TableCell>{candidate.capacityMw} MW</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold ${candidate.overallScore >= 75 ? 'text-green-500' : candidate.overallScore >= 50 ? 'text-amber-500' : 'text-destructive'}`}>
                        {candidate.overallScore.toFixed(1)}
                      </span>
                      <Progress value={candidate.overallScore} className="h-2 w-16" />
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="grid grid-cols-5 gap-1 w-[200px]">
                      {[candidate.priceScore, candidate.locationScore, candidate.curtailmentScore, candidate.interconnectionScore, candidate.financialScore].map((score, i) => (
                        <div key={i} className="h-1.5 w-full bg-muted rounded-full overflow-hidden" title={`Sub-score: ${score}`}>
                          <div 
                            className={`h-full ${(score || 0) >= 75 ? 'bg-green-500' : (score || 0) >= 50 ? 'bg-amber-500' : 'bg-destructive'}`} 
                            style={{ width: `${score || 0}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(candidate.id)} disabled={deleteCandidate.isPending}>
                      <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                    </Button>
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
