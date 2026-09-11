import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { POINT_TYPES, TRANSPORT_CHOICES } from "@/lib/point-types";
import type { AttractionPoint } from "@shared/schema";

interface EditPointDialogProps {
  point: AttractionPoint | null;
  onClose: () => void;
}

const arrivalHourOptions = Array.from({ length: 17 }, (_, i) => {
  const hour = i + 7;
  return { value: hour, label: `${String(hour).padStart(2, "0")}:00` };
});

// Change a place's settings without deleting and re-adding it.
export function EditPointDialog({ point, onClose }: EditPointDialogProps) {
  const [type, setType] = useState("work");
  const [transport, setTransport] = useState("public_transport");
  const [minutes, setMinutes] = useState([30]);
  const [arrivalHour, setArrivalHour] = useState(9);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Load the point's current values whenever the dialog opens.
  useEffect(() => {
    if (!point) return;
    setType(point.type);
    setTransport(point.transport);
    setMinutes([point.travelTimeMinutes]);
    setArrivalHour(point.arrivalHour);
  }, [point]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!point) return;
      await apiRequest("PATCH", `/api/attraction-points/${point.id}`, {
        type,
        transport,
        travelTimeMinutes: minutes[0],
        arrivalHour,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attraction-points"] });
      toast({ title: "Место обновлено", description: "Зоны пересчитываются" });
      onClose();
    },
    onError: () => {
      toast({
        title: "Ошибка",
        description: "Не удалось сохранить изменения",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={point !== null} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Изменить место</DialogTitle>
        </DialogHeader>

        {point && (
          <div className="space-y-5">
            <div className="text-sm text-slate-600 bg-slate-50 rounded-md p-2 truncate">
              {point.address}
            </div>

            <div className="space-y-2">
              <Label>Что это за место</Label>
              <div className="flex flex-wrap gap-2">
                {POINT_TYPES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setType(option.value)}
                    className={
                      "flex items-center gap-1 rounded-full border px-3 py-1.5 text-sm transition-colors " +
                      (type === option.value
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium"
                        : "border-slate-200 text-slate-600 hover:bg-slate-50")
                    }
                  >
                    <span>{option.emoji}</span>
                    {option.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Как планируете добираться</Label>
              <div className="grid grid-cols-3 gap-2">
                {TRANSPORT_CHOICES.map((choice) => (
                  <button
                    key={choice.value}
                    type="button"
                    onClick={() => setTransport(choice.value)}
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

            <div className="space-y-2">
              <Label>Максимальное время в пути: {minutes[0]} мин</Label>
              <Slider
                value={minutes}
                onValueChange={setMinutes}
                max={120}
                min={10}
                step={5}
              />
              <div className="flex justify-between text-xs text-slate-500">
                <span>10 мин</span>
                <span>2 часа</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Во сколько обычно здесь бываете</Label>
              <Select
                value={String(arrivalHour)}
                onValueChange={(v) => setArrivalHour(parseInt(v, 10))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {arrivalHourOptions.map((option) => (
                    <SelectItem key={option.value} value={String(option.value)}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            {saveMutation.isPending ? "Сохраняем…" : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
