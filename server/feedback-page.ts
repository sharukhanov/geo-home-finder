// Human-readable page for reading collected feedback in a browser.
// The raw JSON stays available via ?format=json.

import type { Feedback } from "@shared/schema";

const TYPE_LABELS: Record<string, string> = {
  work: "🏢 Работа",
  study: "🎓 Учёба",
  fitness: "💪 Фитнес",
  hobby: "🎨 Хобби",
  family: "👨‍👩‍👧‍👦 Семья",
  shopping: "🛍️ Покупки",
  other: "📍 Другое",
};

const TRANSPORT_LABELS: Record<string, string> = {
  public_transport: "🚇 транспорт",
  driving: "🚗 авто",
  walking: "🚶 пешком",
};

interface FeedbackContext {
  hasOptimal?: boolean;
  approximate?: boolean;
  districts?: string[];
  places?: Array<{
    type?: string;
    transport?: string;
    limitMinutes?: number;
    arrivalHour?: number;
  }>;
}

// Comments are user input — always escape before putting them in HTML.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatMoscowTime(date: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function parseContext(raw: string | null): FeedbackContext | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FeedbackContext;
  } catch {
    return null;
  }
}

function renderContext(context: FeedbackContext | null): string {
  if (!context) return '<div class="muted">Контекст не сохранён</div>';

  const rows: string[] = [];

  const places = context.places ?? [];
  if (places.length > 0) {
    const list = places
      .map((p) => {
        const type = TYPE_LABELS[p.type ?? ""] ?? escapeHtml(p.type ?? "—");
        const transport = TRANSPORT_LABELS[p.transport ?? ""] ?? "";
        const hour = String(p.arrivalHour ?? 0).padStart(2, "0");
        return `<li>${type} — ${transport}, до ${p.limitMinutes ?? "?"} мин, к ${hour}:00</li>`;
      })
      .join("");
    rows.push(`<div><b>Места (${places.length}):</b><ul>${list}</ul></div>`);
  } else {
    rows.push('<div class="muted">Мест не было</div>');
  }

  rows.push(
    `<div><b>Зона найдена:</b> ${context.hasOptimal ? "да" : "нет"}</div>`,
  );

  if (context.approximate) {
    rows.push('<div class="warn">Приблизительный режим (без данных 2ГИС)</div>');
  }

  const districts = context.districts ?? [];
  if (districts.length > 0) {
    rows.push(
      `<div><b>Районы:</b> ${escapeHtml(districts.slice(0, 10).join(", "))}</div>`,
    );
  }

  return rows.join("");
}

export function renderFeedbackPage(entries: Feedback[]): string {
  const likes = entries.filter((e) => e.rating === "like").length;
  const dislikes = entries.length - likes;
  const withComment = entries.filter((e) => e.comment?.trim()).length;
  const share = entries.length > 0 ? Math.round((likes / entries.length) * 100) : 0;

  const cards = entries
    .map((entry) => {
      const isLike = entry.rating === "like";
      const comment = entry.comment?.trim()
        ? `<div class="comment">${escapeHtml(entry.comment)}</div>`
        : '<div class="muted">Без комментария</div>';

      return `
        <article class="card ${isLike ? "like" : "dislike"}">
          <header>
            <span class="thumb">${isLike ? "👍" : "👎"}</span>
            <span class="date">${formatMoscowTime(new Date(entry.createdAt))}</span>
            <span class="user" title="Анонимный идентификатор браузера">${escapeHtml(
              entry.userId.slice(0, 8),
            )}</span>
          </header>
          ${comment}
          <div class="context">${renderContext(parseContext(entry.context))}</div>
        </article>`;
    })
    .join("");

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Отзывы — Fatera</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         margin: 0; background: #f8fafc; color: #0f172a; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; }
  h1 { font-size: 22px; margin: 0 0 16px; }
  .stats { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px; }
  .stat { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px;
          padding: 12px 16px; flex: 1; min-width: 120px; }
  .stat b { display: block; font-size: 22px; }
  .stat span { font-size: 12px; color: #64748b; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-left-width: 4px;
          border-radius: 12px; padding: 14px 16px; margin-bottom: 12px; }
  .card.like { border-left-color: #10b981; }
  .card.dislike { border-left-color: #ef4444; }
  .card header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
  .thumb { font-size: 18px; }
  .date { font-size: 13px; color: #475569; }
  .user { font-size: 11px; color: #94a3b8; margin-left: auto;
          font-family: ui-monospace, monospace; }
  .comment { font-size: 15px; margin-bottom: 10px; white-space: pre-wrap; }
  .muted { color: #94a3b8; font-size: 13px; margin-bottom: 10px; }
  .warn { color: #b45309; }
  .context { font-size: 13px; color: #334155; background: #f8fafc;
             border-radius: 8px; padding: 10px 12px; }
  .context ul { margin: 4px 0 0; padding-left: 18px; }
  .context div { margin-bottom: 4px; }
  .empty { background: #fff; border: 1px dashed #cbd5e1; border-radius: 12px;
           padding: 32px; text-align: center; color: #64748b; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Отзывы пользователей</h1>
  <div class="stats">
    <div class="stat"><b>${entries.length}</b><span>всего оценок</span></div>
    <div class="stat"><b>👍 ${likes}</b><span>полезно</span></div>
    <div class="stat"><b>👎 ${dislikes}</b><span>не полезно</span></div>
    <div class="stat"><b>${share}%</b><span>доля положительных</span></div>
    <div class="stat"><b>${withComment}</b><span>с комментарием</span></div>
  </div>
  ${cards || '<div class="empty">Пока нет ни одного отзыва.</div>'}
</div>
</body>
</html>`;
}
