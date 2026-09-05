# Fatera — geo home finder

Веб-приложение, которое подбирает оптимальное место жилья на карте на основе
«точек притяжения» пользователя (работа, учёба, спортзал и т.д.). Вы расставляете
точки на карте и задаёте для каждой максимальное время в пути, а сервис
закрашивает зоны, откуда до **всех** точек можно добраться в пределах лимита.

## Технический стек

- **Фронтенд:** React 18 + TypeScript, Vite, Wouter, TanStack Query, React Hook
  Form + Zod, Tailwind + shadcn/ui, Leaflet + OpenStreetMap.
- **Бэкенд:** Node.js + Express (TypeScript, ES-модули), REST API.
- **Геокодинг:** прокси к OpenStreetMap Nominatim (настраивается через env).
- **Хранилище:** in-memory (схема PostgreSQL/Drizzle описана, но пока не
  подключена).

## Запуск

```bash
npm install
cp .env.example .env   # при необходимости отредактируйте
npm run dev            # дев-сервер с HMR на http://localhost:5000
```

Прод-сборка:

```bash
npm run build          # клиент (Vite) + сервер (esbuild) в dist/
npm run start          # запуск собранного сервера
```

Полезные команды:

```bash
npm run check          # проверка типов (tsc)
npm run db:push        # применить схему БД (когда будет подключён Postgres)
```

## Как работает расчёт зон

Эндпоинт `POST /api/zones/calculate` строит сетку вокруг всех точек, для каждого
узла считает время в пути до каждой точки и оставляет узлы, откуда достижимы все
точки в пределах их лимитов. Узлы классифицируются на зоны `ideal` / `good` /
`far`. Логика — в `server/routes.ts` (`calculateOptimalLivingAreas`).

> ⚠️ Текущая оценка времени — расстояние по прямой × 18 км/ч. Это упрощение;
> переход на реальную маршрутизацию/изохроны запланирован (см. ниже).

## Геокодинг

- `GET /api/geocode/search?q=<адрес>` — поиск адреса (автоподсказки в форме).
- `GET /api/geocode/reverse?lat=&lng=` — адрес по координатам (при клике на карте).

Запросы проксируются через бэкенд (модуль `server/geocode.ts`), чтобы выставлять
корректный `User-Agent` (требование Nominatim) и обойти CORS. Провайдер
настраивается через `GEOCODER_*` переменные окружения.

## Структура

```
client/   — SPA (React)
server/   — Express API + геокодинг + расчёт зон
shared/   — общая схема данных (Drizzle + Zod)
```

## Деплой на Railway

Проект готов к деплою на [Railway](https://railway.app) как единый сервис
(Express отдаёт и API, и собранный фронтенд).

1. Зайти на railway.app → **New Project** → **Deploy from GitHub repo** →
   выбрать `sharukhanov/geo-home-finder`.
2. Railway автоматически определит Node-проект. Параметры сборки/запуска уже
   заданы в `railway.json`:
   - build: `npm run build`
   - start: `npm run start`
3. В настройках сервиса → **Variables** задать переменные окружения
   (см. `.env.example`). Как минимум:
   - `GEOCODER_USER_AGENT` — с вашим реальным контактом (требование Nominatim).
   - `PORT` задавать **не нужно** — Railway подставит его сам, сервер его читает.
4. Нажать **Deploy**. После сборки Railway выдаст публичный URL
   (**Settings → Networking → Generate Domain**).

> Для продакшена рекомендуется вынести геокодинг на self-hosted Nominatim или
> платного провайдера (`GEOCODER_BASE_URL`), т.к. у публичного Nominatim строгие
> лимиты (1 запрос/сек). База данных пока не требуется — хранилище in-memory.

## Дальнейшие шаги

- Реальная маршрутизация/изохроны (OpenRouteService / Valhalla / OSRM) вместо
  оценки «по прямой».
- Подключение PostgreSQL (схема уже описана) вместо in-memory хранилища.
- Аутентификация и сохранение наборов точек per-user.
- Редактирование точек, выбор города (сейчас карта центрирована на Москве).
