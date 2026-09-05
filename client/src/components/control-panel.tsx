import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AttractionPointForm } from "./attraction-point-form";
import { PointsList } from "./points-list";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, BarChart3, RotateCcw, Lightbulb, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import type { Transport } from "@/lib/geo-types";
import { getPointType, TRANSPORT_LABELS } from "@/lib/point-types";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint } from "@shared/schema";

interface ControlPanelProps {
  attractionPoints: AttractionPoint[];
  selectedPoint: {lat: number, lng: number} | null;
  transport: Transport;
  onTransportChange: (t: Transport) => void;
  onClearSelectedPoint: () => void;
  onReset: () => void;
  showResultSummary: boolean;
}

const transportChoices: { value: Transport; emoji: string; label: string }[] = [
  { value: "public_transport", emoji: "🚇", label: "Транспорт" },
  { value: "driving", emoji: "🚗", label: "Авто" },
  { value: "walking", emoji: "🚶", label: "Пешком" },
];

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  transport,
  onTransportChange,
  onClearSelectedPoint,
  onReset,
  showResultSummary,
}: ControlPanelProps) {
  const hasPoints = attractionPoints.length > 0;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const resetMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/reset", { userId: getUserId() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      onClearSelectedPoint();
      onReset();
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
    if (window.confirm("Удалить все точки и зоны?")) {
      resetMutation.mutate();
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Panel Header */}
      <div className="p-6 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900 mb-2">
          Найти оптимальное жильё
        </h2>
        <p className="text-sm text-slate-600">
          Добавьте места, куда ездите каждый день — мы покажем, где удобно жить.
        </p>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Onboarding hint for first-time users */}
        {!hasPoints && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-4 space-y-2">
            <div className="flex items-center gap-2 font-medium text-slate-900">
              <Lightbulb className="w-5 h-5 text-blue-600" />
              С чего начать
            </div>
            <ol className="text-sm text-slate-700 space-y-1 list-decimal list-inside">
              <li>Добавьте 2–3 места (работа, зал, учёба…).</li>
              <li>Для каждого — адрес (или клик по карте).</li>
              <li>Выберите, как добираетесь.</li>
              <li>Зелёным на карте покажем, где удобно жить.</li>
            </ol>
          </div>
        )}

        {/* Transport selector */}
        <div className="space-y-2">
          <h3 className="font-medium text-slate-900 text-sm">Как добираетесь</h3>
          <div className="grid grid-cols-3 gap-2">
            {transportChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => onTransportChange(choice.value)}
                className={
                  "flex flex-col items-center justify-center gap-1 rounded-lg border py-2 text-xs transition-colors " +
                  (transport === choice.value
                    ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50")
                }
              >
                <span className="text-lg">{choice.emoji}</span>
                {choice.label}
              </button>
            ))}
          </div>
        </div>

        <Separator />

        {/* Add Attraction Point Section */}
        <div className="space-y-4">
          <h3 className="font-medium text-slate-900 flex items-center">
            <PlusCircle className="w-5 h-5 mr-2 text-blue-600" />
            Добавить место
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
                Добавленные места ({attractionPoints.length})
              </h3>
              <PointsList points={attractionPoints} />
            </div>
          </>
        )}

        {/* Methodology summary after calculation */}
        {showResultSummary && hasPoints && (
          <>
            <Separator />
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 p-4 space-y-2">
              <div className="flex items-center gap-2 font-medium text-slate-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                Как посчитали
              </div>
              <p className="text-sm text-slate-700">
                Способ передвижения: <strong>{TRANSPORT_LABELS[transport]?.emoji} {TRANSPORT_LABELS[transport]?.label}</strong>.
                Учли типичные пробки в будни на нужное время:
              </p>
              <ul className="text-sm text-slate-700 space-y-1">
                {attractionPoints.map((point) => {
                  const info = getPointType(point.type);
                  return (
                    <li key={point.id}>
                      {info.emoji} <strong>{info.name}</strong> — не дольше {point.travelTimeMinutes} мин, к {String(point.arrivalHour).padStart(2, "0")}:00
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-slate-500 pt-1">
                Зелёная зона — места, откуда успеваете во все точки к нужному времени.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Reset */}
      {hasPoints && (
        <div className="p-6 border-t border-slate-100">
          <Button
            onClick={handleReset}
            disabled={resetMutation.isPending}
            variant="outline"
            className="w-full"
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            {resetMutation.isPending ? "Сбрасываем..." : "Сбросить всё"}
          </Button>
        </div>
      )}
    </div>
  );
}
