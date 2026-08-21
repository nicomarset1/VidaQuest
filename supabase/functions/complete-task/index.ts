import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ACTION_TOKEN_SECRET = Deno.env.get('ACTION_TOKEN_SECRET')!

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
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

// Marca una tarea como hecha desde el botón de una notificación push,
// sin que haga falta abrir la app ni tener una sesión activa. La
// autorización es el token firmado que viene en la propia notificación
// (generado por send-notifications con el mismo secreto), no un JWT de
// usuario — así el service worker puede llamarlo en segundo plano.
Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const { userId, taskId, date, token } = await req
    .json()
    .catch(() => ({}))

  if (!userId || !taskId || !date || !token) {
    return json({ error: 'missing fields' }, 400)
  }

  const expected = await sign(`${userId}:${taskId}:${date}`)

  if (expected !== token) {
    return json({ error: 'invalid token' }, 403)
  }

  const { data: existing } = await admin
    .from('completions')
    .select('id')
    .eq('user_id', userId)
    .eq('task_id', taskId)
    .eq('date', date)
    .maybeSingle()

  if (!existing) {
    const { error } = await admin
      .from('completions')
      .insert({ user_id: userId, task_id: taskId, date })

    if (error) {
      console.error('Error marcando tarea desde notificación:', error)
      return json({ error: 'insert failed' }, 500)
    }
  }

  return json({ ok: true, alreadyDone: !!existing })
})
