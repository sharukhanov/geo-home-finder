import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getPointType, TRANSPORT_LABELS } from "@/lib/point-types";
import { FeedbackWidget } from "./feedback-widget";
import type { AttractionPoint } from "@shared/schema";

interface ResultCardProps {
  hasOptimal: boolean;
  districts: string[];
  points: AttractionPoint[];
  approximate?: boolean;
}

export function ResultCard({
  hasOptimal,
  districts,
  points,
  approximate = false,
}: ResultCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  // On a phone this card covered the map with no way out, so it starts
  // collapsed to a single line there and expands on tap.
  const [collapsed, setCollapsed] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 1024,
  );

  const title = hasOptimal ? "Ищите жильё в зелёной зоне" : "Общей зоны нет";

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute bottom-28 left-4 right-4 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-xs z-20 flex items-center gap-2 rounded-2xl bg-white/90 backdrop-blur-xl shadow-lg px-4 py-3 text-left"
      >
        <span
          className={
            "w-3 h-3 rounded-sm flex-none " +
            (hasOptimal ? "bg-emerald-500" : "border border-blue-500 bg-blue-100")
          }
        />
        <span className="font-medium text-slate-900 text-sm truncate flex-1">{title}</span>
        <ChevronUp className="w-4 h-4 text-slate-400 flex-none" />
      </button>
    );
  }

  return (
    // Sits above the phone's bottom bar; back to the corner from lg up.
    <Card className="absolute bottom-28 left-4 right-4 lg:bottom-4 lg:left-auto lg:right-4 lg:max-w-xs z-20 rounded-2xl bg-white/95 backdrop-blur-xl border-slate-200/70 shadow-xl animate-in slide-in-from-bottom-2 duration-300 max-h-[40vh] overflow-y-auto">
      <CardContent className="p-4 space-y-2">
        {hasOptimal ? (
          <>
            <div className="flex items-start gap-2">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm mt-1 flex-none" />
              <div className="flex-1">
                <div className="font-medium text-slate-900 text-sm">
                  Ищите жильё в зелёной зоне
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  Отсюда вы успеваете во все свои места вовремя.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Свернуть"
                className="p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-600 flex-none"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
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
            <div className="flex-1">
              <div className="font-medium text-slate-900 text-sm">Общей зоны нет</div>
              <div className="text-xs text-slate-600 mt-0.5">
                До всех мест не успеть за заданное время. Синим — куда успеваете
                от каждого места отдельно. Увеличьте время или выберите места ближе.
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Свернуть"
              className="p-1 -mt-1 -mr-1 text-slate-400 hover:text-slate-600 flex-none"
            >
              <ChevronDown className="w-4 h-4" />
            </button>
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
            {points.map((point) => {
              const info = getPointType(point.type);
              const t = TRANSPORT_LABELS[point.transport];
              return (
                <div key={point.id}>
                  {info.emoji} {info.name} — {t?.emoji} до {point.travelTimeMinutes} мин, к{" "}
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

        <FeedbackWidget
          context={{
            hasOptimal,
            approximate,
            districts,
            places: points.map((p) => ({
              type: p.type,
              transport: p.transport,
              limitMinutes: p.travelTimeMinutes,
              arrivalHour: p.arrivalHour,
            })),
          }}
        />
      </CardContent>
    </Card>
  );
}
