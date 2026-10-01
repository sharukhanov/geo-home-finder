import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

interface OnboardingProps {
  open: boolean;
  onClose: () => void;
  onShowMethodology: () => void;
}

// Three lines, not three paragraphs. The picture above carries the idea; these
// only say what the visitor has to do to get one of their own.
const STEPS = [
  { emoji: "📍", text: "Отметьте места, куда будете ездить" },
  { emoji: "🚇", text: "Скажите, как добираетесь и сколько готовы ехать" },
  { emoji: "🟢", text: "Получите районы, откуда успеваете во все" },
];

/**
 * First-visit explainer.
 *
 * Led by a real result rather than a description of one. Most visitors arrive
 * from a link in a social app, give the screen a second, and do not read: a
 * picture of the answer makes the case in that second, where three paragraphs
 * about how it works do not.
 */
export function Onboarding({ open, onClose, onShowMethodology }: OnboardingProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-y-auto">
        {/* Dimensions are set so the dialog does not resize under the reader
            when the picture arrives. */}
        <img
          src="/onboarding-result.jpg"
          width={1720}
          height={1200}
          alt="Карта Москвы: зелёным отмечены районы, откуда можно вовремя добраться и до работы, и до учёбы."
          className="w-full aspect-[43/30] object-cover bg-slate-100"
        />

        <div className="px-6 pt-5 text-center">
          {/* The heading doubles as the dialog's accessible name, so screen
              readers announce what just opened instead of "dialog". */}
          <DialogTitle className="text-xl font-bold text-slate-900">
            Зелёное — районы, откуда вы везде успеваете
          </DialogTitle>
          <p className="text-sm text-slate-600 mt-2">
            Здесь человек работает в Сити и учится в МГУ. Жильё ему стоит
            искать в зелёном — оттуда он успевает и туда, и туда.
          </p>
        </div>

        <div className="px-6 pt-5 space-y-2.5">
          {STEPS.map((step, i) => (
            <div key={step.text} className="flex items-center gap-3 text-sm">
              <div className="text-xl flex-none">{step.emoji}</div>
              <div className="text-slate-700">
                <span className="text-slate-400 tabular-nums">{i + 1}.</span>{" "}
                {step.text}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-5 space-y-2">
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
