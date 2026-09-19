import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { Button } from "@/components/ui/button";
import { RotateCcw } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";
import { useToast } from "@/hooks/use-toast";

interface ResetButtonProps {
  /** Clears the calculated zones held in the page's state. */
  onReset: () => void;
  onClearSelectedPoint: () => void;
}

/**
 * Starting over lived at the bottom of the panel, which on a phone means
 * behind a closed sheet — people couldn't find it. It sits in the header
 * instead, where it is visible from the map itself.
 */
export function ResetButton({ onReset, onClearSelectedPoint }: ResetButtonProps) {
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
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={resetMutation.isPending}
          // The label is hidden on a narrow screen, which would otherwise
          // leave an icon-only button with no accessible name at all.
          aria-label="Начать заново"
          className="rounded-full"
        >
          <RotateCcw className="w-4 h-4 sm:mr-2" />
          {/* The icon carries the meaning on a narrow screen; the label would
              crowd out the service name next to it. */}
          <span className="hidden sm:inline">
            {resetMutation.isPending ? "Сбрасываем…" : "Начать заново"}
          </span>
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
  );
}
