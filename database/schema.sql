create table public.game_rooms (
  code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  white_hash text not null, black_hash text,
  white_name text not null, black_name text,
  state jsonb not null, version integer not null default 0,
  round integer not null default 1, draw_offer text,
  rematch_votes jsonb not null default '[]'::jsonb,
  white_seen timestamptz not null, black_seen timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.game_rooms enable row level security;
revoke all on public.game_rooms from anon, authenticated;
grant select, insert, update, delete on public.game_rooms to service_role;
create index game_rooms_expiry on public.game_rooms(updated_at);

create table public.game_rate_limits (
  bucket text primary key, hits integer not null default 1, expires_at timestamptz not null
);
alter table public.game_rate_limits enable row level security;
revoke all on public.game_rate_limits from anon, authenticated;
grant select, insert, update, delete on public.game_rate_limits to service_role;
create index game_rate_limits_expiry on public.game_rate_limits(expires_at);

create function public.game_allow_request(p_bucket text,p_limit integer,p_seconds integer)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare total integer;
begin
  insert into public.game_rate_limits(bucket,hits,expires_at)
  values(p_bucket,1,now()+make_interval(secs=>p_seconds))
  on conflict(bucket) do update set
    hits=case when game_rate_limits.expires_at<now() then 1 else game_rate_limits.hits+1 end,
    expires_at=case when game_rate_limits.expires_at<now() then now()+make_interval(secs=>p_seconds) else game_rate_limits.expires_at end
  returning hits into total;
  if random()<0.01 then
    delete from public.game_rate_limits where expires_at<now()-interval '1 hour';
    delete from public.game_rooms where updated_at<now()-interval '7 days';
  end if;
  return total<=p_limit;
end;
$$;
revoke execute on function public.game_allow_request(text,integer,integer) from public, anon, authenticated;
grant execute on function public.game_allow_request(text,integer,integer) to service_role;
