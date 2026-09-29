# VidaQuest: agenda primero

Fecha: 2026-09-29

## Objetivo

Que VidaQuest sea ante todo una agenda: calendario, eventos, recordatorios y
notificaciones. Las funciones de hábitos (tareas diarias, XP, nivel, racha,
escudos, insignias, estadísticas, enfoque, amigos) se conservan completas pero
pasan a un segundo plano.

## Restricciones

- Solo se hace `git push` a `main`. No se usan Vercel ni Supabase desde esta PC
  (esas cuentas son de otro ámbito). Las migraciones SQL y el deploy de la edge
  function los ejecuta el dueño a mano; se le entregan listos.
- Cada etapa termina con build y lint limpios y un push.
- El frontend de una etapa que dependa de columnas nuevas no se pushea hasta
  que la migración esté aplicada (o el código tolera que falten).

## Etapa 1: navegación y Agenda como inicio

Barra inferior: **Agenda · Hábitos · Notas**.

- `view` pasa a ser `'agenda' | 'habits' | 'notes' | 'friends'`, inicial `'agenda'`.
- Se eliminan las vistas `home`, `tasks`, `calendar` y `stats` como pestañas;
  su contenido se reubica.

**Agenda** (pantalla principal):

1. Encabezado: fecha larga y saludo.
2. Tarjeta "próximo evento": el próximo recordatorio habilitado a partir de
   ahora, con "en X min / hoy a las HH:MM / mañana…". Si no hay, invita a crear uno.
3. Aviso de notificaciones del calendario si están apagadas (botón activar).
4. Lista agrupada por día, desde el día seleccionado, 7 días hacia adelante
   (hoy por defecto). Cada item: hora, título, editar, borrar.
5. Mes compacto (grilla actual) con navegación de mes y "Hoy". Tocar un día lo
   selecciona y la lista arranca desde ese día. Puntos: eventos del día.
6. Botón flotante "+" que abre la hoja de evento con la fecha seleccionada.

**Hábitos**:

1. Resumen compacto: nivel, barra de XP, racha y escudos, progreso de hoy.
2. Acciones: nueva tarea, enfoque.
3. Lista completa de tareas (marcar, editar, borrar, reordenar, conteo semanal).
4. Sección Progreso: todo lo que hoy muestra la vista `stats` (estadísticas,
   calendario de completadas si existe, insignias con su estado "nuevas").
5. El punto de insignias nuevas pasa al ícono de Hábitos en la barra.

**Notas**: sin cambios.

## Etapa 2: eventos completos

Migración sobre `public.reminders`:

| columna | tipo | default |
|---|---|---|
| `end_time` | text null | null |
| `all_day` | boolean | false |
| `description` | text | '' |
| `location` | text | '' |
| `color` | text null | null |
| `recurrence` | text check in ('none','daily','weekly','monthly') | 'none' |
| `recurrence_until` | text null (fecha YYYY-MM-DD) | null |
| `alert_offsets` | integer[] (minutos antes) | '{60,0}' |

Los existentes quedan con `alert_offsets = {60,0}`, igual que su comportamiento actual.

- `Reminder` en el cliente suma esos campos (con defaults al leer datos viejos
  de localStorage).
- Hoja de evento: título, fecha, todo el día, inicio/fin, repetición + hasta,
  avisos (chips multiselección: en el momento, 10 min, 30 min, 1 h, 1 día),
  color, lugar, descripción.
- Ocurrencias: función pura `occurrencesBetween(reminder, from, to)` usada por
  la Agenda y la grilla. Mensual en día 31 salta meses sin ese día.
- Editar/borrar actúa sobre la serie completa.

## Etapa 3: dos interruptores de notificaciones

Migración sobre `public.push_subscriptions`: `notify_calendar boolean default true`,
`notify_habits boolean default true`.

- Cliente: dos interruptores en el menú de cuenta ("Calendario", "Hábitos y
  racha"). Activar cualquiera suscribe el dispositivo si hace falta; apagar
  ambos lo desuscribe. Estado leído de la fila de la suscripción actual.
- La Agenda muestra el acceso rápido al de Calendario.
- `send-notifications`:
  - Eventos: para cada evento habilitado, calcula ocurrencias de hoy y mañana
    en la zona del usuario; por cada `offset` en `alert_offsets`, si
    `ocurrencia - offset` cae en la ventana `(ahora - 15 min, ahora]`, envía a
    las suscripciones con `notify_calendar`, deduplicando con
    `notification_log(kind = 'event-<id>-<fecha>-<offset>', log_date = fecha)`.
    Eventos de todo el día usan 09:00 como hora de referencia.
  - Tareas, no entraste hoy, racha, resumen semanal, fin de enfoque: solo a
    suscripciones con `notify_habits`.
  - `notified_1h`/`notified_due` dejan de usarse (no se borran).

## Pruebas

- `npm run build` y `npm run lint` por etapa.
- Revisión visual con Playwright a 390px de ancho en modo local (sin sesión).
- Etapa 3: `deno check` de la función si está disponible; lógica de ocurrencias
  compartida y revisada.

## Fuera de alcance

Excepciones por ocurrencia ("solo esta vez"), vista semanal por franjas,
sincronización con Google Calendar.
