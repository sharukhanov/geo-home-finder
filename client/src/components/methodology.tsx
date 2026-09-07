import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MethodologyProps {
  open: boolean;
  onClose: () => void;
}

// Answers the question users ask most often: how is the zone calculated?
export function Methodology({ open, onClose }: MethodologyProps) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Как считается зона</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm text-slate-700">
          <div className="flex items-start gap-3">
            <div className="text-2xl flex-none">1️⃣</div>
            <div>
              <div className="font-semibold text-slate-900">Зона вокруг каждого места</div>
              Для каждого вашего места мы строим «зону доступности»: область, из
              которой до него можно добраться за указанное вами время. Это не круг —
              расчёт идёт по реальным дорогам и маршрутам транспорта, поэтому вдоль
              шоссе и линий метро зона вытягивается дальше.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-2xl flex-none">2️⃣</div>
            <div>
              <div className="font-semibold text-slate-900">Учитываем время суток</div>
              Вы говорите, во сколько обычно бываете в этом месте (например, на
              работе к 9:00). Расчёт берёт типичные пробки и расписание транспорта
              именно на этот час буднего дня — утром в час пик зона заметно меньше,
              чем днём.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-2xl flex-none">3️⃣</div>
            <div>
              <div className="font-semibold text-slate-900">Пересекаем зоны</div>
              Зелёная зона на карте — это общая часть всех зон. Если она есть,
              значит из этих районов вы успеваете во <strong>все</strong> свои места
              за отведённое время. Если общей части нет, мы покажем зоны каждого
              места отдельно, чтобы было видно, почему они не пересеклись.
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="text-2xl flex-none">🔍</div>
            <div>
              <div className="font-semibold text-slate-900">Проверка адреса</div>
              Для конкретной квартиры мы считаем иначе — строим настоящий маршрут
              от неё до каждого вашего места и показываем точное время в минутах.
            </div>
          </div>

          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 space-y-1">
            <div className="font-semibold text-slate-900">Что важно знать</div>
            <ul className="list-disc list-inside space-y-1">
              <li>
                Время считается <strong>«от двери до двери»</strong>: пешком до
                остановки, ожидание, поездка и путь от остановки. Поэтому оно обычно
                больше, чем «время от метро до метро».
              </li>
              <li>
                Пробки берутся <strong>типичные для буднего дня</strong> на выбранный
                час, а не прямо сейчас.
              </li>
              <li>
                Граница зоны — это оценка. Адрес на самой границе стоит
                перепроверить через «Проверить адрес».
              </li>
            </ul>
          </div>

          <div className="text-xs text-slate-500 border-t pt-3">
            Данные о дорогах, пробках и расписаниях транспорта — 2ГИС.
            Карта — OpenStreetMap.
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
