import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const ACTION_TOKEN_SECRET = Deno.env.get('ACTION_TOKEN_SECRET')!

const FALLBACK_TZ = 'America/Argentina/Buenos_Aires'

webpush.setVapidDetails(
  'mailto:nicolasmarsetg@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

type Subscription = {
  id: number
  user_id: string
  endpoint: string
  p256dh: string
  auth: string
  last_seen_at: string
  timezone: string | null
  notify_calendar: boolean | null
  notify_habits: boolean | null
}

type EventRow = {
  date: string
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly'
  recurrence_until: string | null
}

// Eventos de todo el día: los avisos se calculan desde esta hora.
const ALL_DAY_ALERT_TIME = '09:00'

const dayNumber = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86400000
}

// Misma regla que occursOn de src/lib/agenda.ts (Deno no puede importar
// desde src/): si se cambia una, cambiar la otra.
function occursOn(event: EventRow, date: string) {
  const start = event.date
  if (date < start) return false

  const until = event.recurrence_until
  const recurrence =
    until && until < start ? 'none' : event.recurrence ?? 'none'

  if (recurrence === 'none') return date === start
  if (until && date > until) return false

  if (recurrence === 'daily') return true
  if (recurrence === 'weekly')
    return (dayNumber(date) - dayNumber(start)) % 7 === 0

  return date.slice(8) === start.slice(8)
}

function eventMessage(
  r: { title: string; location?: string; all_day?: boolean; time: string },
  offset: number
) {
  const where = r.location ? ` · ${r.location}` : ''

  if (offset === 0) {
    return r.all_day
      ? `📅 Hoy: ${r.title}${where}`
      : `📅 ${r.title}${where}`
  }

  if (offset % 1440 === 0) {
    const days = offset / 1440
    const at = r.all_day ? '' : ` a las ${r.time.slice(0, 5)}`
    return days === 1
      ? `📅 Mañana${at}: ${r.title}${where}`
      : `📅 En ${days} días: ${r.title}${where}`
  }

  if (offset % 60 === 0) {
    const hours = offset / 60
    return `⏰ En ${hours} hora${hours === 1 ? '' : 's'}: ${r.title}${where}`
  }

  return `⏰ En ${offset} min: ${r.title}${where}`
}

// Fecha (YYYY-MM-DD) que corresponde a `now` en el huso `timeZone`.
function zonedDateString(now: Date, timeZone: string, offsetHours = 0) {
  const shifted = new Date(now.getTime() + offsetHours * 3600_000)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted)
}

// Hora local (0-23) que corresponde a `now` en el huso `timeZone`.
function zonedHourOf(now: Date, timeZone: string) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone,
    }).format(now)
  )
}

// Offset (en ms) de `timeZone` respecto de UTC en el instante `date`.
function timezoneOffsetMs(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
    .formatToParts(date)
    .reduce(
      (acc, p) => {
        acc[p.type] = p.value
        return acc
      },
      {} as Record<string, string>
    )

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  )

  return asUTC - date.getTime()
}

// Convierte una fecha+hora "de pared" (tal como las guarda un recordatorio)
// interpretadas en `timeZone`, al instante UTC real que representan.
function zonedTimeToUtc(
  dateStr: string,
  timeStr: string,
  timeZone: string
) {
  const naive = new Date(`${dateStr}T${timeStr}:00Z`)
  const offset = timezoneOffsetMs(naive, timeZone)

  return new Date(naive.getTime() - offset)
}

async function sign(payload: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ACTION_TOKEN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(payload)
  )
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

async function sendTo(sub: Subscription, payload: Record<string, unknown>) {
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload)
    )
  } catch (err) {
    const statusCode = (err as { statusCode?: number }).statusCode
    if (statusCode === 404 || statusCode === 410) {
      await supabase.from('push_subscriptions').delete().eq('id', sub.id)
    } else {
      console.error('push error', statusCode, err)
    }
  }
}

async function alreadyLogged(userId: string, kind: string, date: string) {
  const { data } = await supabase
    .from('notification_log')
    .select('id')
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('log_date', date)
    .maybeSingle()

  return !!data
}

async function logSent(userId: string, kind: string, date: string) {
  await supabase
    .from('notification_log')
    .insert({ user_id: userId, kind, log_date: date })
}

async function countCompletions(userId: string, date: string) {
  const { count } = await supabase
    .from('completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('date', date)

  return count ?? 0
}

async function countCompletionsForTask(
  userId: string,
  taskId: string,
  date: string
) {
  const { count } = await supabase
    .from('completions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('date', date)

  return count ?? 0
}

// Minutos que faltan hasta la medianoche local del usuario.
function minutesToMidnight(now: Date, timeZone: string) {
  const tomorrow = zonedDateString(now, timeZone, 24)
  const midnight = zonedTimeToUtc(tomorrow, '00:00', timeZone)

  return (midnight.getTime() - now.getTime()) / 60000
}

// Longitud de la racha, contada hacia atrás desde `startOffsetDays` días
// antes de hoy (1 = "la racha que terminó ayer", que es la que está en
// riesgo si hoy todavía no hay nada completado; 0 = incluye hoy).
async function streakLength(
  userId: string,
  tz: string,
  now: Date,
  startOffsetDays = 1
) {
  const { data } = await supabase
    .from('completions')
    .select('date')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(400)

  const dates = new Set((data ?? []).map(d => d.date))

  let n = 0
  for (let i = startOffsetDays; i <= 365; i++) {
    if (dates.has(zonedDateString(now, tz, -24 * i))) n++
    else break
  }

  return n
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
}

// Día de la semana local (0 = domingo) que corresponde a `now`.
function zonedWeekdayOf(now: Date, timeZone: string) {
  const short = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    timeZone,
  }).format(now)

  return WEEKDAY_INDEX[short] ?? 0
}

const STREAK_RISK_CHECKPOINTS = [
  { minutesLeft: 120, kind: 'streak-risk-120' },
  { minutesLeft: 60, kind: 'streak-risk-60' },
  { minutesLeft: 30, kind: 'streak-risk-30' },
  { minutesLeft: 15, kind: 'streak-risk-15' },
  { minutesLeft: 5, kind: 'streak-risk-5' },
] as const

function streakMessage(minutesLeft: number, streakLen: number) {
  const days = `${streakLen} día${streakLen === 1 ? '' : 's'}`

  if (minutesLeft >= 120)
    return `🔥 Tu racha de ${days} está en riesgo. Te quedan 2 horas para completar algo hoy.`
  if (minutesLeft >= 60)
    return `⏰ 1 hora para que se corte tu racha de ${days}. ¡No la dejes ir!`
  if (minutesLeft >= 30)
    return `🚨 30 minutos. Tu racha de ${days} está a punto de terminar.`
  if (minutesLeft >= 15)
    return `⚠️ ¡15 minutos! Marcá algo ahora o perdés ${days} de racha.`

  return `🔴 ¡ÚLTIMOS 5 MINUTOS! Tu racha de ${days} se corta a medianoche.`
}

Deno.serve(async req => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const now = new Date()

  const { data: subs } = await supabase
    .from('push_subscriptions')
    .select('*')

  if (!subs || !subs.length) {
    return new Response('no subscriptions')
  }

  const subsByUser = new Map<string, Subscription[]>()
  for (const s of subs as Subscription[]) {
    if (!subsByUser.has(s.user_id)) subsByUser.set(s.user_id, [])
    subsByUser.get(s.user_id)!.push(s)
  }

  // Zona horaria "activa" de cada usuario: la del dispositivo visto más
  // recientemente. Se actualiza sola cada vez que abre la app.
  const userTimezone = new Map<string, string>()
  for (const [userId, userSubs] of subsByUser) {
    const freshest = userSubs.reduce((a, b) =>
      a.last_seen_at > b.last_seen_at ? a : b
    )
    userTimezone.set(userId, freshest.timezone || FALLBACK_TZ)
  }

  // Cada dispositivo elige qué avisos recibe: calendario y/o hábitos.
  // Filas anteriores a los interruptores (null) cuentan como activadas.
  const subsWith = (flag: 'notify_calendar' | 'notify_habits') => {
    const map = new Map<string, Subscription[]>()
    for (const [userId, userSubs] of subsByUser) {
      const on = userSubs.filter(s => s[flag] !== false)
      if (on.length) map.set(userId, on)
    }
    return map
  }

  const calendarSubsByUser = subsWith('notify_calendar')
  const habitsSubsByUser = subsWith('notify_habits')

  // 1) Eventos del calendario: un aviso por cada anticipación elegida
  // (alert_offsets, en minutos antes) y por cada ocurrencia si el evento
  // se repite. Solo a dispositivos con el interruptor de calendario.
  // Se deduplica por ocurrencia y anticipación en notification_log.
  const { data: events } = await supabase
    .from('reminders')
    .select('*')
    .eq('enabled', true)

  for (const r of events ?? []) {
    const userSubs = calendarSubsByUser.get(r.user_id)
    if (!userSubs || !userSubs.length) continue

    const tz = userTimezone.get(r.user_id) || FALLBACK_TZ
    const offsets: number[] = r.alert_offsets ?? [60, 0]
    if (!offsets.length) continue

    const event: EventRow = {
      date: String(r.date).slice(0, 10),
      recurrence: r.recurrence ?? 'none',
      recurrence_until: r.recurrence_until ?? null,
    }

    // De ayer a pasado mañana alcanza: la anticipación máxima es 1 día
    // y la ventana de envío es de 15 minutos (cruza medianoche).
    for (const dayOffset of [-24, 0, 24, 48]) {
      const date = zonedDateString(now, tz, dayOffset)
      if (!occursOn(event, date)) continue

      const time = r.all_day ? ALL_DAY_ALERT_TIME : r.time
      if (!/^\d{2}:\d{2}/.test(time || '')) continue

      const when = zonedTimeToUtc(date, time.slice(0, 5), tz)

      for (const offset of offsets) {
        const fireAt = when.getTime() - offset * 60000
        const late = (now.getTime() - fireAt) / 60000

        if (late < 0 || late >= 15) continue

        const kind = `event-${r.id}-${date}-${offset}`
        if (await alreadyLogged(r.user_id, kind, date)) continue

        for (const s of userSubs) {
          await sendTo(s, {
            title: 'VidaQuest',
            body: eventMessage(r, offset),
            tag: `event-${r.id}-${date}`,
            renotify: true,
          })
        }

        await logSent(r.user_id, kind, date)
      }
    }
  }

  // 1.5) Recordatorio diario por tarea: a la hora que tiene configurada,
  // si todavía no se completó ese día. Trae un botón "✓ Hecho" que la
  // marca sin abrir la app.
  const { data: remindTasks } = await supabase
    .from('tasks')
    .select('id, user_id, title, time')
    .eq('remind', true)

  for (const t of remindTasks ?? []) {
    const userSubs = habitsSubsByUser.get(t.user_id)
    if (!userSubs || !userSubs.length) continue
    if (!/^\d{2}:\d{2}$/.test(t.time || '')) continue

    const tz = userTimezone.get(t.user_id) || FALLBACK_TZ
    const today = zonedDateString(now, tz)
    const when = zonedTimeToUtc(today, t.time, tz)
    const diffMin = (when.getTime() - now.getTime()) / 60000

    if (diffMin > 0 || diffMin <= -15) continue

    const kind = `task-remind-${t.id}`
    if (await alreadyLogged(t.user_id, kind, today)) continue

    const doneToday = await countCompletionsForTask(
      t.user_id,
      String(t.id),
      today
    )

    if (doneToday) {
      await logSent(t.user_id, kind, today)
      continue
    }

    const token = await sign(`${t.user_id}:${t.id}:${today}`)

    for (const s of userSubs) {
      await sendTo(s, {
        title: 'VidaQuest',
        body: `⏰ ${t.title}`,
        tag: `task-remind-${t.id}`,
        actions: [{ action: 'complete-task', title: '✓ Hecho' }],
        data: {
          action: 'complete-task',
          userId: t.user_id,
          taskId: String(t.id),
          date: today,
          token,
        },
      })
    }

    await logSent(t.user_id, kind, today)
  }

  // Los avisos diarios corren según el reloj de CADA usuario: uno a las
  // 20:00 y una escalada de varios entre las 22:00 y las 00:00. Todos
  // son de hábitos: solo a dispositivos con ese interruptor.
  for (const [userId, userSubs] of habitsSubsByUser) {
    const tz = userTimezone.get(userId) || FALLBACK_TZ
    const hour = zonedHourOf(now, tz)
    const today = zonedDateString(now, tz)

    // 2) "Todavía no entraste hoy" — 20:00 local.
    if (hour === 20 && !(await alreadyLogged(userId, 'no-open', today))) {
      const doneToday = await countCompletions(userId, today)
      // Se mira en todos los dispositivos, no solo los que reciben
      // avisos de hábitos: si abrió la app en cualquiera, ya entró.
      const lastSeenToday = (subsByUser.get(userId) ?? []).some(
        s =>
          s.last_seen_at &&
          zonedDateString(new Date(s.last_seen_at), tz) === today
      )

      if (!doneToday && !lastSeenToday) {
        for (const s of userSubs) {
          await sendTo(s, {
            title: 'VidaQuest',
            body: 'Todavía no entraste hoy. Un minuto alcanza para no cortar la racha.',
            tag: 'no-open',
          })
        }
      }

      await logSent(userId, 'no-open', today)
    }

    // 3) "Vas a perder la racha" — cuenta regresiva escalonada de 22:00 a
    // 00:00 local, estilo Duolingo: varios avisos cada vez más urgentes
    // que se van reemplazando entre sí en la pantalla de bloqueo.
    if (hour === 22 || hour === 23) {
      const { data: shield } = await supabase
        .from('streak_shields')
        .select('available')
        .eq('user_id', userId)
        .maybeSingle()

      // Si tiene un protector de racha disponible, la racha no está
      // realmente en riesgo (se va a cubrir sola) — no hace falta la
      // alarma escalada.
      if ((shield?.available ?? 0) === 0) {
        const minsLeft = minutesToMidnight(now, tz)

        for (const cp of STREAK_RISK_CHECKPOINTS) {
          if (minsLeft > cp.minutesLeft) continue
          if (await alreadyLogged(userId, cp.kind, today)) continue

          const yesterday = zonedDateString(now, tz, -24)
          const doneToday = await countCompletions(
            userId,
            today
          )
          const doneYesterday = await countCompletions(
            userId,
            yesterday
          )

          if (!doneToday && doneYesterday) {
            const streakLen = await streakLength(
              userId,
              tz,
              now
            )

            for (const s of userSubs) {
              await sendTo(s, {
                title: 'VidaQuest',
                body: streakMessage(
                  cp.minutesLeft,
                  streakLen
                ),
                tag: 'streak-risk',
                renotify: true,
                requireInteraction: true,
                vibrate: [80, 40, 80, 40, 160],
              })
            }
          }

          await logSent(userId, cp.kind, today)
        }
      }
    }

    // 4) Resumen semanal — domingo a las 20:00 local, cerrando la
    // semana antes de que empiece la siguiente.
    if (
      zonedWeekdayOf(now, tz) === 0 &&
      hour === 20 &&
      !(await alreadyLogged(
        userId,
        'weekly-recap',
        today
      ))
    ) {
      const weekStart = zonedDateString(
        now,
        tz,
        -6 * 24
      )

      const { count: weekCompletions } =
        await supabase
          .from('completions')
          .select('id', {
            count: 'exact',
            head: true,
          })
          .eq('user_id', userId)
          .gte('date', weekStart)

      const { data: userTasks } = await supabase
        .from('tasks')
        .select('weekly_target')
        .eq('user_id', userId)

      const weekTarget = (userTasks ?? []).reduce(
        (sum, t) => sum + (t.weekly_target ?? 0),
        0
      )

      if ((weekCompletions ?? 0) > 0) {
        const pct = weekTarget
          ? Math.min(
              100,
              Math.round(
                ((weekCompletions ?? 0) /
                  weekTarget) *
                  100
              )
            )
          : 0

        const streakLen = await streakLength(
          userId,
          tz,
          now,
          0
        )

        for (const s of userSubs) {
          await sendTo(s, {
            title: 'VidaQuest',
            body: `📊 Tu semana: ${weekCompletions} tareas completadas (${pct}% de tus objetivos) y ${streakLen} día${
              streakLen === 1 ? '' : 's'
            } de racha.`,
            tag: 'weekly-recap',
          })
        }
      }

      await logSent(userId, 'weekly-recap', today)
    }
  }

  // 5) Sesión de enfoque terminada — avisa aunque el teléfono esté
  // bloqueado, porque no depende de que la pestaña siga abierta.
  const { data: dueFocusSessions } = await supabase
    .from('focus_sessions')
    .select('id, user_id, minutes')
    .eq('notified', false)
    .lte('ends_at', now.toISOString())

  for (const f of dueFocusSessions ?? []) {
    const userSubs = habitsSubsByUser.get(f.user_id) ?? []

    for (const s of userSubs) {
      await sendTo(s, {
        title: 'VidaQuest',
        body: `⏰ Terminó tu sesión de enfoque de ${f.minutes} minutos.`,
        tag: `focus-${f.id}`,
        requireInteraction: true,
        vibrate: [80, 40, 80, 40, 160],
      })
    }

    await supabase
      .from('focus_sessions')
      .update({ notified: true })
      .eq('id', f.id)
  }

  return new Response('ok')
})
