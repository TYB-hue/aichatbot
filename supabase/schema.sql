-- Run once in the Supabase SQL editor on a new project.
create table public.conversations (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users on delete cascade,
 title text not null default 'New conversation', created_at timestamptz not null default now()
);
create table public.messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.conversations on delete cascade,
 role text not null check(role in ('user','assistant')), content text not null,
 attachments jsonb not null default '[]', created_at timestamptz not null default clock_timestamp()
);
create index on public.messages(conversation_id,created_at);
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
create policy own_chats on public.conversations for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy read_messages on public.messages for select to authenticated using(exists(select 1 from public.conversations c where c.id=conversation_id and c.user_id=auth.uid()));
-- The RPC writes message pairs atomically; history is not an audit log.
revoke all on public.messages from anon,authenticated;
grant select on public.messages to authenticated;
grant select,insert,update,delete on public.conversations to authenticated;
create table public.request_limits(user_id uuid primary key references auth.users on delete cascade, last_request timestamptz not null);
alter table public.request_limits enable row level security;
create function public.claim_chat_request() returns boolean language plpgsql security definer set search_path=public as $$
begin
 if auth.uid() is null then return false; end if;
 insert into request_limits values(auth.uid(),now()) on conflict(user_id) do update set last_request=excluded.last_request where request_limits.last_request < now()-interval '10 seconds';
 return found;
end $$;
create function public.save_chat_turn(chat_id uuid,prompt text,files jsonb,answer text) returns void language plpgsql security definer set search_path=public as $$
begin
 if not exists(select 1 from conversations where id=chat_id and user_id=auth.uid()) then raise exception 'Forbidden'; end if;
 insert into messages(conversation_id,role,content,attachments) values(chat_id,'user',prompt,files);
 insert into messages(conversation_id,role,content) values(chat_id,'assistant',answer);
end $$;
revoke all on function public.claim_chat_request() from public,anon;
revoke all on function public.save_chat_turn(uuid,text,jsonb,text) from public,anon;
grant execute on function public.claim_chat_request() to authenticated;
grant execute on function public.save_chat_turn(uuid,text,jsonb,text) to authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('uploads','uploads',false,5242880,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain','image/png','image/jpeg','image/webp']);
create policy upload_own on storage.objects for insert to authenticated with check(bucket_id='uploads' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.conversations where id::text=(storage.foldername(name))[2] and user_id=auth.uid()));
create policy read_own_files on storage.objects for select to authenticated using(bucket_id='uploads' and (storage.foldername(name))[1]=auth.uid()::text);
create policy delete_own_files on storage.objects for delete to authenticated using(bucket_id='uploads' and (storage.foldername(name))[1]=auth.uid()::text);
