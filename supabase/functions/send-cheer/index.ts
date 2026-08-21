import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails(
  'mailto:nicolasmarsetg@gmail.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
)

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return json({ error: 'unauthorized' }, 401)

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  })

  const { data: userData, error: userErr } =
    await userClient.auth.getUser()

  if (userErr || !userData.user) {
    return json({ error: 'unauthorized' }, 401)
  }

  const fromUser = userData.user
  const { friendshipId } = await req.json().catch(() => ({}))

  if (!friendshipId) return json({ error: 'missing friendshipId' }, 400)

  // Se consulta con el cliente del usuario (no el admin) para que RLS
  // garantice que solo puede mandar aliento a una amistad de la que
  // realmente es parte.
  const { data: friendship } = await userClient
    .from('friendships')
    .select(
      'id, requester_id, addressee_id, status, requester_nickname, addressee_nickname'
    )
    .eq('id', friendshipId)
    .eq('status', 'accepted')
    .maybeSingle()

  if (!friendship) {
    return json({ ok: false, reason: 'not-friends' })
  }

  const toUserId =
    friendship.requester_id === fromUser.id
      ? friendship.addressee_id
      : friendship.requester_id

  // El apodo que el DESTINATARIO le puso al que manda el aliento (no
  // el que el que manda le puso a él), guardado del lado que le
  // corresponde según su rol en la fila.
  const nicknameForSender =
    toUserId === friendship.requester_id
      ? friendship.requester_nickname
      : friendship.addressee_nickname

  const today = new Date().toISOString().slice(0, 10)
  const kindPrefix = `cheer-from-${fromUser.id}`
  const DAILY_LIMIT = 2

  const { count: sentToday } = await admin
    .from('notification_log')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', toUserId)
    .eq('log_date', today)
    .like('kind', `${kindPrefix}%`)

  if ((sentToday ?? 0) >= DAILY_LIMIT) {
    return json({ ok: false, reason: 'cooldown' })
  }

  const { data: subs } = await admin
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', toUserId)

  const fromLabel =
    nicknameForSender || fromUser.email || 'Un amigo'
  let sentCount = 0

  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(
        {
          endpoint: s.endpoint,
          keys: { p256dh: s.p256dh, auth: s.auth },
        },
        JSON.stringify({
          title: 'VidaQuest',
          body: `🔥 ${fromLabel} te mandó ánimo. ¡Dale que podés!`,
          tag: 'cheer',
        })
      )
      sentCount++
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('id', s.id)
      } else {
        console.error('push error', statusCode, err)
      }
    }
  }

  // La entrada se guarda con un sufijo único: notification_log tiene
  // una restricción unique(user_id, kind, log_date) pensada para
  // avisos que se mandan una sola vez, y acá necesitamos permitir
  // hasta DAILY_LIMIT por día para el mismo par de amigos.
  await admin.from('notification_log').insert({
    user_id: toUserId,
    kind: `${kindPrefix}-${crypto.randomUUID()}`,
    log_date: today,
  })

  return json({ ok: true, sentTo: sentCount })
})
