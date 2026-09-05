import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

interface ZoneLegendProps {
  isochroneMode?: boolean;
}

export function ZoneLegend({ isochroneMode = false }: ZoneLegendProps) {
  if (isochroneMode) {
    return (
      <Card className="absolute bottom-4 right-4 z-30 bg-white shadow-lg animate-in slide-in-from-bottom-2 duration-300 max-w-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-slate-900 flex items-center gap-2">
            <Info className="w-4 h-4" />
            Что на карте
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-3">
          <div className="text-xs text-slate-600 mb-1 p-2 bg-slate-50 rounded">
            Зоны рассчитаны по реальному времени в пути (данные 2ГИС).
          </div>

          <div className="space-y-2">
            <div className="flex items-start space-x-3">
              <div className="w-3 h-3 bg-emerald-500 rounded-sm mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-slate-900">Оптимальная зона</div>
                <div className="text-xs text-slate-600">Отсюда успеваешь до всех точек</div>
              </div>
            </div>

            <div className="flex items-start space-x-3">
              <div className="w-3 h-3 border border-blue-500 bg-blue-100 rounded-sm mt-0.5" />
              <div className="text-sm">
                <div className="font-medium text-slate-900">Зона одной точки</div>
                <div className="text-xs text-slate-600">Докуда успеть от каждой точки отдельно</div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="absolute bottom-4 right-4 z-30 bg-white shadow-lg animate-in slide-in-from-bottom-2 duration-300 max-w-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-slate-900 flex items-center gap-2">
          <Info className="w-4 h-4" />
          Оптимальность зон
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="text-xs text-slate-600 mb-3 p-2 bg-slate-50 rounded">
          <strong>Приблизительный расчёт</strong> (по прямой). Для точного —
          настройте ключ 2ГИС.
        </div>

        <div className="space-y-2">
          <div className="flex items-start space-x-3">
            <div className="w-3 h-3 bg-blue-500 rounded-full mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-slate-900">Идеально</div>
              <div className="text-xs text-slate-600">Быстрый доступ ко всем точкам</div>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="w-3 h-3 bg-emerald-500 rounded-full mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-slate-900">Хорошо</div>
              <div className="text-xs text-slate-600">Достижимо в указанное время</div>
            </div>
          </div>

          <div className="flex items-start space-x-3">
            <div className="w-3 h-3 bg-red-500 rounded-full mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-slate-900">Далеко</div>
              <div className="text-xs text-slate-600">Близко к лимиту времени</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
