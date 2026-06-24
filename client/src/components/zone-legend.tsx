import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";

export function ZoneLegend() {
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
          <strong>Новый алгоритм:</strong> Поиск оптимальных мест между всеми точками притяжения
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
        
        <div className="text-xs text-slate-500 pt-2 border-t">
          <strong>Скорость:</strong> ~18 км/ч (средняя по городу с учетом пересадок)
        </div>
      </CardContent>
    </Card>
  );
}
