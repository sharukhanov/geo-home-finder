// "Why are the zones approximate?" answered without reading server logs.
//
// Falling back is silent by design — the service keeps working — so the only
// way to tell a missing key from a city 2GIS has no data for used to be the
// logs. This page asks 2GIS live and prints what came back.

import type { ProviderCheck } from "./providers/types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Turns the raw checks into the one sentence that actually decides things. */
function verdict(checks: ProviderCheck[]): { title: string; body: string; ok: boolean } {
  const key = checks.find((c) => c.label.includes("DGIS_API_KEY"));
  if (key && !key.ok) {
    return {
      ok: false,
      title: "Ключ 2ГИС не задан",
      body:
        "Поэтому сервис всегда считает приблизительно, по прямой. " +
        "Добавьте переменную DGIS_API_KEY в настройках сервиса на хостинге.",
    };
  }

  const isochrones = checks.filter((c) => c.label.startsWith("Изохрона"));
  const working = isochrones.filter((c) => c.ok);

  if (isochrones.length === 0) {
    return {
      ok: false,
      title: "Проверка не выполнилась",
      body:
        "Поставщик маршрутов не ответил на самопроверку. Подробности — в таблице ниже " +
        "и в логах сервиса.",
    };
  }

  if (working.length === isochrones.length) {
    return {
      ok: true,
      title: "2ГИС отвечает, изохроны строятся",
      body:
        "Для этой точки всё работает. Если на карте всё равно круги — " +
        "проверьте эту же страницу с координатами того места, которое вы добавляли.",
    };
  }

  const authError = isochrones.find((c) => /HTTP 40[13]/.test(c.detail));
  if (authError) {
    return {
      ok: false,
      title: "2ГИС отклоняет ключ",
      body:
        "Ключ задан, но не принят — чаще всего он истёк или у него нет доступа " +
        "к Isochrone API. Нужен новый ключ в личном кабинете 2ГИС.",
    };
  }

  // Must come before the "no data" verdict: a request we hung up on says
  // nothing about coverage, and confusing the two sends you looking in
  // entirely the wrong place.
  if (isochrones.every((c) => !c.ok && c.detail.startsWith("не ответил"))) {
    return {
      ok: false,
      title: "2ГИС не отвечает вовремя",
      body:
        "Запросы обрываются по таймауту, поэтому сервис переключается на " +
        "приблизительный расчёт. Данные у 2ГИС, скорее всего, есть — мы их не дожидаемся. " +
        "Ожидание настраивается переменной DGIS_ISOCHRONE_TIMEOUT_MS.",
    };
  }

  // Same reasoning as the timeout branch: a request that never reached 2GIS
  // tells us nothing about what 2GIS knows.
  if (isochrones.every((c) => !c.ok && c.detail.startsWith("сеть"))) {
    return {
      ok: false,
      title: "2ГИС недоступен",
      body:
        "До сервиса не удаётся достучаться — он лежит, либо с нашего сервера " +
        "нет сети до него. Пока это так, зоны считаются приблизительно. " +
        "Подробности ниже.",
    };
  }

  if (working.length === 0) {
    return {
      ok: false,
      title: "Для этой точки у 2ГИС нет данных",
      body:
        "Ключ рабочий, но маршруты здесь не строятся ни одним способом. " +
        "Обычно это значит, что город не покрыт этим API. Сервис в таком случае " +
        "честно переключается на приблизительный расчёт.",
    };
  }

  const broken = isochrones.filter((c) => !c.ok).map((c) => c.label.split("· ")[1]);
  return {
    ok: false,
    title: "Работает не для всех способов передвижения",
    body:
      `Не строятся: ${broken.join(", ")}. Для этого города у 2ГИС нет данных по ` +
      "этому транспорту — например, в небольших городах обычно нет общественного. " +
      "Места с таким способом передвижения будут считаться приблизительно.",
  };
}

export function renderDiagPage(
  provider: string,
  point: { lat: number; lng: number },
  checks: ProviderCheck[],
): string {
  const v = verdict(checks);

  const rows = checks
    .map(
      (c) => `
      <tr>
        <td>${c.ok ? "✅" : "❌"}</td>
        <td>${escapeHtml(c.label)}</td>
        <td class="detail">${escapeHtml(c.detail)}</td>
      </tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Fatera — диагностика 2ГИС</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif;
    max-width: 760px; margin: 0 auto; padding: 24px 16px 64px; line-height: 1.5;
    background: #f7f8fa; color: #0f172a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 17px; margin: 32px 0 10px; }
  .hint { color: #64748b; font-size: 13px; }
  .verdict { border-radius: 14px; padding: 16px; margin-top: 16px;
    border: 1px solid #fcd34d; background: #fffbeb; }
  .verdict.ok { border-color: #a7f3d0; background: #ecfdf5; }
  .vtitle { font-weight: 700; font-size: 18px; margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; background: #fff;
    border: 1px solid #e2e8f0; border-radius: 14px; overflow: hidden; }
  td { padding: 10px 12px; border-top: 1px solid #f1f5f9; vertical-align: top; }
  tr:first-child td { border-top: 0; }
  td:first-child { width: 28px; }
  .detail { color: #64748b; font-size: 13px; word-break: break-word; }
  code { background: rgba(127,127,127,.14); padding: 1px 5px; border-radius: 4px; }
  @media (prefers-color-scheme: dark) {
    body { background: #0b1220; color: #e2e8f0; }
    table { background: #131c2e; border-color: #1e293b; }
    td { border-color: #1e293b; }
    .verdict { background: #2a2413; border-color: #6b5a1e; }
    .verdict.ok { background: #0f2a20; border-color: #1e5c45; }
  }
</style></head><body>
  <h1>Диагностика маршрутов</h1>
  <div class="hint">
    Поставщик: <code>${escapeHtml(provider)}</code>.
    Проверенная точка: <code>${point.lat.toFixed(4)}, ${point.lng.toFixed(4)}</code>.
  </div>

  <div class="verdict${v.ok ? " ok" : ""}">
    <div class="vtitle">${escapeHtml(v.title)}</div>
    <div>${escapeHtml(v.body)}</div>
  </div>

  <h2>Что ответил 2ГИС</h2>
  <table>${rows}</table>

  <h2>Проверить другую точку</h2>
  <div class="hint">
    Добавьте к адресу координаты места, которое добавляли в сервисе:
    <code>&amp;lat=55.7558&amp;lng=37.6176</code>.
    По умолчанию проверяется центр Москвы — как эталон заведомо покрытого города.
    Сырые данные — <code>&amp;format=json</code>.
  </div>
</body></html>`;
}
