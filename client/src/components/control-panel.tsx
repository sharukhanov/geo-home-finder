import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AttractionPointForm } from "./attraction-point-form";
import { PointsList } from "./points-list";
import { TransportInfo } from "./transport-info";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { PlusCircle, Zap, BarChart3, RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import type { Transport } from "@/lib/geo-types";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint } from "@shared/schema";

interface ControlPanelProps {
  attractionPoints: AttractionPoint[];
  selectedPoint: {lat: number, lng: number} | null;
  onCalculateZones: (transport: Transport) => void;
  isCalculating: boolean;
  onClearSelectedPoint: () => void;
  onReset: () => void;
}

const transportOptions: { value: Transport; label: string }[] = [
  { value: "public_transport", label: "🚇 Общественный транспорт" },
  { value: "driving", label: "🚗 Автомобиль" },
  { value: "walking", label: "🚶 Пешком" },
];

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  onCalculateZones,
  isCalculating,
  onClearSelectedPoint,
  onReset
}: ControlPanelProps) {
  const hasPoints = attractionPoints.length > 0;
  const [transport, setTransport] = useState<Transport>("public_transport");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCalculate = () => {
    onCalculateZones(transport);
  };

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
          Добавьте важные для вас места и способ передвижения
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
      </div>

      {/* Action Buttons */}
      <div className="p-6 border-t border-slate-100 space-y-3">
        <div className="space-y-1.5">
          <Label>Как добираетесь</Label>
          <Select value={transport} onValueChange={(v) => setTransport(v as Transport)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {transportOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
