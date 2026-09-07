import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AttractionPointForm } from "./attraction-point-form";
import { PointsList } from "./points-list";
import { Button } from "@/components/ui/button";
import { PlusCircle, RotateCcw, Lightbulb } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint } from "@shared/schema";

interface ControlPanelProps {
  attractionPoints: AttractionPoint[];
  selectedPoint: {lat: number, lng: number} | null;
  onClearSelectedPoint: () => void;
  onPointSelected: (lat: number, lng: number) => void;
  onReset: () => void;
}

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  onClearSelectedPoint,
  onPointSelected,
  onReset,
}: ControlPanelProps) {
  const hasPoints = attractionPoints.length > 0;
  // Once the user has places, the form collapses into a single button.
  const [showForm, setShowForm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const formVisible = !hasPoints || showForm;

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reset", { userId: getUserId() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      onClearSelectedPoint();
      onReset();
      setShowForm(false);
      toast({ title: "Всё сброшено", description: "Можно начать заново." });
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
    if (window.confirm("Удалить все места и зоны?")) {
      resetMutation.mutate();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Panel Header */}
      <div className="px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">
          Где снять или купить жильё?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Добавьте места, куда ездите регулярно — покажем, где удобно жить.
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Onboarding hint for first-time users */}
        {!hasPoints && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 font-medium text-slate-900 mb-1">
              <Lightbulb className="w-4 h-4 text-blue-600" />
              Как это работает
            </div>
            Добавьте 2–3 места (работа, зал…) — на карте зелёным покажем районы,
            откуда вы успеваете во все из них.
          </div>
        )}

        {formVisible ? (
          <AttractionPointForm
            selectedPoint={selectedPoint}
            onClearSelectedPoint={onClearSelectedPoint}
            onPointSelected={onPointSelected}
            onAdded={() => setShowForm(false)}
          />
        ) : (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => setShowForm(true)}
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Добавить ещё место
          </Button>
        )}

        {/* Points List */}
        {hasPoints && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Ваши места ({attractionPoints.length})
            </div>
            <PointsList points={attractionPoints} />
          </div>
        )}
      </div>

      {/* Reset */}
      {hasPoints && (
        <div className="px-6 py-4 border-t border-slate-100">
          <Button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            variant="ghost"
            size="sm"
            className="w-full text-slate-500"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetMutation.isPending ? "Сбрасываем..." : "Сбросить всё"}
          </Button>
        </div>
      )}
    </div>
  );
}
