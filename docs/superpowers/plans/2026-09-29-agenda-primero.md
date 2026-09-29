# Agenda primero: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir VidaQuest en una app centrada en la agenda (calendario, eventos, avisos), dejando hábitos/XP/racha/insignias como sección secundaria completa.

**Architecture:** La UI vive casi entera en `src/App.tsx` (un componente `App` con `view` y hojas `sheet`). La lógica nueva de fechas y ocurrencias va en `src/lib/agenda.ts` (funciones puras, testeadas con Vitest). La edge function `send-notifications` recibe una copia de esa lógica (Deno no importa desde `src/`).

**Tech Stack:** React 19, Vite 8, TypeScript 6, Supabase JS, Vitest (nuevo, solo dev), Deno edge functions.

**Spec:** `docs/superpowers/specs/2026-09-29-agenda-primero-design.md`

## Global Constraints

- Solo `git push` a `origin main`. Nunca comandos de Vercel ni Supabase CLI/MCP. SQL y deploy de funciones se entregan al dueño.
- Cada etapa termina con `npm run build` y `npm run lint` sin errores, commit y push.
- El frontend de etapas 2 y 3 se pushea recién cuando el dueño confirma la migración aplicada.
- Textos de la UI en español rioplatense (vos), igual que el resto de la app.
- Fechas locales como `YYYY-MM-DD` (`localDateString`), horas `HH:MM`.

## Review Focus

- Evento mensual el día 31: en meses sin 31 no aparece (no se corre al 1).
- `recurrence_until` anterior a la fecha de inicio: el evento solo aparece en su fecha inicial.
- Recordatorios viejos en localStorage sin campos nuevos: se leen con defaults y no rompen.
- Sin eventos futuros: la tarjeta "próximo evento" invita a crear, no queda vacía.
- Aviso "1 día antes" de un evento de mañana: la función de envío mira ocurrencias de hoy y mañana (y de pasado mañana para offsets de 1 día cerca de medianoche).

---

## Etapa 1

### Task 1: Vitest y helpers de agenda

**Files:**
- Modify: `package.json` (devDependency `vitest`, script `"test": "vitest run"`)
- Create: `src/lib/agenda.ts`
- Test: `src/lib/agenda.test.ts`

**Interfaces:**
- Produces:
  - `type AgendaItem = { id: string; title: string; date: string; time: string; enabled: boolean }`
  - `addDays(date: string, n: number): string`
  - `groupUpcoming<T extends AgendaItem>(items: T[], from: string, days: number): { date: string; items: T[] }[]` (incluye días vacíos, ordena por hora)
  - `nextEvent<T extends AgendaItem>(items: T[], now: Date): T | null` (primer habilitado con fecha+hora >= ahora)
  - `relativeWhen(date: string, time: string, now: Date): string` ("en 45 min", "hoy a las 18:30", "mañana a las 09:00", "jue 2 oct · 09:00")

- [ ] Instalar: `npm i -D vitest` y agregar script `test`.
- [ ] Escribir tests: agrupa 3 días con días vacíos; ordena por hora; `nextEvent` ignora pasados y deshabilitados; `relativeWhen` para <60 min, hoy, mañana, otro día; `addDays` cruza fin de mes.
- [ ] Correr `npm test`, ver que fallan.
- [ ] Implementar `src/lib/agenda.ts`.
- [ ] `npm test` en verde. Commit `Agregar helpers de agenda con tests`.

### Task 2: Navegación Agenda · Hábitos · Notas y vista Agenda

**Files:** Modify `src/App.tsx`, `src/App.css`

- [ ] `view`: `'agenda' | 'habits' | 'notes' | 'friends'`, inicial `'agenda'`. `nav`: `['agenda', CalendarDays, 'Agenda'], ['habits', Trophy, 'Hábitos'], ['notes', NotebookPen, 'Notas']`. El punto de insignias nuevas pasa a `key === 'habits'`. Amigos vuelve a `'agenda'`.
- [ ] Nueva vista `agenda` (reemplaza `home` y `calendar`): intro con fecha + saludo, tarjeta próximo evento (`nextEvent`, `relativeWhen`, toca para editar; vacío = botón "Agendar algo"), aviso de notificaciones si `pushStatus !== 'on'` (usa `enablePush` actual; en etapa 3 pasa al interruptor de calendario), lista `groupUpcoming(store.reminders, selectedDay, 7)` con items editables/borrables (reusa `startEditReminder`, `requestDeleteReminder`), mes compacto (grilla y `cal-nav` actuales, puntos solo de eventos), FAB "+" que abre la hoja de recordatorio con `date: selectedDay`.
- [ ] Tocar un día fija `selectedDay`; el botón "Hoy" vuelve a hoy.
- [ ] CSS nuevo: `.next-event`, `.agenda-day`, `.agenda-item`, `.fab`, `.notif-cta`, con variables de tema existentes.

### Task 3: Vista Hábitos

**Files:** Modify `src/App.tsx`, `src/App.css`

- [ ] Vista `habits` con `Page` sin botón atrás funcional (atrás vuelve a agenda) y acción "+" de nueva tarea: tarjeta de nivel (actual), `status` (progreso del día, racha, escudos), acciones Enfoque, `TaskList` completa (con editar, borrar, reordenar, semanal), luego todo el contenido de la vieja vista `stats` bajo título "PROGRESO".
- [ ] El efecto que marca insignias vistas usa `view !== 'habits'`.
- [ ] Borrar las vistas `home`, `tasks`, `calendar`, `stats`, imports sin uso y `goBack` si queda sin uso.
- [ ] `npm run build`, `npm run lint`, revisión con Playwright a 390px (agenda, hábitos, notas, crear evento). Commit, push.

## Etapa 2

### Task 4: Migración y modelo de evento

**Files:**
- Create: `supabase/migrations/20260929120000_event_fields.sql`
- Modify: `src/App.tsx` (tipo `Reminder`, lectura/escritura en Supabase y localStorage)

- [ ] SQL: agregar `end_time text`, `all_day boolean not null default false`, `description text not null default ''`, `location text not null default ''`, `color text`, `recurrence text not null default 'none' check (recurrence in ('none','daily','weekly','monthly'))`, `recurrence_until text`, `alert_offsets integer[] not null default '{60,0}'`.
- [ ] `Reminder` suma `endTime, allDay, description, location, color, recurrence, recurrenceUntil, alertOffsets`; normalizador `normalizeReminder` con defaults al leer.
- [ ] Mapear camelCase <-> snake_case en los 3 lugares que escriben/leen `reminders`.

### Task 5: Ocurrencias

**Files:** Modify `src/lib/agenda.ts`, `src/lib/agenda.test.ts`, `src/App.tsx`

- [ ] `occursOn(r, date): boolean` y `occurrencesBetween(r, from, to): string[]`, respetando `recurrence`, `recurrenceUntil`, y mensual con día inexistente = sin ocurrencia.
- [ ] Tests: diaria, semanal, mensual 31, until antes del inicio, none.
- [ ] `groupUpcoming`, `nextEvent`, puntos de la grilla y detalle usan ocurrencias.

### Task 6: Hoja de evento completa

**Files:** Modify `src/App.tsx`, `src/App.css`

- [ ] Campos: título, fecha, todo el día, inicio/fin, repetición + hasta, avisos (chips 0/10/30/60/1440), color (paleta corta), lugar, descripción.
- [ ] Build, lint, Playwright. Entregar SQL al dueño; push cuando confirme.

## Etapa 3

### Task 7: Interruptores en el cliente

**Files:**
- Create: `supabase/migrations/20260929130000_push_channels.sql` (`notify_calendar`, `notify_habits` boolean not null default true)
- Modify: `src/App.tsx`

- [ ] Estado `pushChannels: { calendar: boolean; habits: boolean }` leído de la fila de la suscripción actual.
- [ ] `setPushChannel(channel, on)`: si no hay suscripción y `on`, suscribe (lógica actual de `enablePush`) y guarda flags; si ambos quedan en false, `disablePush`.
- [ ] Menú de cuenta: dos interruptores. Agenda: CTA usa el canal calendario.

### Task 8: Edge function

**Files:** Modify `supabase/functions/send-notifications/index.ts`

- [ ] Copiar `occursOn` a la función.
- [ ] Reemplazar bloque de recordatorios: por evento habilitado, fechas hoy/mañana/pasado en tz del usuario, por cada offset, disparo si `when - offset` en `(now - 15min, now]`, solo subs `notify_calendar`, dedupe `notification_log` con kind `event-<id>-<fecha>-<offset>`. Todo el día = 09:00.
- [ ] Resto de avisos: filtrar subs con `notify_habits`.
- [ ] Entregar SQL + `supabase functions deploy send-notifications` al dueño; push al confirmar.
