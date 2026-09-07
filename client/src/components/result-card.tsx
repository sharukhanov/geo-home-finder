import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getPointType, TRANSPORT_LABELS } from "@/lib/point-types";
import type { Transport } from "@/lib/geo-types";
import type { AttractionPoint } from "@shared/schema";

interface ResultCardProps {
  hasOptimal: boolean;
  districts: string[];
  transport: Transport;
  points: AttractionPoint[];
  approximate?: boolean;
}

export function ResultCard({
  hasOptimal,
  districts,
  transport,
  points,
  approximate = false,
}: ResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);

  return (
    <Card className="absolute bottom-4 right-4 z-30 bg-white shadow-lg animate-in slide-in-from-bottom-2 duration-300 max-w-xs">
      <CardContent className="p-4 space-y-2">
        {hasOptimal ? (
          <>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm mt-1 flex-none" />
              <div>
                <div className="font-medium text-slate-900 text-sm">
                  Ищите жильё в зелёной зоне
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Отсюда вы успеваете во все свои места вовремя.
                </div>
              </div>
            </div>

            {districts.length > 0 && (
              <div className="text-sm text-slate-700 pt-1">
                <span className="text-slate-500 text-xs">Районы: </span>
                {districts.slice(0, 8).join(", ")}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-start gap-2">
            <div className="w-3 h-3 border border-blue-500 bg-blue-100 rounded-sm mt-1 flex-none" />
            <div>
              <div className="font-medium text-slate-900 text-sm">Общей зоны нет</div>
              <div className="text-xs text-slate-600 mt-0.5">
                До всех мест не успеть за заданное время. Синим — куда успеваете
                от каждого места отдельно. Увеличьте время или выберите места ближе.
              </div>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          className="flex items-center gap-1 text-xs text-blue-600 pt-1"
        >
          Как посчитали
          {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>

        {showDetails && (
          <div className="text-xs text-slate-600 space-y-1 border-t pt-2">
            <div>
              Способ: <strong>{TRANSPORT_LABELS[transport]?.emoji} {TRANSPORT_LABELS[transport]?.label}</strong>
            </div>
            {points.map((point) => {
              const info = getPointType(point.type);
              return (
                <div key={point.id}>
                  {info.emoji} {info.name} — до {point.travelTimeMinutes} мин, к{" "}
                  {String(point.arrivalHour).padStart(2, "0")}:00
                </div>
              );
            })}
            <div className="text-slate-500 pt-1">
              {approximate
                ? "Приблизительный расчёт по прямой линии."
                : "Данные 2ГИС: реальное время в пути с учётом типичных пробок в будни."}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
