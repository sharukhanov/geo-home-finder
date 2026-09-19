// Human-readable funnel summary, served behind ADMIN_TOKEN.
//
// The question this page answers is "do people want this?", so it shows how
// many visitors reached each step and how many fell away between them — the
// drop-offs are the finding, not the totals.

import type { FunnelReport, ProductMetrics } from "./storage";

const STEP_LABELS: Record<string, { title: string; hint: string }> = {
  open: { title: "Открыли сайт", hint: "дошли по ссылке и страница загрузилась" },
  place_added: { title: "Добавили место", hint: "поняли, что делать, и сделали" },
  zone_shown: { title: "Увидели зону", hint: "получили ответ, ради которого пришли" },
  address_checked: {
    title: "Проверили адрес",
    hint: "стали примерять ответ на реальную квартиру",
  },
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// A value going inside <script> needs more than JSON quoting: a literal
// "</script>" in the string would close the tag and escape into markup.
function toJsLiteral(value: string): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

function asPercent(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

function asDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 90) return `${seconds} сек`;
  return `${Math.round(seconds / 60)} мин`;
}

// Standard product vocabulary for the names, so these travel to a deck or a
// conversation with an investor unchanged, with the definition spelled out in
// terms of our own events — a borrowed name with a different denominator is
// worse than no name at all.
function renderMetrics(m: ProductMetrics): string {
  const cards: Array<{
    name: string;
    value: string;
    what: string;
    formula: string;
    warn?: boolean;
  }> = [
    {
      name: "Activation Rate",
      value: asPercent(m.activationRate),
      what: "Активация. Доля пришедших, кто добавил хотя бы одно место, то есть понял, что от него требуется.",
      formula: "добавили место ÷ открыли сайт",
    },
    {
      name: "Aha-Moment Rate",
      value: asPercent(m.valueRate),
      what: "Дошли до ценности. Доля пришедших, кто увидел зону — получил ответ, ради которого пришёл. Главная цифра сервиса.",
      formula: "увидели зону ÷ открыли сайт",
    },
    {
      name: "High-Intent Rate",
      value: asPercent(m.deepInterestRate),
      what: "Глубокий интерес. Доля пришедших, кто стал проверять конкретный адрес. Сильнейший сигнал спроса, доступный без денег.",
      formula: "проверили адрес ÷ открыли сайт",
    },
    {
      name: "Bounce Rate",
      value: asPercent(m.bounceRate),
      what: "Отказы. Открыли и не сделали ничего. Высокое значение — проблема первого экрана, а не идеи.",
      formula: "ни одного действия после открытия ÷ открыли сайт",
      warn: m.bounceRate !== null && m.bounceRate > 0.6,
    },
    {
      name: "Return Rate",
      value: asPercent(m.returnRate),
      what: "Возвраты. Заходили в разные календарные дни. Для инструмента разового пользования даже небольшая цифра — сильный результат.",
      formula: "были активны более чем в один день ÷ все посетители",
    },
    {
      name: "Time to Value",
      value: asDuration(m.medianSecondsToValue),
      what: "Время до ценности. Сколько проходит от открытия до первой зоны. Берётся медиана, а не среднее: один зависший посетитель не должен портить картину.",
      formula: "медиана(первая зона − открытие сайта)",
    },
    {
      name: "Depth of Use",
      value: m.avgPlacesPerActivated === null ? "—" : String(m.avgPlacesPerActivated),
      what: "Глубина использования. Сколько мест добавляет тот, кто начал. Меньше двух — сервисом пользуются не по назначению: вся идея в пересечении нескольких точек.",
      formula: "всего мест ÷ посетители, добавившие хотя бы одно",
    },
    {
      name: "Fallback Rate",
      value: asPercent(m.approximateShare),
      what: "Приблизительные расчёты. Доля зон, посчитанных без 2ГИС. Высокое значение означает не плохой продукт, а отсутствие данных о продукте: люди видели не тот результат, который вы обещаете.",
      formula: "расчёты без 2ГИС ÷ все расчёты",
      warn: m.approximateShare !== null && m.approximateShare > 0.2,
    },
  ];

  const tiles = cards
    .map(
      (c) => `
      <div class="metric${c.warn ? " warn" : ""}">
        <div class="mlabel">${escapeHtml(c.name)}</div>
        <div class="mvalue">${escapeHtml(c.value)}</div>
        <div class="hint">${escapeHtml(c.what)}</div>
        <div class="formula">${escapeHtml(c.formula)}</div>
      </div>`,
    )
    .join("");

  const f = m.feedback;
  const rating = `
    <div class="metric wide">
      <div class="mlabel">Satisfaction Score</div>
      <div class="mvalue">${
        f.total === 0
          ? '<span class="sub">пока никто не оценивал</span>'
          : `${asPercent(f.likeShare)} <span class="sub">довольны</span>`
      }</div>
      <div class="hint">
        ${
          f.total === 0
            ? "Удовлетворённость. Кнопки «нравится / не нравится» появляются после расчёта зоны."
            : `Удовлетворённость. ${f.likes} 👍 и ${f.dislikes} 👎 из ${f.total} оценок.
               Feedback Response Rate — ${asPercent(f.responseRate)}: столько из увидевших зону вообще оценили результат.
               ${f.total < 10 ? "<b>Оценок пока слишком мало, чтобы делать выводы.</b>" : ""}`
        }
      </div>
      <div class="formula">👍 ÷ (👍 + 👎) · охват: все оценки ÷ увидели зону</div>
    </div>`;

  return `<div class="metrics">${tiles}${rating}</div>`;
}

const PERIODS: Array<{ days: number; label: string }> = [
  { days: 1, label: "24 часа" },
  { days: 7, label: "7 дней" },
  { days: 30, label: "30 дней" },
  { days: 90, label: "90 дней" },
];

export function renderStatsPage(report: FunnelReport, token: string): string {
  const top = report.steps[0]?.visitors ?? 0;
  const q = encodeURIComponent(token);

  const periods = PERIODS.map(
    ({ days, label }) =>
      `<a class="period${days === report.sinceDays ? " on" : ""}" href="/api/stats?token=${q}&days=${days}">${label}</a>`,
  ).join("");

  const rows = report.steps
    .map((step, i) => {
      const label = STEP_LABELS[step.name] ?? { title: step.name, hint: "" };
      const previous = i === 0 ? step.visitors : report.steps[i - 1].visitors;
      const lost = previous - step.visitors;
      const width = top ? Math.max((step.visitors / top) * 100, 1.5) : 0;

      const dropped =
        i === 0 || lost <= 0
          ? ""
          : `<div class="drop">↓ потеряли ${lost} — ${pct(lost, previous)} тех, кто был на предыдущем шаге</div>`;

      return `
        ${dropped}
        <div class="step">
          <div class="bar" style="width:${width.toFixed(1)}%"></div>
          <div class="row">
            <div>
              <div class="title">${escapeHtml(label.title)}</div>
              <div class="hint">${escapeHtml(label.hint)}</div>
            </div>
            <div class="nums">
              <div class="big">${step.visitors}</div>
              <div class="hint">${pct(step.visitors, top)} от пришедших · ${step.events} действий</div>
            </div>
          </div>
        </div>`;
    })
    .join("");

  const sources = report.sources.length
    ? report.sources
        .map(
          (s) =>
            `<tr><td>${escapeHtml(s.source)}</td><td class="num">${s.visitors}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="2" class="hint">Пока никто не заходил.</td></tr>`;

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fatera — воронка</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; line-height: 1.5;
    background: #f7f8fa; color: #0f172a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 36px 0 10px; }
  .hint { color: #64748b; font-size: 13px; }
  .step { position: relative; background: #fff; border: 1px solid #e2e8f0;
    border-radius: 14px; padding: 14px 16px; margin: 0; overflow: hidden; }
  .bar { position: absolute; inset: 0 auto 0 0; background: #e8f0ff; }
  .row { position: relative; display: flex; justify-content: space-between;
    align-items: center; gap: 16px; }
  .title { font-weight: 600; }
  .nums { text-align: right; white-space: nowrap; }
  .big { font-size: 22px; font-weight: 700; }
  .drop { color: #b45309; font-size: 13px; padding: 8px 16px; }
  table { width: 100%; border-collapse: collapse; background: #fff;
    border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
  td { padding: 10px 14px; border-top: 1px solid #f1f5f9; }
  tr:first-child td { border-top: 0; }
  .num { text-align: right; font-weight: 600; width: 90px; }
  footer { margin-top: 36px; font-size: 13px; color: #64748b;
    border-top: 1px solid #e2e8f0; padding-top: 20px; }
  .metrics { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .metric { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px; padding: 14px 16px; }
  .metric.warn { border-color: #fcd34d; background: #fffbeb; }
  .metric.wide { grid-column: 1 / -1; }
  .mlabel { font-size: 13px; color: #64748b; }
  .mvalue { font-size: 26px; font-weight: 700; margin: 2px 0 4px; }
  .mlabel { letter-spacing: .2px; }
  .formula { margin-top: 8px; padding-top: 8px; border-top: 1px dashed #e2e8f0;
    font-size: 12px; color: #94a3b8; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .note { background: #fff; border: 1px solid #e2e8f0; border-radius: 14px;
    padding: 14px 16px; font-size: 13px; color: #64748b; margin-top: 20px; }
  .sub { font-size: 14px; font-weight: 500; color: #64748b; }
  .periods { display: flex; gap: 8px; margin: 16px 0 0; flex-wrap: wrap; }
  .period { font-size: 14px; text-decoration: none; color: #334155;
    background: #fff; border: 1px solid #e2e8f0; border-radius: 999px;
    padding: 7px 16px; }
  .period.on { background: #0a66ff; border-color: #0a66ff; color: #fff; font-weight: 600; }
  #reset { font: inherit; font-weight: 600; color: #b91c1c; background: #fff;
    border: 1px solid #fecaca; border-radius: 10px; padding: 9px 16px; cursor: pointer; }
  #reset:hover { background: #fef2f2; }
  #reset:disabled { opacity: .6; cursor: default; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e2e8f0; }
    .metric, .note { background: #131c2e; border-color: #1e293b; }
    .formula { border-color: #1e293b; }
    .metric.warn { background: #2a2413; border-color: #6b5a1e; }
    .step, table, .period { background: #131c2e; border-color: #1e293b; color: #cbd5e1; }
    .period.on { background: #0a66ff; border-color: #0a66ff; color: #fff; }
    footer { border-color: #1e293b; }
    #reset { background: #1f1416; border-color: #4c1d1d; color: #fca5a5; }
    .bar { background: #17305c; }
    td { border-color: #1e293b; }
  }
</style></head><body>
  <h1>Воронка</h1>
  <div class="hint">Считаются люди, а не клики: один человек, добавивший четыре места, — это один человек на шаге «добавили место».</div>

  <div class="periods">${periods}</div>

  <h2>Путь посетителя</h2>
  ${rows}

  <h2>Продуктовые метрики</h2>
  ${renderMetrics(report.metrics)}

  <div class="note">
    <b>Чего здесь нет и почему.</b>
    <b>NPS</b> требует отдельного вопроса «насколько вероятно, что порекомендуете» со шкалой 0–10;
    из двух кнопок «нравится / не нравится» его не восстановить, а назвать долю лайков словом NPS —
    значит получить цифру, которую нельзя сравнивать с чужими. <b>CTR</b> — это клики ÷ показы,
    а показы знает только соцсеть: возьмите охват поста и поделите на него число из строки
    нужного источника ниже.
  </div>

  <h2>Откуда приходят</h2>
  <table>${sources}</table>

  <footer>
    <button id="reset" type="button">Обнулить счётчик</button>
    <div class="hint" style="margin-top:8px">
      Удалит всю историю шагов, чтобы запуск считался с нуля и не включал ваши
      собственные заходы. Места, зоны и отзывы не трогает. Отменить нельзя.
    </div>
    <div class="hint" style="margin-top:16px">Сырые данные — <code>&amp;format=json</code>.</div>
  </footer>

  <script>
    const token = ${toJsLiteral(token)};
    document.getElementById("reset").addEventListener("click", async (e) => {
      const button = e.currentTarget;
      if (!confirm("Удалить всю историю шагов? Это нельзя отменить.")) return;
      button.disabled = true;
      button.textContent = "Обнуляем…";
      try {
        const res = await fetch("/api/stats/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) throw new Error(String(res.status));
        const { removed } = await res.json();
        alert("Удалено записей: " + removed);
        location.reload();
      } catch (err) {
        button.disabled = false;
        button.textContent = "Обнулить счётчик";
        alert("Не удалось обнулить: " + err.message);
      }
    });
  </script>
</body></html>`;
}
