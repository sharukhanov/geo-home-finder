import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { getUserId } from "@/lib/user-id";

interface FeedbackWidgetProps {
  // Snapshot of what the user is rating, stored alongside the rating.
  context: Record<string, unknown>;
}

// Anonymous thumbs up/down plus an optional comment. No account needed —
// ratings are tied to the browser's anonymous id.
export function FeedbackWidget({ context }: FeedbackWidgetProps) {
  const [rating, setRating] = useState<"like" | "dislike" | null>(null);
  const [feedbackId, setFeedbackId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  const rate = async (value: "like" | "dislike") => {
    setRating(value);
    try {
      const response = await apiRequest("POST", "/api/feedback", {
        userId: getUserId(),
        rating: value,
        context,
      });
      const data = (await response.json()) as { id: number };
      setFeedbackId(data.id);
    } catch {
      // The rating is best-effort; don't block the user on a failure.
    }
  };

  const sendComment = async () => {
    if (!feedbackId || !comment.trim()) {
      setSent(true);
      return;
    }
    try {
      await apiRequest("PATCH", `/api/feedback/${feedbackId}`, { comment });
    } catch {
      // ignore
    }
    setSent(true);
  };

  if (sent) {
    return (
      <div className="border-t pt-2 text-xs text-emerald-700">
        Спасибо! Это поможет сделать сервис точнее.
      </div>
    );
  }

  return (
    <div className="border-t pt-2 space-y-2">
      {rating === null ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-slate-600">Результат оказался полезным?</span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => rate("like")}
              aria-label="Полезно"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2"
              onClick={() => rate("dislike")}
              aria-label="Не полезно"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-xs text-slate-600">
            {rating === "like"
              ? "Спасибо! Что понравилось или чего не хватает?"
              : "Жаль. Что пошло не так?"}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Пара слов (необязательно)"
            rows={2}
            className="text-sm"
          />
          <Button size="sm" className="w-full h-8" onClick={sendComment}>
            Отправить
          </Button>
        </div>
      )}
    </div>
  );
}
