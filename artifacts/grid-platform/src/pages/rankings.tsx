import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListCandidates,
  useDeleteCandidate,
  useCreateScreening,
  useCreateCandidate,
  getListCandidatesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Search, Download, Save, Trash2, Plus, ArrowUpDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const SUB_SCORE_LABELS = ["Price", "Location", "Curtailment", "Interconnection", "Financial"];
const SUB_SCORE_COLORS = ["#14b8a6", "#8b5cf6", "#f59e0b", "#3b82f6", "#22c55e"];

export default function Rankings() {
  const searchParams = new URLSearchParams(window.location.search);

  const [searchTerm, setSearchTerm] = useState("");
  const [marketFilter, setMarketFilter] = useState<string | undefined>(searchParams.get("market") as any || undefined);
  const [assetTypeFilter, setAssetTypeFilter] = useState<string | undefined>(searchParams.get("assetType") as any || undefined);
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [addOpen, setAddOpen] = useState(false);

  const [newName, setNewName] = useState("");
  const [newMarket, setNewMarket] = useState("ERCOT");
  const [newAssetType, setNewAssetType] = useState("solar");
  const [newCapacity, setNewCapacity] = useState("");
  const [newState, setNewState] = useState("");
  const [newCounty, setNewCounty] = useState("");

  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: candidates, isLoading } = useListCandidates({
    market: marketFilter as any,
    assetType: assetTypeFilter as any,
    status: statusFilter as any,
  });

  const deleteCandidate = useDeleteCandidate();
  const createScreening = useCreateScreening();
  const createCandidate = useCreateCandidate();

  const handleExportCsv = () => {
    if (!candidates) return;
    const headers = ["Name", "Market", "Asset Type", "Capacity (MW)", "Score", "Status"];
    const rows = candidates.map(c => [c.name, c.market, c.assetType, c.capacityMw, c.overallScore, c.status]);
    const csv = [headers, ...rows].map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "candidates_export.csv";
    a.click();
  };

  const handleSaveScreening = () => {
    createScreening.mutate({
      data: {
        name: `Screening ${new Date().toLocaleDateString()}`,
        market: marketFilter || "All",
        assetType: assetTypeFilter || "All",
        objective: searchParams.get("objective") || "Custom",
        filters: { market: marketFilter, assetType: assetTypeFilter, status: statusFilter },
        candidateIds: candidates?.map(c => c.id) || [],
      },
    }, {
      onSuccess: () => toast({ title: "Screening saved" }),
      onError: () => toast({ title: "Failed to save screening", variant: "destructive" }),
    });
  };

  const handleDelete = (id: number) => {
    deleteCandidate.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Candidate removed" });
        queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
      },
    });
  };

  const handleAddCandidate = () => {
    if (!newName.trim() || !newCapacity) return;
    createCandidate.mutate({
      data: {
        name: newName.trim(),
        market: newMarket as any,
        assetType: newAssetType as any,
        capacityMw: parseFloat(newCapacity),
        state: newState || undefined,
        county: newCounty || undefined,
        status: "active" as any,
      },
    }, {
      onSuccess: () => {
        toast({ title: "Candidate added" });
        queryClient.invalidateQueries({ queryKey: getListCandidatesQueryKey() });
        setAddOpen(false);
        setNewName(""); setNewCapacity(""); setNewState(""); setNewCounty("");
      },
      onError: () => toast({ title: "Failed to add candidate", variant: "destructive" }),
    });
  };

  const filtered = candidates
    ?.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    .sort((a, b) => sortDir === "desc"
      ? b.overallScore - a.overallScore
      : a.overallScore - b.overallScore);

  return (
    <TooltipProvider>
      <div className="p-8 h-full flex flex-col space-y-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Candidate Rankings</h1>
            <p className="text-muted-foreground">Evaluate and compare siting opportunities.</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add Candidate
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={!candidates?.length}>
              <Download className="mr-1 h-4 w-4" /> Export CSV
            </Button>
            <Button size="sm" onClick={handleSaveScreening} disabled={createScreening.isPending || !candidates?.length}>
              {createScreening.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />}
              Save Screening
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 shrink-0">
          <div className="relative w-[280px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search candidates..." className="pl-8" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <Select value={marketFilter || "all"} onValueChange={v => setMarketFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="All Markets" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Markets</SelectItem>
              <SelectItem value="ERCOT">ERCOT</SelectItem>
              <SelectItem value="CAISO">CAISO</SelectItem>
              <SelectItem value="PJM">PJM</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assetTypeFilter || "all"} onValueChange={v => setAssetTypeFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Asset Types" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="solar">Solar</SelectItem>
              <SelectItem value="wind">Wind</SelectItem>
              <SelectItem value="storage">Storage</SelectItem>
              <SelectItem value="solar_storage">Solar + Storage</SelectItem>
              <SelectItem value="wind_storage">Wind + Storage</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter || "all"} onValueChange={v => setStatusFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
                <TableHead className="w-[240px]">Name</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Capacity</TableHead>
                <TableHead className="w-[160px]">
                  <button
                    className="flex items-center gap-1 hover:text-primary transition-colors"
                    onClick={() => setSortDir(d => d === "desc" ? "asc" : "desc")}
                  >
                    Score <ArrowUpDown className="h-3 w-3" />
                    <span className="text-xs text-muted-foreground ml-1">{sortDir === "desc" ? "High→Low" : "Low→High"}</span>
                  </button>
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
              ) : filtered?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                    No candidates found matching filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered?.map((c) => {
                  const subScores = [c.priceScore, c.locationScore, c.curtailmentScore, c.interconnectionScore, c.financialScore];
                  return (
                    <TableRow key={c.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium">{c.name}</TableCell>
                      <TableCell><Badge variant="outline">{c.market}</Badge></TableCell>
                      <TableCell><Badge variant="secondary" className="capitalize">{c.assetType.replace(/_/g, " ")}</Badge></TableCell>
                      <TableCell className="text-muted-foreground">{c.capacityMw} MW</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className={`font-bold text-base ${c.overallScore >= 75 ? "text-emerald-400" : c.overallScore >= 50 ? "text-amber-400" : "text-red-400"}`}>
                            {c.overallScore.toFixed(1)}
                          </span>
                          <Progress value={c.overallScore} className="h-1.5 w-14" />
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1 items-center">
                          {subScores.map((score, i) => (
                            <Tooltip key={i}>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col gap-0.5 cursor-default">
                                  <div className="h-6 w-5 bg-muted rounded-sm overflow-hidden flex flex-col-reverse">
                                    <div
                                      className="w-full rounded-sm transition-all"
                                      style={{
                                        height: `${score || 0}%`,
                                        backgroundColor: SUB_SCORE_COLORS[i],
                                        opacity: 0.85,
                                      }}
                                    />
                                  </div>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                <p className="font-medium">{SUB_SCORE_LABELS[i]}</p>
                                <p>{(score || 0).toFixed(0)} / 100</p>
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} disabled={deleteCandidate.isPending}>
                          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Candidate</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input placeholder="e.g. West Texas Solar I" value={newName} onChange={e => setNewName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Market *</Label>
                <Select value={newMarket} onValueChange={setNewMarket}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ERCOT">ERCOT</SelectItem>
                    <SelectItem value="CAISO">CAISO</SelectItem>
                    <SelectItem value="PJM">PJM</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Asset Type *</Label>
                <Select value={newAssetType} onValueChange={setNewAssetType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="solar">Solar</SelectItem>
                    <SelectItem value="wind">Wind</SelectItem>
                    <SelectItem value="storage">Storage</SelectItem>
                    <SelectItem value="solar_storage">Solar + Storage</SelectItem>
                    <SelectItem value="wind_storage">Wind + Storage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Capacity (MW) *</Label>
              <Input type="number" placeholder="e.g. 200" value={newCapacity} onChange={e => setNewCapacity(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>State</Label>
                <Input placeholder="e.g. TX" value={newState} onChange={e => setNewState(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>County</Label>
                <Input placeholder="e.g. Pecos" value={newCounty} onChange={e => setNewCounty(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button
              onClick={handleAddCandidate}
              disabled={!newName.trim() || !newCapacity || createCandidate.isPending}
            >
              {createCandidate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Add Candidate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
