-- Sesiones del temporizador de enfoque. Se guardan para poder avisar
-- por push cuando termina aunque el teléfono esté bloqueado.

create table public.focus_sessions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users on delete cascade,
  minutes int not null,
  ends_at timestamptz not null,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.focus_sessions enable row level security;

create policy "manage own focus sessions"
  on public.focus_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
