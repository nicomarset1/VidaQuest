-- El ranking de amigos pasa a ordenarse por XP ganado en la semana en
-- vez de % de objetivos cumplidos: dos personas con distinta cantidad
-- de tareas (y distinto peso por tarea) no son comparables por
-- porcentaje, alguien con pocas tareas fáciles queda siempre arriba
-- aunque haga bastante menos que alguien con una lista más grande.

drop function if exists public.get_friend_stats(uuid);

create function public.get_friend_stats(target_id uuid)
returns table (
  total_xp bigint,
  completions_count bigint,
  completion_dates date[],
  week_done bigint,
  week_target bigint,
  week_xp bigint
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
    ), 0)::bigint as week_target,
    coalesce((
      select sum(t.xp)
      from public.completions c
      join public.tasks t on t.id::text = c.task_id
      where c.user_id = target_id
        and c.date >= (current_date - interval '6 days')
    ), 0)::bigint as week_xp;
end;
$$;

revoke all on function public.get_friend_stats(uuid) from public;
grant execute on function public.get_friend_stats(uuid) to authenticated;
