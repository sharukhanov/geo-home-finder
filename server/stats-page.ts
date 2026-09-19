// Human-readable funnel summary, served behind ADMIN_TOKEN.
//
// The question this page answers is "do people want this?", so it shows how
// many visitors reached each step and how many fell away between them — the
// drop-offs are the finding, not the totals.

import type { FunnelReport } from "./storage";

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

function pct(part: number, whole: number): string {
  if (!whole) return "—";
  return `${Math.round((part / whole) * 100)}%`;
}

export function renderStatsPage(report: FunnelReport): string {
  const top = report.steps[0]?.visitors ?? 0;

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
  footer { margin-top: 32px; font-size: 13px; color: #64748b; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e2e8f0; }
    .step, table { background: #131c2e; border-color: #1e293b; }
    .bar { background: #17305c; }
    td { border-color: #1e293b; }
  }
</style></head><body>
  <h1>Воронка</h1>
  <div class="hint">За последние ${report.sinceDays} дн. Считаются люди, а не клики: один человек, добавивший четыре места, — это один человек на шаге «добавили место».</div>

  <h2>Путь посетителя</h2>
  ${rows}

  <h2>Откуда приходят</h2>
  <table>${sources}</table>

  <footer>
    Период меняется параметром <code>?days=30</code>. Сырые данные — <code>&amp;format=json</code>.
  </footer>
</body></html>`;
}
