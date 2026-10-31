-- Lapp i hatt (Ellenial Party games). Temporary games that live up to 24 h.
-- Runs in the gillefeeling Supabase project, in its own hatt_* tables.
-- No logins: a player is a secret token kept on their phone. Tables are closed to the
-- API; everything goes through the functions below. Words are deleted when a game ends,
-- and whole games (players and words) are deleted after 24 h.

create table public.hatt_games (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  lang text not null default 'sv' check (lang in ('sv','en')),
  settings jsonb not null,
  status text not null default 'lobby' check (status in ('lobby','play','done')),
  state jsonb,
  version int not null default 1,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create table public.hatt_players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.hatt_games(id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 20),
  team smallint check (team in (0,1)),
  ready boolean not null default false,
  joined_at timestamptz not null default now()
);
create index hatt_players_game on public.hatt_players(game_id);
create table public.hatt_words (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.hatt_games(id) on delete cascade,
  player_id uuid references public.hatt_players(id) on delete cascade,
  word text not null check (char_length(word) between 1 and 40)
);
create index hatt_words_game on public.hatt_words(game_id);
create index hatt_words_player on public.hatt_words(player_id);
create index hatt_games_expires on public.hatt_games(expires_at);

alter table public.hatt_games enable row level security;
alter table public.hatt_players enable row level security;
alter table public.hatt_words enable row level security;
revoke all on public.hatt_games, public.hatt_players, public.hatt_words from anon, authenticated;

-- ---------- helpers (not callable from the API) ----------
create function public.hatt_clean_name(p text) returns text language sql immutable
set search_path = public, pg_temp as $$
  select nullif(btrim(regexp_replace(coalesce(p,''), '[[:cntrl:]]', '', 'g')), '')
$$;

create function public.hatt_me(p_code text, p_token uuid) returns public.hatt_players
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  select * into g from hatt_games where code = upper(btrim(p_code)) and expires_at > now();
  if not found then raise exception 'hatt:nogame'; end if;
  select * into p from hatt_players where game_id = g.id and token = p_token;
  if not found then raise exception 'hatt:noplayer'; end if;
  return p;
end $$;

create function public.hatt_shuffle(a jsonb) returns jsonb language sql volatile
set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(x order by random()), '[]'::jsonb) from jsonb_array_elements(a) x
$$;

-- Move the turn to the next player on the other team.
create function public.hatt_advance(s jsonb) returns jsonb language plpgsql
set search_path = public, pg_temp as $$
declare tm int; ord jsonb; idx int;
begin
  tm := 1 - (s->>'team')::int;
  ord := s->'order'->tm;
  idx := (s->'next'->>tm)::int;
  s := jsonb_set(s, '{team}', to_jsonb(tm));
  s := jsonb_set(s, '{describer}', ord->(idx % jsonb_array_length(ord)));
  s := jsonb_set(s, array['next', tm::text], to_jsonb(idx + 1));
  return s;
end $$;

-- ---------- API ----------
create function public.hatt_create(p_lang text, p_settings jsonb, p_name text, p_extra text[] default '{}')
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; pl hatt_players; c text; n int := 0; w text; s jsonb; nm text;
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  delete from hatt_games where expires_at < now();
  if (select count(*) from hatt_games) >= 2000 then raise exception 'hatt:busy'; end if;
  nm := left(hatt_clean_name(p_name), 20);
  if nm is null then raise exception 'hatt:name'; end if;
  s := jsonb_build_object(
    'seconds', greatest(15, least(120, coalesce((p_settings->>'seconds')::int, 45) / 15 * 15)),
    'skips', greatest(0, least(3, coalesce((p_settings->>'skips')::int, 0))),
    'round4', coalesce((p_settings->>'round4')::boolean, false),
    'teams', case when p_settings->>'teams' = 'choose' then 'choose' else 'scramble' end);
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * 32)::int, 1); end loop;
    begin
      insert into hatt_games(code, lang, settings) values (c, case when p_lang = 'en' then 'en' else 'sv' end, s) returning * into g;
      exit;
    exception when unique_violation then n := n + 1; if n > 5 then raise; end if;
    end;
  end loop;
  insert into hatt_players(game_id, name) values (g.id, nm) returning * into pl;
  n := 0;
  foreach w in array coalesce(p_extra, '{}') loop
    w := left(hatt_clean_name(w), 40);
    if w is not null and n < 30 then insert into hatt_words(game_id, player_id, word) values (g.id, null, w); n := n + 1; end if;
  end loop;
  return jsonb_build_object('code', g.code, 'token', pl.token, 'player', pl.id);
end $$;

create function public.hatt_join(p_code text, p_name text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; pl hatt_players; nm text;
begin
  select * into g from hatt_games where code = upper(btrim(p_code)) and expires_at > now() for update;
  if not found then raise exception 'hatt:nogame'; end if;
  if g.status <> 'lobby' then raise exception 'hatt:started'; end if;
  if (select count(*) from hatt_players where game_id = g.id) >= 16 then raise exception 'hatt:full'; end if;
  nm := left(hatt_clean_name(p_name), 20);
  if nm is null then raise exception 'hatt:name'; end if;
  insert into hatt_players(game_id, name) values (g.id, nm) returning * into pl;
  update hatt_games set version = version + 1 where id = g.id;
  return jsonb_build_object('code', g.code, 'token', pl.token, 'player', pl.id);
end $$;

-- Everything one phone needs. Other players' words are only included once the game has started.
create function public.hatt_state(p_code text, p_token uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  return jsonb_build_object(
    'code', g.code, 'lang', g.lang, 'status', g.status, 'settings', g.settings, 'state', g.state,
    'version', g.version, 'expiresAt', g.expires_at,
    'me', jsonb_build_object('id', p.id, 'name', p.name, 'team', p.team, 'ready', p.ready),
    'players', (select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'team', x.team, 'ready', x.ready,
        'words', (select count(*) from hatt_words w where w.player_id = x.id)) order by x.joined_at), '[]') from hatt_players x where x.game_id = g.id),
    'myWords', (select coalesce(jsonb_agg(jsonb_build_object('id', w.id, 'word', w.word) order by w.word), '[]') from hatt_words w where w.player_id = p.id),
    'total', (select count(*) from hatt_words w where w.game_id = g.id),
    'words', case when g.status = 'play' then
      (select coalesce(jsonb_object_agg(w.id, w.word), '{}') from hatt_words w where w.game_id = g.id) end);
end $$;

create function public.hatt_add_word(p_code text, p_token uuid, p_word text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players; w text;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  if g.status <> 'lobby' then raise exception 'hatt:started'; end if;
  w := left(hatt_clean_name(p_word), 40);
  if w is null then return; end if;
  perform 1 from hatt_players where id = p.id for update;
  if (select count(*) from hatt_words where player_id = p.id) >= 5 then raise exception 'hatt:maxwords'; end if;
  if exists (select 1 from hatt_words where player_id = p.id and lower(word) = lower(w)) then return; end if;
  insert into hatt_words(game_id, player_id, word) values (g.id, p.id, w);
  update hatt_games set version = version + 1 where id = g.id;
end $$;

create function public.hatt_remove_word(p_code text, p_token uuid, p_word uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  if g.status <> 'lobby' then raise exception 'hatt:started'; end if;
  delete from hatt_words where id = p_word and player_id = p.id;
  -- Fewer than 3 words means not ready any more.
  update hatt_players set ready = false where id = p.id and (select count(*) from hatt_words where player_id = p.id) < 3;
  update hatt_games set version = version + 1 where id = g.id;
end $$;

create function public.hatt_set_team(p_code text, p_token uuid, p_team int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  if g.status <> 'lobby' then raise exception 'hatt:started'; end if;
  update hatt_players set team = case when p_team in (0,1) then p_team end where id = p.id;
  update hatt_games set version = version + 1 where id = g.id;
end $$;

-- Starts the game once everyone is ready (needs 2+ players and someone on each team).
create function public.hatt_try_start(p_game uuid) returns boolean
language plpgsql set search_path = public, pg_temp as $$
declare g hatt_games; ord jsonb; t0 int; s jsonb; i int := 0; r record;
begin
  select * into g from hatt_games where id = p_game for update;
  if g.status <> 'lobby'
     or exists (select 1 from hatt_players where game_id = g.id and not ready)
     or (select count(*) from hatt_players where game_id = g.id) < 2 then
    return false;
  end if;
  if g.settings->>'teams' = 'choose' then
    if (select count(distinct team) from hatt_players where game_id = g.id) < 2 then return false; end if;
  else
    for r in select id from hatt_players where game_id = g.id order by random() loop
      update hatt_players set team = i % 2 where id = r.id; i := i + 1;
    end loop;
  end if;
  ord := jsonb_build_array(
    (select jsonb_agg(id order by random()) from hatt_players where game_id = g.id and team = 0),
    (select jsonb_agg(id order by random()) from hatt_players where game_id = g.id and team = 1));
  t0 := floor(random() * 2)::int;
  s := jsonb_build_object(
    'round', 1, 'rounds', case when (g.settings->>'round4')::boolean then 4 else 3 end,
    'hat', hatt_shuffle((select jsonb_agg(id) from hatt_words where game_id = g.id)),
    'order', ord, 'team', t0, 'describer', ord->t0->0,
    'next', case when t0 = 0 then '[1,0]'::jsonb else '[0,1]'::jsonb end,
    'scores', '[0,0]'::jsonb, 'roundScores', '[[0,0]]'::jsonb,
    'turn', 0, 'carry', null, 'last', null);
  update hatt_games set status = 'play', state = s, version = version + 1 where id = g.id;
  return true;
end $$;

-- The last player to press ready starts the game.
create function public.hatt_ready(p_code text, p_token uuid, p_ready boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  select * into g from hatt_games where id = g.id for update;
  if g.status <> 'lobby' then return jsonb_build_object('started', true); end if;
  if p_ready and (select count(*) from hatt_words where player_id = p.id) < 3 then raise exception 'hatt:needwords'; end if;
  if p_ready and g.settings->>'teams' = 'choose' and p.team is null then raise exception 'hatt:needteam'; end if;
  update hatt_players set ready = p_ready where id = p.id;
  update hatt_games set version = version + 1 where id = g.id;
  return jsonb_build_object('started', hatt_try_start(g.id));
end $$;

-- Leave before the game starts: the player and their words are deleted.
create function public.hatt_leave(p_code text, p_token uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  select * into g from hatt_games where id = g.id for update;
  if g.status <> 'lobby' then return; end if;
  delete from hatt_players where id = p.id;
  if not exists (select 1 from hatt_players where game_id = g.id) then
    delete from hatt_games where id = g.id; return;
  end if;
  update hatt_games set version = version + 1 where id = g.id;
  perform hatt_try_start(g.id);
end $$;

-- The describer reports their turn: which words were guessed and how many seconds were left.
-- Repeats and stale reports (wrong round/turn) are ignored.
create function public.hatt_turn_done(p_code text, p_token uuid, p_round int, p_turn int, p_guessed uuid[], p_left int)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players; s jsonb; hat jsonb; n int; tm int; rnd int;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  select * into g from hatt_games where id = g.id for update;
  s := g.state;
  if g.status <> 'play' or s->>'describer' <> p.id::text
     or (s->>'round')::int <> p_round or (s->>'turn')::int <> p_turn then return; end if;
  select coalesce(jsonb_agg(x), '[]') into hat from jsonb_array_elements(s->'hat') x
    where (x #>> '{}')::uuid <> all(coalesce(p_guessed, '{}'));
  n := jsonb_array_length(s->'hat') - jsonb_array_length(hat);
  tm := (s->>'team')::int; rnd := p_round;
  s := jsonb_set(s, array['scores', tm::text], to_jsonb((s->'scores'->>tm)::int + n));
  s := jsonb_set(s, array['roundScores', (rnd-1)::text, tm::text], to_jsonb((s->'roundScores'->(rnd-1)->>tm)::int + n));
  s := jsonb_set(s, '{last}', jsonb_build_object('player', p.id, 'team', tm, 'guessed', n));
  if jsonb_array_length(hat) = 0 then
    if rnd >= (s->>'rounds')::int then
      update hatt_games set status = 'done', state = jsonb_set(s, '{hat}', '[]'), version = version + 1 where id = g.id;
      delete from hatt_words where game_id = g.id;
      return;
    end if;
    s := jsonb_set(s, '{round}', to_jsonb(rnd + 1));
    s := jsonb_set(s, '{roundScores}', (s->'roundScores') || '[[0,0]]'::jsonb);
    s := jsonb_set(s, '{hat}', hatt_shuffle((select jsonb_agg(id) from hatt_words where game_id = g.id)));
    s := jsonb_set(s, '{turn}', '0');
    -- Seconds left over: the same describer starts the next round with them.
    if coalesce(p_left, 0) >= 3 then
      s := jsonb_set(s, '{carry}', to_jsonb(least(p_left, (g.settings->>'seconds')::int)));
    else
      s := jsonb_set(s, '{carry}', 'null'); s := hatt_advance(s);
    end if;
  else
    s := jsonb_set(s, '{hat}', hat);
    s := jsonb_set(s, '{turn}', to_jsonb(p_turn + 1));
    s := jsonb_set(s, '{carry}', 'null');
    s := hatt_advance(s);
  end if;
  update hatt_games set state = s, version = version + 1 where id = g.id;
end $$;

-- Anyone in the game can pass on a describer who isn't there.
create function public.hatt_skip_turn(p_code text, p_token uuid, p_round int, p_turn int) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare g hatt_games; p hatt_players; s jsonb;
begin
  p := hatt_me(p_code, p_token); select * into g from hatt_games where id = p.game_id;
  select * into g from hatt_games where id = g.id for update;
  s := g.state;
  if g.status <> 'play' or (s->>'round')::int <> p_round or (s->>'turn')::int <> p_turn then return; end if;
  s := jsonb_set(s, '{turn}', to_jsonb(p_turn + 1));
  s := jsonb_set(s, '{carry}', 'null');
  s := jsonb_set(s, '{last}', 'null');
  update hatt_games set state = hatt_advance(s), version = version + 1 where id = g.id;
end $$;

-- Lock down: only the API functions are callable from the app.
revoke all on function public.hatt_clean_name(text), public.hatt_me(text, uuid), public.hatt_shuffle(jsonb), public.hatt_advance(jsonb), public.hatt_try_start(uuid) from public, anon, authenticated;
revoke all on function public.hatt_create(text, jsonb, text, text[]), public.hatt_join(text, text), public.hatt_state(text, uuid),
  public.hatt_add_word(text, uuid, text), public.hatt_remove_word(text, uuid, uuid), public.hatt_set_team(text, uuid, int),
  public.hatt_ready(text, uuid, boolean), public.hatt_turn_done(text, uuid, int, int, uuid[], int), public.hatt_skip_turn(text, uuid, int, int), public.hatt_leave(text, uuid) from public;
grant execute on function public.hatt_create(text, jsonb, text, text[]), public.hatt_join(text, text), public.hatt_state(text, uuid),
  public.hatt_add_word(text, uuid, text), public.hatt_remove_word(text, uuid, uuid), public.hatt_set_team(text, uuid, int),
  public.hatt_ready(text, uuid, boolean), public.hatt_turn_done(text, uuid, int, int, uuid[], int), public.hatt_skip_turn(text, uuid, int, int), public.hatt_leave(text, uuid) to anon, authenticated;

-- Delete expired games (and with them all players and words) every hour.
select cron.schedule('hatt-cleanup', '17 * * * *', $$delete from public.hatt_games where expires_at < now()$$);
