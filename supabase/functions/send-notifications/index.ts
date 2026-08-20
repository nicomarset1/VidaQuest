import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!

const ART_TZ = 'America/Argentina/Buenos_Aires'

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
}

function artDateString(now: Date, offsetHours = 0) {
  const shifted = new Date(now.getTime() + offsetHours * 3600_000)

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ART_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(shifted)
}

function artHourOf(now: Date) {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      hour12: false,
      timeZone: ART_TZ,
    }).format(now)
  )
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

Deno.serve(async req => {
  if (req.headers.get('x-cron-secret') !== CRON_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  const now = new Date()
  const todayART = artDateString(now)

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

  // 1) Recordatorios: aviso 1h antes y aviso al llegar la hora.
  const { data: reminders } = await supabase
    .from('reminders')
    .select('*')
    .eq('enabled', true)
    .or('notified_due.eq.false,notified_1h.eq.false')
    .gte('date', artDateString(now, -24))

  for (const r of reminders ?? []) {
    const when = new Date(`${r.date}T${r.time}:00-03:00`)
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

  // Las dos notificaciones diarias corren una sola vez, cuando el reloj ART
  // entra en su franja horaria (20:00 y 23:00 ART).
  const artHour = artHourOf(now)

  // 2) "Todavía no entraste hoy" — 20:00 ART.
  if (artHour === 20) {
    for (const [userId, userSubs] of subsByUser) {
      if (await alreadyLogged(userId, 'no-open', todayART)) continue

      const doneToday = await countCompletions(userId, todayART)
      const lastSeenToday = userSubs.some(
        s =>
          s.last_seen_at &&
          artDateString(new Date(s.last_seen_at)) === todayART
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

      await logSent(userId, 'no-open', todayART)
    }
  }

  // 3) "Vas a perder la racha" — 23:00 ART.
  if (artHour === 23) {
    const yesterdayART = artDateString(now, -24)

    for (const [userId, userSubs] of subsByUser) {
      if (await alreadyLogged(userId, 'streak-risk', todayART)) continue

      const doneToday = await countCompletions(userId, todayART)
      const doneYesterday = await countCompletions(userId, yesterdayART)

      if (!doneToday && doneYesterday) {
        for (const s of userSubs) {
          await sendTo(s, {
            title: 'VidaQuest',
            body: 'Tu racha está en riesgo. Completá algo antes de la medianoche.',
            tag: 'streak-risk',
          })
        }
      }

      await logSent(userId, 'streak-risk', todayART)
    }
  }

  return new Response('ok')
})
