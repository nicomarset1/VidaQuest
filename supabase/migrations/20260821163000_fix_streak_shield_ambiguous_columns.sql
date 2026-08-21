-- Corrige "column reference is ambiguous": las columnas de streak_shields
-- (available, last_award_streak, consumed_dates) tienen el mismo nombre
-- que las columnas de salida de RETURNS TABLE, que plpgsql declara como
-- variables implícitas y chocan con las columnas de la tabla dentro del
-- cuerpo de la función. Se soluciona con un alias en el UPDATE.

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

  update public.streak_shields s
    set available = least(s.available + 1, 2),
        last_award_streak = new_milestone
    where s.user_id = auth.uid()
      and s.last_award_streak < new_milestone
      and new_milestone % 7 = 0;

  return query
  select s.available, s.last_award_streak
  from public.streak_shields s
  where s.user_id = auth.uid();
end;
$$;

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

  update public.streak_shields s
    set available = s.available - 1,
        consumed_dates = array_append(s.consumed_dates, gap_date)
    where s.user_id = auth.uid()
      and s.available > 0
      and not (gap_date = any(s.consumed_dates));

  return query
  select s.available, s.consumed_dates
  from public.streak_shields s
  where s.user_id = auth.uid();
end;
$$;
