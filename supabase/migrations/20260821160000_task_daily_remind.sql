-- Recordatorio diario por tarea: si está activado, se manda un aviso
-- a la hora configurada de la tarea (si todavía no se completó ese
-- día), con un botón para marcarla hecha sin abrir la app.

alter table public.tasks add column if not exists remind boolean not null default false;
