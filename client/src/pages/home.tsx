import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { MultiPolygon } from "geojson";
import { MapContainer } from "@/components/map-container";
import { ControlPanel } from "@/components/control-panel";
import { ResultCard } from "@/components/result-card";
import { Onboarding } from "@/components/onboarding";
import { ResetButton } from "@/components/reset-button";
import { Methodology } from "@/components/methodology";
import { Button } from "@/components/ui/button";
import { MapPin, Menu, Loader2, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import { track, trackOnce } from "@/lib/track";
import type { IsochroneFeature, CalculateResponse, Transport } from "@/lib/geo-types";
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
  const [failedTransports, setFailedTransports] = useState<Transport[]>([]);
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

  // Step 1 of the funnel: someone actually arrived and the page rendered.
  useEffect(() => {
    trackOnce("open");
  }, []);

  const clearResults = useCallback(() => {
    setIsochrones([]);
    setOptimalArea(null);
    setDistricts([]);
    setUseIsochrones(false);
    setFailedTransports([]);
  }, []);

  const calculateZonesMutation = useMutation({
    mutationFn: async () => {
      setIsCalculating(true);
      const response = await apiRequest("POST", "/api/zones/calculate", { userId });
      return response.json() as Promise<CalculateResponse>;
    },
    onSuccess: (data) => {
      setIsCalculating(false);

      // Step 3: the visitor got the answer they came for. Which mode produced
      // it matters — an approximate zone is a weaker result than a real one.
      track("zone_shown", {
        mode: data.mode,
        places: attractionPoints.length,
        hasArea: data.mode === "isochrone" ? !!data.optimalArea : undefined,
      });

      if (data.mode === "isochrone") {
        setUseIsochrones(true);
        setIsochrones(data.isochrones);
        setOptimalArea(data.optimalArea);
        setDistricts(data.districts ?? []);
        setFailedTransports([]);
      } else {
        setUseIsochrones(false);
        setIsochrones([]);
        setOptimalArea(null);
        setDistricts([]);
        setFailedTransports(data.failedTransports ?? []);
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
      await apiRequest(
        "DELETE",
        `/api/attraction-points/${id}?userId=${encodeURIComponent(userId)}`,
      );
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
    // On phones the form lives in a hidden drawer, so tapping the map looked
    // like nothing happened. Open it so the picked address is visible.
    setIsPanelOpen(true);
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
    <div className="relative h-[var(--app-h,100dvh)] w-full overflow-hidden">
      {/* Header */}
      <header className="absolute top-0 left-0 right-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Fatera</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Starting over belongs on the map, not inside the panel — there
                is nothing to reset until something has been added. */}
            {attractionPoints.length > 0 && (
              <ResetButton
                onReset={clearResults}
                onClearSelectedPoint={() => setSelectedPoint(null)}
              />
            )}

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

      {/* Control panel: a bottom sheet on phones (the map stays visible above
          it), a left sidebar from lg up. */}
      <div
        className={cn(
          "absolute z-30 bg-white transition-transform duration-300 ease-in-out flex flex-col",
          // phone: sheet anchored to the bottom, map visible above
          "inset-x-0 bottom-0 h-[calc(var(--app-h,100dvh)*0.72)]",
          "rounded-t-[1.75rem] shadow-[0_-8px_40px_rgba(0,0,0,0.12)]",
          isPanelOpen ? "translate-y-0" : "translate-y-full",
          // desktop: full-height sidebar on the left
          "lg:inset-x-auto lg:top-16 lg:left-0 lg:bottom-0 lg:h-auto lg:w-96",
          "lg:rounded-none lg:shadow-lg lg:border-r lg:border-slate-200 lg:translate-y-0",
          isPanelCollapsed ? "lg:-translate-x-full" : "lg:translate-x-0"
        )}
      >
        {/* Grab handle — signals the sheet can be dismissed. */}
        <button
          type="button"
          onClick={() => setIsPanelOpen(false)}
          aria-label="Свернуть панель"
          className="lg:hidden w-full pt-2 pb-1 flex justify-center flex-none"
        >
          <span className="h-1.5 w-10 rounded-full bg-slate-300" />
        </button>

        <div className="flex-1 min-h-0">
          <ControlPanel
            attractionPoints={attractionPoints}
            selectedPoint={selectedPoint}
            onClearSelectedPoint={() => setSelectedPoint(null)}
            onPointSelected={(lat, lng) => setSelectedPoint({ lat, lng })}
            // The answer appears on the map, so once a place is saved the
            // sheet steps aside instead of covering the thing it just
            // produced. Harmless on desktop, where the panel is a sidebar.
            onPlaceAdded={() => setIsPanelOpen(false)}
            onShowMethodology={() => setShowMethodology(true)}
          />
        </div>
      </div>

      {/* Phone: a permanent bar is the way in, so the map is never covered
          until the user asks for the sheet. */}
      {!isPanelOpen && (
        <div
          className="lg:hidden absolute bottom-0 inset-x-0 z-30 px-4 pt-8 bg-gradient-to-t from-white via-white/90 to-transparent"
          style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
        >
          <Button
            className="w-full h-12 text-base rounded-2xl shadow-lg"
            onClick={() => setIsPanelOpen(true)}
          >
            <Menu className="w-5 h-5 mr-2" />
            {attractionPoints.length > 0
              ? `Мои места (${attractionPoints.length})`
              : "Добавить место"}
          </Button>
        </div>
      )}

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
          failedTransports={failedTransports}
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
