import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MultiPolygon } from "geojson";
import { MapContainer } from "@/components/map-container";
import { ControlPanel } from "@/components/control-panel";
import { ZoneLegend } from "@/components/zone-legend";
import { Button } from "@/components/ui/button";
import { MapPin, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import type { Transport, IsochroneFeature, CalculateResponse } from "@/lib/geo-types";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint, Zone } from "@shared/schema";

export default function Home() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<{lat: number, lng: number} | null>(null);
  // Isochrone-mode results (real travel-time zones). Empty in circle mode.
  const [isochrones, setIsochrones] = useState<IsochroneFeature[]>([]);
  const [optimalArea, setOptimalArea] = useState<MultiPolygon | null>(null);
  const [useIsochrones, setUseIsochrones] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const userId = getUserId();

  const { data: attractionPoints = [] } = useQuery<AttractionPoint[]>({
    queryKey: ["/api/attraction-points"],
    queryFn: async () => {
      const response = await fetch(`/api/attraction-points?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch attraction points");
      return response.json();
    },
  });

  const { data: zones = [] } = useQuery<Zone[]>({
    queryKey: ["/api/zones"],
    queryFn: async () => {
      const response = await fetch(`/api/zones?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch zones");
      return response.json();
    },
  });

  const clearResults = useCallback(() => {
    setIsochrones([]);
    setOptimalArea(null);
    setUseIsochrones(false);
  }, []);

  const calculateZonesMutation = useMutation({
    mutationFn: async (transport: Transport) => {
      setIsCalculating(true);
      const response = await apiRequest("POST", "/api/zones/calculate", {
        userId,
        transport,
      });
      return response.json() as Promise<CalculateResponse>;
    },
    onSuccess: (data) => {
      setIsCalculating(false);

      if (data.mode === "isochrone") {
        setUseIsochrones(true);
        setIsochrones(data.isochrones);
        setOptimalArea(data.optimalArea);
        if (!data.optimalArea) {
          toast({
            title: "Общая зона не найдена",
            description: "До всех точек не успеть за заданное время. Увеличьте время в пути или выберите более близкие места.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Готово!",
            description: "Зелёным показана область, откуда удобно добираться до всех точек.",
          });
        }
      } else {
        // Circle fallback mode
        setUseIsochrones(false);
        setIsochrones([]);
        setOptimalArea(null);
        queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
        const count = data.zones?.length ?? 0;
        if (count === 0) {
          toast({
            title: "Не удалось найти оптимальные зоны",
            description: "Точки слишком далеко друг от друга. Попробуйте уменьшить время в пути или выберите более близкие локации.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Зоны рассчитаны успешно!",
            description: `Найдено ${count} оптимальных зон для проживания.`,
          });
        }
      }
    },
    onError: () => {
      setIsCalculating(false);
      toast({
        title: "Ошибка расчета",
        description: "Произошла ошибка при расчете зон. Попробуйте еще раз.",
        variant: "destructive",
      });
    },
  });

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setSelectedPoint({ lat, lng });
  }, []);

  const togglePanel = () => {
    setIsPanelOpen(!isPanelOpen);
  };

  const hasResults = useIsochrones ? isochrones.length > 0 : zones.length > 0;

  return (
    <div className="relative h-screen w-full overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Fatera</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={togglePanel}
            className="lg:hidden"
          >
            <Menu className="w-5 h-5" />
          </Button>
        </div>
      </header>

      {/* Map Container */}
      <MapContainer
        attractionPoints={attractionPoints}
        zones={useIsochrones ? [] : zones}
        isochrones={useIsochrones ? isochrones : []}
        optimalArea={useIsochrones ? optimalArea : null}
        selectedPoint={selectedPoint}
        onMapClick={handleMapClick}
        className="absolute inset-0 z-0"
      />

      {/* Control Panel */}
      <div
        className={cn(
          "absolute top-16 left-0 bottom-0 w-full lg:w-96 bg-white z-30 transition-transform duration-300 ease-in-out shadow-xl lg:shadow-lg border-r border-slate-200",
          isPanelOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        <ControlPanel
          attractionPoints={attractionPoints}
          selectedPoint={selectedPoint}
          onCalculateZones={(transport) => calculateZonesMutation.mutate(transport)}
          isCalculating={isCalculating}
          onClearSelectedPoint={() => setSelectedPoint(null)}
          onReset={clearResults}
        />
      </div>

      {/* Mobile Overlay */}
      {isPanelOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-20"
          onClick={() => setIsPanelOpen(false)}
        />
      )}

      {/* Zone Legend */}
      {hasResults && <ZoneLegend isochroneMode={useIsochrones} />}

      {/* Loading Overlay */}
      {isCalculating && (
        <div className="absolute inset-0 bg-white bg-opacity-90 z-50 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
            <p className="text-slate-600 font-medium">Анализируем оптимальные зоны...</p>
          </div>
        </div>
      )}
    </div>
  );
}
