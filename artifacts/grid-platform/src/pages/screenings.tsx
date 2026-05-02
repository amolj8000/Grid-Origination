import { useListScreenings, useDeleteScreening, getListScreeningsQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Bookmark, Trash2, Calendar, Target, Map, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function SavedScreenings() {
  const [, setLocation] = useLocation();
  const { data: screenings, isLoading } = useListScreenings();
  const deleteScreening = useDeleteScreening();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleDelete = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteScreening.mutate({ id }, {
      onSuccess: () => {
        toast({ title: "Screening deleted" });
        queryClient.invalidateQueries({ queryKey: getListScreeningsQueryKey() });
      }
    });
  };

  const handleLoadScreening = (screening: any) => {
    const params = new URLSearchParams();
    if (screening.filters?.market) params.append("market", screening.filters.market);
    if (screening.filters?.assetType) params.append("assetType", screening.filters.assetType);
    if (screening.objective) params.append("objective", screening.objective);
    
    setLocation(`/rankings?${params.toString()}`);
  };

  return (
    <div className="p-8 h-full overflow-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/20 rounded-md">
          <Bookmark className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Saved Screenings</h1>
          <p className="text-muted-foreground">Access previously configured pipeline filters and candidate lists.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="h-[400px] flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : screenings?.length === 0 ? (
        <div className="h-[400px] flex flex-col items-center justify-center border rounded-md border-dashed">
          <Bookmark className="h-12 w-12 text-muted-foreground/50 mb-4" />
          <h3 className="text-lg font-medium">No saved screenings</h3>
          <p className="text-muted-foreground text-sm max-w-sm text-center mt-2 mb-4">
            You haven't saved any screening sessions yet. Go to the Rankings page to save a filter configuration.
          </p>
          <Button onClick={() => setLocation('/rankings')}>Go to Rankings</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {screenings?.map((screening) => (
            <Card 
              key={screening.id} 
              className="bg-card border-border hover:border-primary/50 transition-all cursor-pointer group flex flex-col"
              onClick={() => handleLoadScreening(screening)}
            >
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">{screening.name}</CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDelete(screening.id, e)}
                    disabled={deleteScreening.isPending}
                  >
                    <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                  </Button>
                </div>
                <CardDescription className="flex items-center gap-1 mt-1">
                  <Calendar className="h-3 w-3" /> {new Date(screening.createdAt).toLocaleDateString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Target className="h-3 w-3" /> Objective
                    </span>
                    <span className="font-medium capitalize">{screening.objective.replace(/_/g, ' ')}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1">
                      Candidates
                    </span>
                    <span className="font-medium">{screening.candidateIds?.length || 0} saved</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Map className="h-3 w-3" /> Market
                    </span>
                    <Badge variant="outline">{screening.market || 'All'}</Badge>
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs uppercase tracking-wider block mb-1 flex items-center gap-1">
                      <Zap className="h-3 w-3" /> Asset Type
                    </span>
                    <Badge variant="secondary" className="capitalize">
                      {screening.assetType === 'all' ? 'All' : screening.assetType.replace('_', ' ')}
                    </Badge>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-0 pb-4 px-6 border-t border-border/50 mt-auto">
                <div className="w-full pt-4 text-sm text-center text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                  Click to reload screening &rarr;
                </div>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
