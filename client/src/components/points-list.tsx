import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Trash2, Clock } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { AttractionPoint } from "@shared/schema";

interface PointsListProps {
  points: AttractionPoint[];
}

const typeEmojis: Record<string, string> = {
  'home': '🏠',
  'work': '🏢',
  'study': '🎓',
  'fitness': '💪',
  'hobby': '🎨',
  'family': '👨‍👩‍👧‍👦',
  'shopping': '🛍️',
  'other': '📍'
};

const typeNames: Record<string, string> = {
  'home': 'Дом',
  'work': 'Работа',
  'study': 'Учеба',
  'fitness': 'Фитнес',
  'hobby': 'Хобби',
  'family': 'Семья',
  'shopping': 'Покупки',
  'other': 'Другое'
};

export function PointsList({ points }: PointsListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deletePointMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/attraction-points/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      queryClient.invalidateQueries({ queryKey: ["/api/zones"] });
      toast({
        title: "Точка удалена",
        description: "Точка притяжения успешно удалена",
      });
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось удалить точку притяжения",
        variant: "destructive",
      });
    },
  });

  const handleDelete = (id: number) => {
    deletePointMutation.mutate(id);
  };

  if (points.length === 0) {
    return (
      <div className="text-center py-8 text-slate-500">
        <p className="text-sm">Точки притяжения не добавлены</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {points.map((point) => (
        <Card key={point.id} className="bg-slate-50 border border-slate-200">
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-lg">{typeEmojis[point.type]}</span>
                  {/* Always render the type name: stored names may already
                      include an emoji from older versions. */}
                  <h4 className="font-medium text-slate-900 truncate">
                    {typeNames[point.type] ?? point.name}
                  </h4>
                </div>
                
                <p className="text-sm text-slate-600 mb-3 truncate">
                  {point.address}
                </p>
                
                <div className="flex items-center space-x-3">
                  <Badge variant="secondary" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {point.travelTimeMinutes} мин
                  </Badge>
                  <Badge variant="secondary" className="text-xs">
                    к {String(point.arrivalHour).padStart(2, "0")}:00
                  </Badge>
                </div>
              </div>
              
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleDelete(point.id)}
                disabled={deletePointMutation.isPending}
                title="Удалить это место"
                aria-label="Удалить это место"
                className="text-slate-500 hover:text-red-600 hover:bg-red-50 ml-2 flex-none"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
