import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, MapPin, Zap } from "lucide-react";

export function TransportInfo() {
  return (
    <div className="space-y-3 mb-4">
      <Card className="border-blue-100 bg-blue-50/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-blue-900 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            Как работает расчет времени
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0 text-sm text-blue-800">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Транспорт</Badge>
              <span>Метро, автобус, трамвай (~18 км/ч средняя скорость)</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">Пешком</Badge>
              <span>Прогулка до остановки и от остановки (~5 км/ч)</span>
            </div>
          </div>
          <div className="mt-3 p-2 bg-white/50 rounded text-xs">
            <strong>Пример:</strong> Время 30 мин = зоны 21 мин (идеально), 30 мин (хорошо), 39 мин (далеко)
          </div>
        </CardContent>
      </Card>
    </div>
  );
}