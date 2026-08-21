-- Orden manual de tareas (arrastrar para reordenar, estilo playlist).

alter table public.tasks add column if not exists position integer;

with ranked as (
  select
    id,
    row_number() over (
      partition by user_id
      order by created_at, id
    ) - 1 as rn
  from public.tasks
)
update public.tasks t
set position = ranked.rn
from ranked
where t.id = ranked.id
  and t.position is null;

alter table public.tasks alter column position set default 0;
