-- Devuelve el correo de otro usuario SOLO si ya existe una relación de
-- amistad (pendiente o aceptada) entre auth.uid() y ese usuario. Sirve
-- para mostrar el correo en la lista de solicitudes/amigos sin abrir
-- una forma de buscar cualquier correo del sistema.
create or replace function public.get_related_user_email(target_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select u.email
  from auth.users u
  where u.id = target_id
    and exists (
      select 1 from public.friendships f
      where (f.requester_id = auth.uid() and f.addressee_id = target_id)
         or (f.addressee_id = auth.uid() and f.requester_id = target_id)
    )
  limit 1;
$$;

revoke all on function public.get_related_user_email(uuid) from public;
grant execute on function public.get_related_user_email(uuid) to authenticated;
