import { useState } from "react";
import { useListCandidates, useListQueueProjects } from "@workspace/api-client-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Layers, Filter } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Fix leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Custom icons based on score
const createIcon = (color: string) => {
  return new L.DivIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 16px; height: 16px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8]
  });
};

const greenIcon = createIcon('#22c55e');
const amberIcon = createIcon('#f59e0b');
const redIcon = createIcon('#ef4444');
const queueIcon = createIcon('#0ea5e9'); // Primary teal

export default function MapWorkspace() {
  const [showCandidates, setShowCandidates] = useState(true);
  const [showQueue, setShowQueue] = useState(false);

  const { data: candidates, isLoading: isLoadingCandidates } = useListCandidates();
  const { data: queueProjects, isLoading: isLoadingQueue } = useListQueueProjects();

  const getMarkerIcon = (score: number) => {
    if (score >= 75) return greenIcon;
    if (score >= 50) return amberIcon;
    return redIcon;
  };

  return (
    <div className="h-full flex relative">
      {/* Map Area */}
      <div className="flex-1 h-full z-0 relative">
        {(isLoadingCandidates || isLoadingQueue) && (
          <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center backdrop-blur-sm">
            <div className="flex items-center gap-2 bg-card p-4 rounded-md shadow-md border">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span>Loading map data...</span>
            </div>
          </div>
        )}
        <MapContainer 
          center={[39.8283, -98.5795]} // Center of US
          zoom={4} 
          style={{ height: '100%', width: '100%', zIndex: 0 }}
          className="bg-slate-900" // Dark background behind tiles
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" // Dark theme tiles
          />
          
          {showCandidates && candidates?.filter(c => c.latitude && c.longitude).map((candidate) => (
            <Marker 
              key={`cand-${candidate.id}`} 
              position={[candidate.latitude, candidate.longitude]}
              icon={getMarkerIcon(candidate.overallScore)}
            >
              <Popup className="dark-popup">
                <div className="font-semibold text-sm mb-1">{candidate.name}</div>
                <div className="text-xs text-muted-foreground">{candidate.market} • {candidate.assetType.replace('_', ' ')}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Capacity:</span><br/>
                    <span className="font-medium">{candidate.capacityMw} MW</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Score:</span><br/>
                    <span className={`font-medium ${candidate.overallScore >= 75 ? 'text-green-500' : candidate.overallScore >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                      {candidate.overallScore.toFixed(1)}
                    </span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}

          {showQueue && queueProjects?.filter(q => q.latitude && q.longitude).map((project) => (
            <Marker 
              key={`queue-${project.id}`} 
              position={[project.latitude!, project.longitude!]}
              icon={queueIcon}
            >
              <Popup>
                <div className="font-semibold text-sm mb-1">{project.projectName}</div>
                <div className="text-xs text-muted-foreground">Queue ID: {project.queueId}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Capacity:</span><br/>
                    <span className="font-medium">{project.capacityMw} MW</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Status:</span><br/>
                    <span className="font-medium">{project.status}</span>
                  </div>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      {/* Side Panel Overlay */}
      <div className="absolute top-4 right-4 z-10 w-80 space-y-4">
        <Card className="bg-card/95 backdrop-blur shadow-lg border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Layers className="h-4 w-4" /> Map Layers
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">Candidate Assets</Label>
                <p className="text-xs text-muted-foreground">Internal pipeline</p>
              </div>
              <Switch checked={showCandidates} onCheckedChange={setShowCandidates} />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-sm font-medium">ISO Queue</Label>
                <p className="text-xs text-muted-foreground">Public interconnection</p>
              </div>
              <Switch checked={showQueue} onCheckedChange={setShowQueue} />
            </div>
          </CardContent>
        </Card>

        {showCandidates && (
          <Card className="bg-card/95 backdrop-blur shadow-lg border-border">
             <CardHeader className="pb-3">
               <CardTitle className="text-sm font-semibold flex items-center gap-2">
                 <Filter className="h-4 w-4" /> Legend
               </CardTitle>
             </CardHeader>
             <CardContent className="space-y-2 text-sm">
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-green-500 border border-white/50" />
                 <span>High Score (&ge; 75)</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-amber-500 border border-white/50" />
                 <span>Medium Score (50-74)</span>
               </div>
               <div className="flex items-center gap-2">
                 <div className="w-3 h-3 rounded-full bg-red-500 border border-white/50" />
                 <span>Low Score (&lt; 50)</span>
               </div>
             </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
