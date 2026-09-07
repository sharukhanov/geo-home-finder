import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MultiPolygon } from "geojson";
import { MapContainer } from "@/components/map-container";
import { ControlPanel } from "@/components/control-panel";
import { ResultCard } from "@/components/result-card";
import { Onboarding } from "@/components/onboarding";
import { Methodology } from "@/components/methodology";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, Loader2, PanelLeftClose, PanelLeftOpen, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import type { IsochroneFeature, CalculateResponse } from "@/lib/geo-types";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint, Zone } from "@shared/schema";

export default function Home() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);
  // Show the explainer once per browser.
  const [showOnboarding, setShowOnboarding] = useState(() => {
    try {
      return localStorage.getItem("fatera-onboarded") !== "1";
    } catch {
      return true;
    }
  });
  const [showMethodology, setShowMethodology] = useState(false);
  // True when the methodology was opened from the onboarding, so closing it
  // returns there instead of dropping the user on an empty map.
  const [returnToOnboarding, setReturnToOnboarding] = useState(false);
  const [isCalculating, setIsCalculating] = useState(false);
  const [selectedPoint, setSelectedPoint] = useState<{lat: number, lng: number} | null>(null);
  const [isochrones, setIsochrones] = useState<IsochroneFeature[]>([]);
  const [optimalArea, setOptimalArea] = useState<MultiPolygon | null>(null);
  const [districts, setDistricts] = useState<string[]>([]);
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
    setDistricts([]);
    setUseIsochrones(false);
  }, []);

  const calculateZonesMutation = useMutation({
    mutationFn: async () => {
      setIsCalculating(true);
      const response = await apiRequest("POST", "/api/zones/calculate", { userId });
      return response.json() as Promise<CalculateResponse>;
    },
    onSuccess: (data) => {
      setIsCalculating(false);

      if (data.mode === "isochrone") {
        setUseIsochrones(true);
        setIsochrones(data.isochrones);
        setOptimalArea(data.optimalArea);
        setDistricts(data.districts ?? []);
      } else {
        setUseIsochrones(false);
        setIsochrones([]);
        setOptimalArea(null);
        setDistricts([]);
        queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      }
    },
    onError: () => {
      setIsCalculating(false);
      toast({
        title: "Ошибка расчёта",
        description: "Произошла ошибка при расчёте зон. Попробуйте ещё раз.",
        variant: "destructive",
      });
    },
  });

  const deletePointMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/attraction-points/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      toast({ title: "Место удалено" });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить место. Попробуйте ещё раз.",
        variant: "destructive",
      });
    },
  });

  // Auto-calculate whenever the points or transport mode change (debounced).
  const mutateRef = useRef(calculateZonesMutation.mutate);
  mutateRef.current = calculateZonesMutation.mutate;
  useEffect(() => {
    if (attractionPoints.length === 0) {
      clearResults();
      return;
    }
    const timer = setTimeout(() => mutateRef.current(), 500);
    return () => clearTimeout(timer);
  }, [attractionPoints, clearResults]);

  const handleMapClick = useCallback((lat: number, lng: number) => {
    setSelectedPoint({ lat, lng });
  }, []);

  const closeOnboarding = useCallback(() => {
    setShowOnboarding(false);
    try {
      localStorage.setItem("fatera-onboarded", "1");
    } catch {
      // ignore — the explainer will simply show again next time
    }
  }, []);

  const hasResults = useIsochrones ? isochrones.length > 0 : zones.length > 0;

  return (
    <div className="relative h-screen h-[100dvh] w-full overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Fatera</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowMethodology(true)}
              title="Как считается зона"
            >
              <HelpCircle className="w-4 h-4 sm:mr-2" />
              <span className="hidden sm:inline">Как это считается</span>
            </Button>
            {/* Collapse the panel to see the whole map (desktop) */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPanelCollapsed((v) => !v)}
              className="hidden lg:flex"
            >
              {isPanelCollapsed ? (
                <><PanelLeftOpen className="w-4 h-4 mr-2" />Показать панель</>
              ) : (
                <><PanelLeftClose className="w-4 h-4 mr-2" />Скрыть панель</>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPanelOpen(!isPanelOpen)}
              className="lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      {/* Map Container */}
      <MapContainer
        attractionPoints={attractionPoints}
        zones={useIsochrones ? [] : zones}
        isochrones={useIsochrones && !optimalArea ? isochrones : []}
        optimalArea={useIsochrones ? optimalArea : null}
        selectedPoint={selectedPoint}
        onMapClick={handleMapClick}
        onDeletePoint={(id) => deletePointMutation.mutate(id)}
        className="absolute inset-0 z-0"
      />

      {/* Control Panel */}
      <div
        className={cn(
          "absolute top-16 left-0 bottom-0 w-full lg:w-96 bg-white z-30 transition-transform duration-300 ease-in-out shadow-xl lg:shadow-lg border-r border-slate-200",
          isPanelOpen ? "translate-x-0" : "-translate-x-full",
          isPanelCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"
        )}
      >
        <ControlPanel
          attractionPoints={attractionPoints}
          selectedPoint={selectedPoint}
          onClearSelectedPoint={() => setSelectedPoint(null)}
          onPointSelected={(lat, lng) => setSelectedPoint({ lat, lng })}
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

      {/* Result card — hidden while the mobile panel covers the screen */}
      {hasResults && !isPanelOpen && (
        <ResultCard
          hasOptimal={useIsochrones ? !!optimalArea : true}
          districts={districts}
          points={attractionPoints}
          approximate={!useIsochrones}
        />
      )}

      <Onboarding
        open={showOnboarding}
        onClose={closeOnboarding}
        onShowMethodology={() => {
          // Hide the onboarding without marking it as seen — we come back to it.
          setShowOnboarding(false);
          setReturnToOnboarding(true);
          setShowMethodology(true);
        }}
      />
      <Methodology
        open={showMethodology}
        showBack={returnToOnboarding}
        onClose={() => {
          setShowMethodology(false);
          if (returnToOnboarding) {
            setReturnToOnboarding(false);
            setShowOnboarding(true);
          }
        }}
      />

      {/* Small non-blocking calculating indicator */}
      {isCalculating && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-white/95 shadow-md rounded-full px-4 py-2 text-sm text-slate-700">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
          Обновляем зоны…
        </div>
      )}
    </div>
  );
}
