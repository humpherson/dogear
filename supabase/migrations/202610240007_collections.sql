-- Collections are private library entries, never synthetic catalogue books.
create table public.collections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (char_length(btrim(name)) between 1 and 120 and name = btrim(name)),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(id,user_id)
);
create unique index collections_owner_name on public.collections(user_id,lower(btrim(name)));
alter table public.collections enable row level security;
create policy own_collection_read on public.collections for select to authenticated using ((select auth.uid())=user_id);
revoke all on public.collections from public,anon,authenticated;
grant select on public.collections to authenticated;
create trigger collections_timestamp before update on public.collections for each row execute function public.touch_updated_at();
alter table public.quotes alter column user_book_id drop not null;
alter table public.quotes add column collection_id uuid;
alter table public.quotes add constraint quotes_collection_owner foreign key(collection_id,user_id) references public.collections(id,user_id) on delete cascade;
alter table public.quotes add constraint quotes_one_parent check ((user_book_id is null) <> (collection_id is null));
create index quotes_collection on public.quotes(collection_id);
alter table public.quotes add column credit_mode text not null default 'book' check (credit_mode in ('book','custom'));
alter table public.quotes add column credit_author text check (char_length(credit_author)<=10000);
alter table public.quotes add column credit_source text check (char_length(credit_source)<=1000);
alter table public.quotes add column credit_year text check (credit_year ~ '^\d{4}$');
alter table public.quotes add constraint collection_custom_credit check (collection_id is null or credit_mode='custom');
-- All old/new library RPCs acquire this per-user lock before their existing
-- book-specific locks. Different users remain independent; reads do not wait.
create or replace function public.save_quote_with_book(book jsonb, quote jsonb)
returns table(quote_id uuid, user_book_id uuid)
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); catalog_id uuid; library_id uuid; saved_id uuid; author_list text[]; quote_text text;
begin
 if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':library',0));
 if jsonb_typeof(book) is distinct from 'object' or jsonb_typeof(quote) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if book->>'source' is null or book->>'source' not in ('open_library','google_books') then raise exception 'Unsupported book source'; end if;
 if book->>'source' = 'open_library' and (book->>'source_id' is null or book->>'source_id' !~ '^OL[0-9]+W$') then raise exception 'Invalid Open Library work identifier'; end if;
 -- Existing Google records can receive more quotes, but discovery now uses Open Library.
 if book->>'source' = 'google_books' and not exists(select 1 from public.books b where b.source='google_books' and b.source_id=book->>'source_id') then raise exception 'New catalog entries must use Open Library'; end if;
 if jsonb_typeof(book->'authors') is distinct from 'array' or jsonb_array_length(book->'authors') > 30 then raise exception 'Invalid authors'; end if;
 if exists(select 1 from jsonb_array_elements(book->'authors') a where jsonb_typeof(a) <> 'string' or char_length(a #>> '{}') > 300) then raise exception 'Invalid author'; end if;
 select coalesce(array_agg(btrim(value)), '{}') into author_list from jsonb_array_elements_text(book->'authors');
 quote_text := btrim(quote->>'text', E' \t\r\n');
 if quote_text is null or char_length(quote_text) not between 1 and 10000 or char_length(quote->>'note') > 5000 or char_length(quote->>'page_number') > 100 then raise exception 'Invalid quote'; end if;
 if char_length(book->>'description') > 20000 then raise exception 'Description too long'; end if;
 -- Validate every submission, including metadata for an already-known source ID.
 if book->>'source_id' is null or book->>'source_id' !~ '^[A-Za-z0-9_-]{1,128}$'
 or book->>'title' is null or char_length(btrim(book->>'title')) not between 1 and 1000
 or (book->>'cover_url' is not null and (char_length(book->>'cover_url') > 2048 or book->>'cover_url' !~ '^https://[A-Za-z0-9.-]+(:443)?(/[^[:space:]]*)?$'))
 or (book->>'published_date' is not null and book->>'published_date' !~ '^\d{4}(-\d{2})?(-\d{2})?$')
 or (book->>'isbn_10' is not null and book->>'isbn_10' !~ '^[0-9Xx]{10}$')
 or (book->>'isbn_13' is not null and book->>'isbn_13' !~ '^[0-9]{13}$') then raise exception 'Invalid book metadata'; end if;
 insert into public.books(source,source_id,title,authors,description,published_date,cover_url,isbn_10,isbn_13)
 values (book->>'source',book->>'source_id',btrim(book->>'title'),author_list,regexp_replace(book->>'description','<[^>]*>','','g'),book->>'published_date',book->>'cover_url',book->>'isbn_10',book->>'isbn_13')
 on conflict(source,source_id) do nothing;
 select b.id into catalog_id from public.books b where b.source=book->>'source' and b.source_id=book->>'source_id';
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || catalog_id::text,0));
 insert into public.user_books(user_id,book_id) values(caller,catalog_id) on conflict(user_id,book_id) do nothing;
 select ub.id into library_id from public.user_books ub where ub.user_id=caller and ub.book_id=catalog_id;
 insert into public.quotes(user_id,user_book_id,text,page_number,note)
 values(caller,library_id,quote_text,nullif(btrim(quote->>'page_number'),''),nullif(btrim(quote->>'note'),'')) returning id into saved_id;
 return query select saved_id,library_id;
end $$;

create or replace function public.delete_quote(quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); catalog_id uuid; library_id uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':library',0));
 select ub.book_id, ub.id into catalog_id,library_id from public.quotes q join public.user_books ub on ub.id=q.user_book_id where q.id=quote_id and q.user_id=caller;
 if library_id is null then raise exception 'Quote not found' using errcode = 'P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || catalog_id::text,0));
 delete from public.quotes q where q.id=quote_id and q.user_id=caller;
 delete from public.user_books ub where ub.id=library_id and ub.user_id=caller and not exists(select 1 from public.quotes q where q.user_book_id=library_id);
end $$;

-- Private helpers: callable only by the trusted mutation functions below.
create function public.collection_quote_payload(input jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare words text;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'text') is distinct from 'string' then raise exception 'Enter a quotation.'; end if;
 words := btrim(input->>'text', E' \t\r\n');
 if char_length(words) not between 1 and 10000 then raise exception 'Invalid quotation length.'; end if;
 if char_length(input->>'note')>5000 or char_length(input->>'page_number')>100 then raise exception 'Invalid note or reference length.'; end if;
 if char_length(input->>'credit_author')>10000 or char_length(input->>'credit_source')>1000 then raise exception 'Attribution is too long.'; end if;
 if exists(select 1 from jsonb_each(input) e where e.key in ('note','page_number','credit_author','credit_source') and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Invalid quotation fields.'; end if;
 return jsonb_build_object('text',words,'note',nullif(btrim(input->>'note'),''),'page_number',nullif(btrim(input->>'page_number'),''),'credit_author',nullif(btrim(input->>'credit_author'),''),'credit_source',nullif(btrim(input->>'credit_source'),''));
end $$;

create function public.library_entry_result(entry_kind text, entry_id uuid, summary_only boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 select case when entry_kind='collection' then
   (select to_jsonb(c)||jsonb_build_object('kind','collection','quotes',jsonb_build_array(jsonb_build_object('count',(select count(*) from public.quotes q where q.collection_id=c.id and q.user_id=auth.uid())))) from public.collections c where c.id=entry_id and c.user_id=auth.uid())
 else
   (select to_jsonb(ub)||jsonb_build_object('kind','book','books',case when summary_only then jsonb_build_object('id',b.id,'source',b.source,'source_id',b.source_id,'title',b.title,'authors',b.authors,'published_date',b.published_date,'cover_url',b.cover_url) else to_jsonb(b) end,'quotes',jsonb_build_array(jsonb_build_object('count',(select count(*) from public.quotes q where q.user_book_id=ub.id and q.user_id=auth.uid())))) from public.user_books ub join public.books b on b.id=ub.book_id where ub.id=entry_id and ub.user_id=auth.uid()) end;
$$;

create function public.get_library_entries() returns setof jsonb
language sql stable security definer set search_path='' as $$
 select public.library_entry_result(e.kind,e.id,true) from (
 select 'book' as kind,ub.id,ub.created_at from public.user_books ub where ub.user_id=auth.uid()
 union all select 'collection',c.id,c.created_at from public.collections c where c.user_id=auth.uid()
 ) e order by e.created_at desc,e.id;
$$;

create function public.save_collection_quote(quote jsonb, collection_id uuid default null, collection_name text default null)
returns table(quote_record jsonb, library_entry jsonb)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); target uuid; payload jsonb; saved public.quotes; title text;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 payload:=public.collection_quote_payload(quote);
 if (collection_id is null) = (collection_name is null) then raise exception 'Choose a collection or enter a new name.'; end if;
 if collection_id is null then
   title:=btrim(collection_name,E' \t\r\n');
   if char_length(title) not between 1 and 120 then raise exception 'Use a collection name between 1 and 120 characters.'; end if;
   if exists(select 1 from public.collections c where c.user_id=caller and lower(c.name)=lower(title)) then raise exception 'A collection with this name already exists. Choose it from your library.'; end if;
   insert into public.collections(user_id,name) values(caller,title) returning id into target;
 else
   select c.id into target from public.collections c where c.id=collection_id and c.user_id=caller;
   if target is null then raise exception 'Collection not found' using errcode='P0002'; end if;
 end if;
 insert into public.quotes(user_id,collection_id,text,note,page_number,credit_mode,credit_author,credit_source)
 values(caller,target,payload->>'text',payload->>'note',payload->>'page_number','custom',payload->>'credit_author',payload->>'credit_source') returning * into saved;
 return query select to_jsonb(saved),public.library_entry_result('collection',target);
end $$;

create function public.rename_collection(collection_id uuid, collection_name text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); title text:=btrim(collection_name,E' \t\r\n');
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 if char_length(title) not between 1 and 120 or title is null then raise exception 'Use a collection name between 1 and 120 characters.'; end if;
 if not exists(select 1 from public.collections c where c.id=collection_id and c.user_id=caller) then raise exception 'Collection not found' using errcode='P0002'; end if;
 if exists(select 1 from public.collections c where c.id<>collection_id and c.user_id=caller and lower(c.name)=lower(title)) then raise exception 'A collection with this name already exists.'; end if;
 update public.collections c set name=title where c.id=collection_id and c.user_id=caller;
 return public.library_entry_result('collection',collection_id);
end $$;

create function public.delete_library_quote(quote_id uuid)
returns table(user_book_id uuid, collection_id uuid, remaining_count bigint)
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); original public.quotes; remaining bigint;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 select * into original from public.quotes q where q.id=quote_id and q.user_id=caller;
 if original.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
 if original.user_book_id is not null then
   perform public.delete_quote(quote_id);
   select count(*) into remaining from public.quotes q where q.user_book_id=original.user_book_id and q.user_id=caller;
 else
   delete from public.quotes q where q.id=quote_id and q.user_id=caller;
   select count(*) into remaining from public.quotes q where q.collection_id=original.collection_id and q.user_id=caller;
   if remaining=0 then delete from public.collections c where c.id=original.collection_id and c.user_id=caller; end if;
 end if;
 return query select original.user_book_id,original.collection_id,remaining;
end $$;

create function public.edit_library_quote(quote_id uuid, quote jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); original public.quotes; changed public.quotes; payload jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 select * into original from public.quotes q where q.id=quote_id and q.user_id=caller;
 if original.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
 payload:=public.collection_quote_payload(quote);
 update public.quotes q set text=payload->>'text',note=payload->>'note',page_number=payload->>'page_number',
 credit_author=case when quote ? 'credit_author' then payload->>'credit_author' else original.credit_author end,
 credit_source=case when quote ? 'credit_source' then payload->>'credit_source' else original.credit_source end,
 credit_mode=case when quote ? 'credit_author' or quote ? 'credit_source' then 'custom' else original.credit_mode end,
 credit_year=case when quote ? 'credit_source' and (payload->>'credit_source') is distinct from original.credit_source then null else original.credit_year end
 where q.id=quote_id and q.user_id=caller returning * into changed;
 return to_jsonb(changed);
end $$;

create function public.move_quote(quote_id uuid,target_kind text,target_id uuid default null,new_collection_name text default null,credits jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); original public.quotes; changed public.quotes; old_kind text; old_id uuid; destination uuid; old_author text; old_source text; old_year text; title text; remaining bigint;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 select * into original from public.quotes q where q.id=quote_id and q.user_id=caller;
 if original.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
 old_kind:=case when original.collection_id is null then 'book' else 'collection' end;
 old_id:=coalesce(original.collection_id,original.user_book_id);
 if target_kind is null or target_kind not in ('book','collection') then raise exception 'Invalid destination.'; end if;
 if target_kind='collection' and target_id is null and new_collection_name is not null then
   title:=btrim(new_collection_name,E' \t\r\n');
   if char_length(title) not between 1 and 120 then raise exception 'Use a collection name between 1 and 120 characters.'; end if;
   if exists(select 1 from public.collections c where c.user_id=caller and lower(c.name)=lower(title)) then raise exception 'A collection with this name already exists.'; end if;
   insert into public.collections(user_id,name) values(caller,title) returning id into destination;
 elsif target_id is not null and new_collection_name is null then
   if target_kind='book' then select ub.id into destination from public.user_books ub where ub.id=target_id and ub.user_id=caller;
   else select c.id into destination from public.collections c where c.id=target_id and c.user_id=caller; end if;
 else raise exception 'Choose a destination.';
 end if;
 if destination is null then raise exception 'Destination not found' using errcode='P0002'; end if;
 if target_kind=old_kind and destination=old_id then raise exception 'Choose a different destination.'; end if;
 if original.credit_mode='book' then
   select coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author'),b.title,left(b.published_date,4) into old_author,old_source,old_year
   from public.user_books ub join public.books b on b.id=ub.book_id where ub.id=original.user_book_id and ub.user_id=caller;
 else old_author:=original.credit_author; old_source:=original.credit_source; old_year:=original.credit_year; end if;
 if credits is not null then
   perform public.collection_quote_payload(jsonb_build_object('text',original.text)||credits);
   if (nullif(btrim(credits->>'credit_source'),'')) is distinct from old_source then old_year:=null; end if;
   old_author:=nullif(btrim(credits->>'credit_author'),''); old_source:=nullif(btrim(credits->>'credit_source'),'');
 end if;
 update public.quotes q set user_book_id=case when target_kind='book' then destination else null end,
 collection_id=case when target_kind='collection' then destination else null end,
 credit_mode='custom',credit_author=old_author,credit_source=old_source,credit_year=old_year
 where q.id=quote_id and q.user_id=caller returning * into changed;
 if old_kind='book' then
   select count(*) into remaining from public.quotes q where q.user_book_id=old_id and q.user_id=caller;
   if remaining=0 then delete from public.user_books ub where ub.id=old_id and ub.user_id=caller; end if;
 else
   select count(*) into remaining from public.quotes q where q.collection_id=old_id and q.user_id=caller;
   if remaining=0 then delete from public.collections c where c.id=old_id and c.user_id=caller; end if;
 end if;
 return jsonb_build_object('quote_record',to_jsonb(changed),'source_kind',old_kind,'source_id',old_id,'source_remaining_count',remaining,'source_entry',public.library_entry_result(old_kind,old_id),'destination_entry',public.library_entry_result(target_kind,destination));
end $$;

create or replace function public.get_random_homepage_quote()
returns table(text text,author text,book_title text,published_year text)
language sql volatile security definer set search_path='' as $$
 select q.text,
 case when q.credit_mode='custom' then q.credit_author else coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author') end,
 case when q.credit_mode='custom' then q.credit_source else b.title end,
 case when q.credit_mode='custom' then q.credit_year else left(b.published_date,4) end
 from public.quotes q left join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id left join public.books b on b.id=ub.book_id
 order by random() limit 1;
$$;

create function public.get_random_library_entry_quote(exclude_quote_id uuid default null)
returns table(quote_id uuid, user_book_id uuid,entry_kind text,entry_title text,text text,author text,book_title text,published_year text)
language sql volatile security invoker set search_path='' as $$
 select q.id,coalesce(q.collection_id,q.user_book_id),case when q.collection_id is null then 'book' else 'collection' end,coalesce(c.name,b.title),q.text,
 case when q.credit_mode='custom' then q.credit_author else coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author') end,
 case when q.credit_mode='custom' then q.credit_source else b.title end,
 case when q.credit_mode='custom' then q.credit_year else left(b.published_date,4) end
 from public.quotes q left join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id left join public.books b on b.id=ub.book_id
 left join public.collections c on c.id=q.collection_id and c.user_id=q.user_id
 where q.user_id=(select auth.uid())
 order by(q.id is not distinct from exclude_quote_id),random() limit 1;
$$;

revoke all on function public.collection_quote_payload(jsonb), public.library_entry_result(text,uuid,boolean) from public,anon,authenticated;
revoke all on function public.get_library_entries(), public.save_collection_quote(jsonb,uuid,text), public.rename_collection(uuid,text), public.delete_library_quote(uuid), public.edit_library_quote(uuid,jsonb), public.move_quote(uuid,text,uuid,text,jsonb), public.get_random_library_entry_quote(uuid) from public,anon,authenticated;
grant execute on function public.get_library_entries(), public.save_collection_quote(jsonb,uuid,text), public.rename_collection(uuid,text), public.delete_library_quote(uuid), public.edit_library_quote(uuid,jsonb), public.move_quote(uuid,text,uuid,text,jsonb), public.get_random_library_entry_quote(uuid) to authenticated;
-- get_random_homepage_quote retains its existing restricted public projection.
