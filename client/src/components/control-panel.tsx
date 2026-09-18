import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AttractionPointForm, FORM_ID } from "./attraction-point-form";
import { AddressCheck } from "./address-check";
import { PointsList } from "./points-list";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PlusCircle, RotateCcw, HelpCircle } from "lucide-react";
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
  onShowMethodology: () => void;
}

export function ControlPanel({
  attractionPoints,
  selectedPoint,
  onClearSelectedPoint,
  onPointSelected,
  onReset,
  onShowMethodology,
}: ControlPanelProps) {
  const hasPoints = attractionPoints.length > 0;
  // Once the user has places, the form collapses into a single button.
  const [showForm, setShowForm] = useState(false);
  const [addPending, setAddPending] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // A pending map selection always opens the form — otherwise the picked
  // address would land in a collapsed form the user can't see.
  const formVisible = !hasPoints || showForm || selectedPoint !== null;

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


  return (
    <div className="h-full flex flex-col">
      {/* Panel header. Hidden on the phone sheet, where vertical space is
          scarce and the onboarding already set the context. */}
      <div className="hidden lg:block px-6 py-4 border-b border-slate-100">
        <h2 className="text-lg font-semibold text-slate-900">
          Где снять или купить жильё?
        </h2>
        <p className="text-sm text-slate-600 mt-1">
          Добавьте места, куда ездите регулярно — покажем, где удобно жить.
        </p>
      </div>

      {/* Scrollable Content */}
      <div
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {/* Hint for first-time users, with the single explainer entry point. */}
        {!hasPoints && (
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-slate-700 space-y-2">
            <div>
              Добавьте 2–3 места (работа, зал…) — на карте зелёным покажем районы,
              откуда вы успеваете во все из них.
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full bg-white"
              onClick={onShowMethodology}
            >
              <HelpCircle className="w-4 h-4 mr-2 text-blue-600" />
              Как это считается
            </Button>
          </div>
        )}

        {formVisible ? (
          <AttractionPointForm
            selectedPoint={selectedPoint}
            onClearSelectedPoint={onClearSelectedPoint}
            onPointSelected={onPointSelected}
            onAdded={() => setShowForm(false)}
            onPendingChange={setAddPending}
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

        {hasPoints && (
          <div className="pt-2 border-t border-slate-100">
            <AddressCheck onPointSelected={onPointSelected} />
          </div>
        )}
      </div>

      {/* Footer: always outside the scroll area, so the primary action can
          never be scrolled out of view. */}
      {(formVisible || hasPoints) && (
        <div
          className="px-6 pt-3 border-t border-slate-100 bg-white space-y-2 flex-none"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {formVisible && (
            <Button
              type="submit"
              form={FORM_ID}
              disabled={addPending}
              className="w-full h-12 text-base rounded-2xl"
            >
              {addPending ? "Добавляем…" : "Добавить место"}
            </Button>
          )}

          {hasPoints && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                disabled={resetMutation.isPending}
                variant="ghost"
                size="sm"
                className="w-full text-slate-500"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                {resetMutation.isPending ? "Сбрасываем..." : "Сбросить всё"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить все места?</AlertDialogTitle>
                <AlertDialogDescription>
                  Мы удалим все добавленные места и рассчитанные зоны.
                  Это действие нельзя отменить.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Оставить</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => resetMutation.mutate()}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Удалить всё
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          )}
        </div>
      )}
    </div>
  );
}
