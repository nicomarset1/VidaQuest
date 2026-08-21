-- Apodos: cada lado de una amistad puede ponerle un apodo al otro,
-- sin que dependa de exponerse por el correo.

alter table public.friendships
  add column requester_nickname text,
  add column addressee_nickname text;

-- Actualiza el apodo que el usuario que llama le puso a la otra persona
-- de una amistad. Evita tener que abrir la política de UPDATE (que hoy
-- solo permite responder a solicitudes) a cualquiera de las dos partes,
-- lo que dejaría cambiar también el status.
create or replace function public.set_friend_nickname(
  friendship_id bigint,
  nickname text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  clean text := nullif(trim(nickname), '');
begin
  select * into f from public.friendships where id = friendship_id;

  if f is null then
    raise exception 'friendship not found';
  end if;

  if f.requester_id = auth.uid() then
    update public.friendships
      set requester_nickname = clean
      where id = friendship_id;
  elsif f.addressee_id = auth.uid() then
    update public.friendships
      set addressee_nickname = clean
      where id = friendship_id;
  else
    raise exception 'not part of this friendship';
  end if;
end;
$$;

revoke all on function public.set_friend_nickname(bigint, text) from public;
grant execute on function public.set_friend_nickname(bigint, text) to authenticated;
