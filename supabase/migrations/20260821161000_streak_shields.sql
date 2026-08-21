-- Protectores de racha: cada 7 días de racha se gana uno (tope 2), y
-- cubre un día salteado sin cortar la racha. Las mutaciones van todas
-- por RPC (nunca UPDATE directo del cliente) para que nadie pueda
-- simplemente escribir un número alto en "available".

create table public.streak_shields (
  user_id uuid primary key references auth.users on delete cascade,
  available int not null default 0,
  last_award_streak int not null default 0,
  consumed_dates date[] not null default '{}'
);

alter table public.streak_shields enable row level security;

create policy "select own shield"
  on public.streak_shields for select
  using (auth.uid() = user_id);

create or replace function public.award_streak_shield(new_milestone int)
returns table (available int, last_award_streak int)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.streak_shields (user_id, available, last_award_streak)
  values (auth.uid(), 0, 0)
  on conflict (user_id) do nothing;

  update public.streak_shields
    set available = least(available + 1, 2),
        last_award_streak = new_milestone
    where user_id = auth.uid()
      and last_award_streak < new_milestone
      and new_milestone % 7 = 0;

  return query
  select s.available, s.last_award_streak
  from public.streak_shields s
  where s.user_id = auth.uid();
end;
$$;

revoke all on function public.award_streak_shield(int) from public;
grant execute on function public.award_streak_shield(int) to authenticated;

create or replace function public.consume_streak_shield(gap_date date)
returns table (available int, consumed_dates date[])
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.streak_shields (user_id, available, last_award_streak)
  values (auth.uid(), 0, 0)
  on conflict (user_id) do nothing;

  update public.streak_shields
    set available = available - 1,
        consumed_dates = array_append(consumed_dates, gap_date)
    where user_id = auth.uid()
      and available > 0
      and not (gap_date = any(consumed_dates));

  return query
  select s.available, s.consumed_dates
  from public.streak_shields s
  where s.user_id = auth.uid();
end;
$$;

revoke all on function public.consume_streak_shield(date) from public;
grant execute on function public.consume_streak_shield(date) to authenticated;
