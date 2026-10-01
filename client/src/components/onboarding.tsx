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
  { emoji: "📍", text: "Отметьте места, куда планируете добираться" },
  {
    emoji: "🚇",
    text: "Скажите, как планируете добираться (общественный транспорт, пешком "
      + "или на личном авто) и сколько времени готовы тратить на дорогу",
  },
  {
    emoji: "🟢",
    text: "Получите область, откуда успеваете во все выбранные места исходя "
      + "из ваших предпочтений по времени",
  },
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
      {/* The buttons sit outside the scrolling area so they are always on
          screen. Letting the whole dialog scroll instead meant that on a short
          screen the picture pushed "Понятно, начать" below the fold, and a
          dialog that scrolls does not look like one that scrolls. */}
      <DialogContent className="max-w-lg p-0 max-h-[90vh] overflow-hidden flex flex-col gap-0">
        <div className="overflow-y-auto">
        {/* Dimensions are set so the dialog does not resize under the reader
            when the picture arrives. */}
        <img
          src="/onboarding-result.jpg"
          width={1720}
          height={1200}
          alt="Карта Москвы: зелёным отмечены районы, из которых и до работы в Сити, и до МГУ можно доехать на метро за 40 минут."
          // Capped against the viewport, not just the dialog: on a short
          // screen the full-ratio picture pushed the button below the fold,
          // and a dialog that scrolls does not look like one that scrolls.
          className="w-full aspect-[43/30] max-h-[28vh] object-cover bg-slate-100"
        />

        <div className="px-6 pt-4 text-center">
          {/* The heading doubles as the dialog's accessible name, so screen
              readers announce what just opened instead of "dialog". */}
          <DialogTitle className="text-xl font-bold text-slate-900">
            Зелёное — районы, откуда вы везде успеваете
          </DialogTitle>
          <p className="text-sm text-slate-600 mt-2">
            Здесь человек работает в Сити, учится в МГУ и ездит на метро.
            Зелёным — откуда он доедет и туда, и туда{"\u00A0"}за 40 минут.
            Там ему и стоит искать жильё.
          </p>
        </div>

        <div className="px-6 pt-4 space-y-2">
          {STEPS.map((step, i) => (
            <div key={step.text} className="flex items-start gap-3 text-sm">
              <div className="text-xl flex-none">{step.emoji}</div>
              <div className="text-slate-700">
                <span className="text-slate-400 tabular-nums">{i + 1}.</span>{" "}
                {step.text}
              </div>
            </div>
          ))}
          </div>

        </div>

        <div className="p-6 pt-4 space-y-2 border-t border-slate-100 bg-white">
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
