-- Guarda qué insignias ya mostraron su animación de "nueva insignia" y
-- cuáles ya viste al entrar a Progreso. Sin esto, cada recarga volvía a
-- animar (o directamente no sabía) qué insignias ya tenías.

create table public.achievement_state (
  user_id uuid primary key references auth.users on delete cascade,
  celebrated text[] not null default '{}',
  viewed text[] not null default '{}'
);

alter table public.achievement_state enable row level security;

create policy "manage own achievement state"
  on public.achievement_state for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
