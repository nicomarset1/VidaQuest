-- Sistema de amigos: solicitudes, aceptación, y acceso controlado a
-- estadísticas resumidas (nunca a las tareas/notas de nadie).

create table public.friendships (
  id bigint generated always as identity primary key,
  requester_id uuid not null references auth.users on delete cascade,
  addressee_id uuid not null references auth.users on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

alter table public.friendships enable row level security;

create policy "select own friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "insert own requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "respond to received requests"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "delete own friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Busca un usuario por correo exacto, sin exponer el resto de la tabla
-- auth.users. Devuelve como mucho una fila.
create or replace function public.find_user_by_email(lookup_email text)
returns table (id uuid)
language sql
security definer
set search_path = public
stable
as $$
  select u.id
  from auth.users u
  where u.email = lower(trim(lookup_email))
  limit 1;
$$;

revoke all on function public.find_user_by_email(text) from public;
grant execute on function public.find_user_by_email(text) to authenticated;

-- Estadísticas resumidas de un amigo (ya aceptado). Nunca expone tareas,
-- notas ni recordatorios — solo números agregados y las fechas en que
-- completó algo (para poder calcular su racha, como en el mapa de calor).
create or replace function public.get_friend_stats(target_id uuid)
returns table (
  total_xp bigint,
  completions_count bigint,
  completion_dates date[],
  week_done bigint,
  week_target bigint
)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not exists (
    select 1 from public.friendships
    where status = 'accepted'
      and (
        (requester_id = auth.uid() and addressee_id = target_id)
        or (addressee_id = auth.uid() and requester_id = target_id)
      )
  ) then
    raise exception 'not friends with this user';
  end if;

  return query
  select
    coalesce((
      select sum(t.xp)
      from public.completions c
      join public.tasks t on t.id::text = c.task_id
      where c.user_id = target_id
    ), 0)::bigint as total_xp,
    (
      select count(*) from public.completions where user_id = target_id
    )::bigint as completions_count,
    (
      select array_agg(distinct date)
      from public.completions
      where user_id = target_id
    ) as completion_dates,
    coalesce((
      select count(*)
      from public.completions
      where user_id = target_id
        and date >= (current_date - interval '6 days')
    ), 0)::bigint as week_done,
    coalesce((
      select sum(weekly_target)
      from public.tasks
      where user_id = target_id
    ), 0)::bigint as week_target;
end;
$$;

revoke all on function public.get_friend_stats(uuid) from public;
grant execute on function public.get_friend_stats(uuid) to authenticated;
