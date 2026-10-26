create extension if not exists pgcrypto;

create table public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  url text not null check (url ~* '^https?://'),
  folder text not null default 'Favorites' check (char_length(folder) between 1 and 100),
  created_at timestamptz not null default now()
);
create index bookmarks_owner_folder_idx on public.bookmarks(owner_id, folder, created_at desc);
alter table public.bookmarks enable row level security;
create policy bookmarks_own_rows on public.bookmarks for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.browsing_history (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  url text not null check (url ~* '^https?://'),
  title text not null default '',
  visited_at timestamptz not null default now()
);
create index browsing_history_owner_date_idx on public.browsing_history(owner_id, visited_at desc);
alter table public.browsing_history enable row level security;
create policy browsing_history_own_rows on public.browsing_history for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.user_settings (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
create policy user_settings_own_rows on public.user_settings for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  sender_email text not null,
  recipient_email text not null,
  subject text not null check (char_length(subject) between 1 and 300),
  body text not null check (char_length(body) between 1 and 20000),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  sender_deleted_at timestamptz,
  recipient_deleted_at timestamptz
);
create index mail_messages_sender_idx on public.mail_messages(sender_id, created_at desc);
create index mail_messages_recipient_idx on public.mail_messages(recipient_id, created_at desc);
alter table public.mail_messages enable row level security;
create policy mail_messages_read_own on public.mail_messages for select to authenticated
  using (sender_id = (select auth.uid()) or recipient_id = (select auth.uid()));

create or replace function public.send_skynav_mail(to_email text, mail_subject text, mail_body text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare sender auth.users%rowtype;
declare recipient auth.users%rowtype;
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  if char_length(trim(coalesce(to_email,''))) < 3 or char_length(trim(coalesce(mail_subject,''))) not between 1 and 300 or char_length(trim(coalesce(mail_body,''))) not between 1 and 20000 then
    raise exception 'Recipient, subject, or message is invalid';
  end if;
  select * into sender from auth.users where id = auth.uid();
  select * into recipient from auth.users where lower(email) = lower(trim(to_email)) limit 1;
  if recipient.id is null then raise exception 'No SkyNav account uses that address'; end if;
  insert into public.mail_messages(sender_id, recipient_id, sender_email, recipient_email, subject, body)
  values (sender.id, recipient.id, sender.email, recipient.email, trim(mail_subject), trim(mail_body)) returning id into new_id;
  return new_id;
end $$;
revoke all on function public.send_skynav_mail(text,text,text) from public;
grant execute on function public.send_skynav_mail(text,text,text) to authenticated;

create or replace function public.mark_skynav_mail_read(message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mail_messages set read_at = coalesce(read_at,now()) where id = message_id and recipient_id = auth.uid();
end $$;
revoke all on function public.mark_skynav_mail_read(uuid) from public;
grant execute on function public.mark_skynav_mail_read(uuid) to authenticated;

create or replace function public.delete_skynav_mail(message_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.mail_messages set sender_deleted_at = now() where id = message_id and sender_id = auth.uid();
  update public.mail_messages set recipient_deleted_at = now() where id = message_id and recipient_id = auth.uid();
end $$;
revoke all on function public.delete_skynav_mail(uuid) from public;
grant execute on function public.delete_skynav_mail(uuid) to authenticated;
