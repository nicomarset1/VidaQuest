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

function weekTierLabel(pct: number) {
  if (pct >= 90) return '🔥 Semana excelente'
  if (pct >= 70) return '💪 Semana sólida'
  if (pct >= 40) return '🙂 Semana pareja'
  return '🌱 Semana floja, la próxima remontás'
}

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

  // 1) Recordatorios: aviso 1h antes y aviso al llegar la hora.
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .eq('enabled', true)
    .or('notified_due.eq.false,notified_1h.eq.false')

  for (const r of reminders ?? []) {
    const tz = userTimezone.get(r.user_id) || FALLBACK_TZ
    const when = zonedTimeToUtc(r.date, r.time, tz)
    const diffMin = (when.getTime() - now.getTime()) / 60000
    const userSubs = subsByUser.get(r.user_id) ?? []

    if (!r.notified_1h && diffMin <= 60 && diffMin > 45) {
      for (const s of userSubs) {
        await sendTo(s, {
          title: 'VidaQuest',
          body: `En 1 hora: ${r.title}`,
          tag: `reminder-1h-${r.id}`,
        })
      }
      await supabase
        .from('reminders')
        .update({ notified_1h: true })
        .eq('id', r.id)
    }

    if (!r.notified_due && diffMin <= 0 && diffMin > -15) {
      for (const s of userSubs) {
        await sendTo(s, {
          title: 'VidaQuest',
          body: r.title,
          tag: `reminder-due-${r.id}`,
        })
      }
      await supabase
        .from('reminders')
        .update({ notified_due: true })
        .eq('id', r.id)
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
    const userSubs = subsByUser.get(t.user_id)
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
  // 20:00 y una escalada de varios entre las 22:00 y las 00:00.
  for (const [userId, userSubs] of subsByUser) {
    const tz = userTimezone.get(userId) || FALLBACK_TZ
    const hour = zonedHourOf(now, tz)
    const today = zonedDateString(now, tz)

    // 2) "Todavía no entraste hoy" — 20:00 local.
    if (hour === 20 && !(await alreadyLogged(userId, 'no-open', today))) {
      const doneToday = await countCompletions(userId, today)
      const lastSeenToday = userSubs.some(
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
            body: `${weekTierLabel(pct)} · ${weekCompletions} tareas completadas (${pct}% de tus objetivos) y ${streakLen} día${
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
    const userSubs = subsByUser.get(f.user_id) ?? []

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
