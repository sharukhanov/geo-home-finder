import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";

interface OnboardingProps {
  open: boolean;
  onClose: () => void;
  onShowMethodology: () => void;
}

const STEPS = [
  {
    emoji: "📍",
    title: "Отметьте места, куда будете ездить",
    text: "Работа, учёба, зал — всё, куда вы планируете ездить регулярно.",
  },
  {
    emoji: "🚇",
    title: "Скажите, как хотите добираться",
    text: "На метро, на машине или пешком — и сколько времени готовы тратить на дорогу.",
  },
  {
    emoji: "🟢",
    title: "Получите зелёную зону",
    text: "Покажем районы, откуда вы будете успевать во все свои места. Там и стоит искать жильё.",
  },
];

// Full-screen first-visit explainer: what this service is, in three steps.
export function Onboarding({ open, onClose, onShowMethodology }: OnboardingProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
        <div className="px-6 pt-8 pb-6 text-center">
          <div className="text-5xl mb-3">🏡</div>
          <h2 className="text-2xl font-bold text-slate-900">
            Где снять или купить жильё?
          </h2>
          <p className="text-slate-600 mt-2">
            Fatera подскажет районы, из которых вам будет удобно добираться
            до всех важных для вас мест.
          </p>
        </div>

        <div className="px-6 space-y-3">
          {STEPS.map((step, i) => (
            <div
              key={step.title}
              className="flex items-start gap-4 rounded-xl bg-slate-50 p-4"
            >
              <div className="text-3xl flex-none">{step.emoji}</div>
              <div>
                <div className="font-semibold text-slate-900">
                  {i + 1}. {step.title}
                </div>
                <div className="text-sm text-slate-600 mt-0.5">{step.text}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 space-y-2">
          <Button className="w-full" size="lg" onClick={onClose}>
            Понятно, начать
          </Button>
          <Button
            variant="ghost"
            className="w-full text-slate-500"
            onClick={onShowMethodology}
          >
            Как всё это считается?
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
