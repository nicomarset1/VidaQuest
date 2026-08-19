-- Ejecutar en el SQL Editor de Supabase. Cada usuario solo puede ver sus propios datos.
create table public.profiles (id uuid primary key references auth.users on delete cascade, display_name text, level integer not null default 1, total_xp integer not null default 0, created_at timestamptz not null default now());
create table public.habits (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, title text not null, area text, xp integer not null default 25, reminder_time time, active boolean not null default true, created_at timestamptz not null default now());
create table public.habit_completions (id uuid primary key default gen_random_uuid(), habit_id uuid not null references public.habits on delete cascade, user_id uuid not null references auth.users on delete cascade, completed_on date not null default current_date, completed_at timestamptz not null default now(), unique (habit_id, completed_on));
create table public.notes (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, body text not null, note_date date not null default current_date, updated_at timestamptz not null default now());
create table public.reminders (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade, title text not null, scheduled_at timestamptz, enabled boolean not null default true, created_at timestamptz not null default now());
alter table public.profiles enable row level security; alter table public.habits enable row level security; alter table public.habit_completions enable row level security; alter table public.notes enable row level security; alter table public.reminders enable row level security;
create policy "own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "own habits" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own completions" on public.habit_completions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes" on public.notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own reminders" on public.reminders for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
