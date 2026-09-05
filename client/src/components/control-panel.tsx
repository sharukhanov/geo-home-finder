import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AttractionPointForm } from "./attraction-point-form";
import { PointsList } from "./points-list";
import { TransportInfo } from "./transport-info";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Zap, BarChart3, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint } from "@shared/schema";

interface ControlPanelProps {
  attractionPoints: AttractionPoint[];
  selectedPoint: {lat: number, lng: number} | null;
  onCalculateZones: () => void;
  isCalculating: boolean;
  onClearSelectedPoint: () => void;
}

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  onCalculateZones,
  isCalculating,
  onClearSelectedPoint
}: ControlPanelProps) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const hasPoints = attractionPoints.length > 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCalculate = () => {
    onCalculateZones();
    setShowAnalysis(true);
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reset", { userId: "default-user" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      setShowAnalysis(false);
      onClearSelectedPoint();
      toast({
        title: "Всё сброшено",
        description: "Точки и зоны удалены. Можно начать заново.",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось сбросить данные. Попробуйте ещё раз.",
        variant: "destructive",
      });
    },
  });

  const handleReset = () => {
    if (window.confirm("Удалить все точки и рассчитанные зоны?")) {
      resetMutation.mutate();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Panel Header */}
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Найти оптимальное жилье
        </h2>
        <p className="text-sm text-slate-600">
          Добавьте важные для вас места и настройте приоритеты
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Transport Info */}
        <TransportInfo />

        {/* Add Attraction Point Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-slate-900 flex items-center">
            <PlusCircle className="w-5 h-5 mr-2 text-blue-600" />
            Добавить точку притяжения
          </h3>

          <AttractionPointForm
            selectedPoint={selectedPoint}
            onClearSelectedPoint={onClearSelectedPoint}
          />
        </div>

        {/* Points List */}
        {hasPoints && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 flex items-center">
                <BarChart3 className="w-5 h-5 mr-2 text-emerald-600" />
                Добавленные точки ({attractionPoints.length})
              </h3>
              <PointsList points={attractionPoints} />
            </div>
          </>
        )}

        {/* Analysis Section */}
        {showAnalysis && hasPoints && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="font-medium text-slate-900 flex items-center">
                <Zap className="w-5 h-5 mr-2 text-purple-600" />
                Результаты анализа
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 space-y-3">
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-blue-500 rounded-full"></div>
                  <span className="text-sm text-slate-700">Идеальные зоны</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full"></div>
                  <span className="text-sm text-slate-700">Подходящие зоны</span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-4 h-4 bg-red-500 rounded-full"></div>
                  <span className="text-sm text-slate-700">Неподходящие зоны</span>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-t border-slate-100 space-y-3">
        <Button
          onClick={handleCalculate}
          disabled={!hasPoints || isCalculating}
          className="w-full"
          size="lg"
        >
          <Zap className="w-5 h-5 mr-2" />
          {isCalculating ? "Рассчитываем..." : "Рассчитать оптимальные зоны"}
        </Button>
        {hasPoints && (
          <Button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            variant="outline"
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetMutation.isPending ? "Сбрасываем..." : "Сбросить всё"}
          </Button>
        )}
      </div>
    </div>
  );
}
