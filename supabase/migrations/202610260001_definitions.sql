-- Add definitions without renaming or replacing existing saved quotation rows.
alter table public.quotes
 add column item_type text not null default 'quote' check (item_type in ('quote','definition')),
 add column term text,
 add column lookup_attribution jsonb,
 add constraint saved_item_shape check (
   (item_type='quote' and term is null and lookup_attribution is null)
   or (item_type='definition' and term is not null and char_length(btrim(term,E' \t\r\n')) between 1 and 120 and term !~ E'[\r\n]')
 );

create function public.saved_item_payload(input jsonb, original jsonb default '{}'::jsonb) returns jsonb
language plpgsql set search_path='' as $$
declare words text; kind text; label text; attribution jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'text') is distinct from 'string' then raise exception 'Enter the words you want to keep.'; end if;
 if input ? 'item_type' and jsonb_typeof(input->'item_type') is distinct from 'string' then raise exception 'Invalid saved item type.'; end if;
 kind:=coalesce(input->>'item_type',original->>'item_type','quote');
 if kind not in ('quote','definition') or (original ? 'item_type' and kind is distinct from original->>'item_type') then raise exception 'The saved item type cannot change.'; end if;
 words:=btrim(input->>'text',E' \t\r\n');
 if char_length(words) not between 1 and 10000 then raise exception 'Use between 1 and 10000 characters.'; end if;
 if exists(select 1 from jsonb_each(input) e where e.key in ('note','page_number','credit_author','credit_source','term') and jsonb_typeof(e.value) not in ('string','null')) then raise exception 'Invalid saved item fields.'; end if;
 if char_length(input->>'note')>5000 or char_length(input->>'page_number')>100 or char_length(input->>'credit_author')>10000 or char_length(input->>'credit_source')>1000 then raise exception 'Saved item details are too long.'; end if;
 label:=case when input ? 'term' then nullif(btrim(input->>'term',E' \t\r\n'),'') else original->>'term' end;
 attribution:=case when input ? 'lookup_attribution' then nullif(input->'lookup_attribution','null'::jsonb) else nullif(original->'lookup_attribution','null'::jsonb) end;
 if kind='quote' and (label is not null or attribution is not null) then raise exception 'Quotes cannot contain definition fields.'; end if;
 if kind='definition' and (label is null or char_length(label)>120 or label ~ E'[\r\n]') then raise exception 'Enter a word or short phrase of up to 120 characters.'; end if;
 if attribution is not null then
   if jsonb_typeof(attribution) is distinct from 'object' or char_length(attribution::text)>16000 or attribution->>'provider' is distinct from 'free-dictionary-api'
   or exists(select 1 from jsonb_each(attribution) e where e.key not in ('provider','source_urls','license_name','license_url'))
   or jsonb_typeof(attribution->'source_urls') is distinct from 'array' then raise exception 'Invalid dictionary attribution.'; end if;
   if jsonb_array_length(attribution->'source_urls')>5 or exists(select 1 from jsonb_array_elements(attribution->'source_urls') u where jsonb_typeof(u)<>'string' or char_length(u #>> '{}')>2048 or (u #>> '{}') !~ '^https://[^[:space:]]+$') then raise exception 'Invalid dictionary sources.'; end if;
   if (attribution ? 'license_name' and (jsonb_typeof(attribution->'license_name') is distinct from 'string' or char_length(attribution->>'license_name')>120))
   or (attribution ? 'license_url' and (jsonb_typeof(attribution->'license_url') is distinct from 'string' or char_length(attribution->>'license_url')>2048 or attribution->>'license_url' !~ '^https://[^[:space:]]+$')) then raise exception 'Invalid dictionary licence.'; end if;
 end if;
 return jsonb_build_object('text',words,'item_type',kind,'term',label,'lookup_attribution',attribution,
 'note',nullif(btrim(input->>'note'),''),'page_number',nullif(btrim(input->>'page_number'),''),
 'credit_author',case when kind='definition' then null else nullif(btrim(input->>'credit_author'),'') end,'credit_source',nullif(btrim(input->>'credit_source'),''));
end $$;
revoke all on function public.saved_item_payload(jsonb,jsonb) from public,anon,authenticated;

create or replace function public.collection_quote_payload(input jsonb) returns jsonb
language sql set search_path='' as $$ select public.saved_item_payload(input); $$;

create function public.keep_saved_item_type() returns trigger language plpgsql set search_path='' as $$
begin
 if new.item_type is distinct from old.item_type then raise exception 'The saved item type cannot change.'; end if;
 return new;
end $$;
revoke all on function public.keep_saved_item_type() from public,anon,authenticated;
create trigger saved_item_type_immutable before update on public.quotes for each row execute function public.keep_saved_item_type();

create or replace function public.library_entry_result(entry_kind text, entry_id uuid, summary_only boolean default false) returns jsonb
language sql stable security definer set search_path='' as $$
 with counts as (
 select count(*) as total,count(*) filter(where q.item_type='quote') as quote,count(*) filter(where q.item_type='definition') as definition
 from public.quotes q where q.user_id=auth.uid() and (case when entry_kind='collection' then q.collection_id=entry_id else q.user_book_id=entry_id end)
 ), totals as (select jsonb_build_object('total',total,'quote',quote,'definition',definition) as value,total from counts)
 select case when entry_kind='collection' then
 (select to_jsonb(c)||jsonb_build_object('kind','collection','item_counts',t.value,'quotes',jsonb_build_array(jsonb_build_object('count',t.total))) from public.collections c cross join totals t where c.id=entry_id and c.user_id=auth.uid())
 else (select to_jsonb(ub)||jsonb_build_object('kind','book','item_counts',t.value,'books',case when summary_only then jsonb_build_object('id',b.id,'source',b.source,'source_id',b.source_id,'title',b.title,'authors',b.authors,'published_date',b.published_date,'cover_url',b.cover_url) else to_jsonb(b) end,'quotes',jsonb_build_array(jsonb_build_object('count',t.total))) from public.user_books ub join public.books b on b.id=ub.book_id cross join totals t where ub.id=entry_id and ub.user_id=auth.uid()) end;
$$;

create function public.get_library_entry(entry_kind text, entry_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if entry_kind is null or entry_kind not in ('book','collection') then raise exception 'Invalid entry kind.'; end if;
 return public.library_entry_result(entry_kind,entry_id);
end $$;
revoke all on function public.get_library_entry(text,uuid) from public,anon,authenticated;
grant execute on function public.get_library_entry(text,uuid) to authenticated;

create or replace function public.save_quote_with_book(book jsonb, quote jsonb)
returns table(quote_id uuid, user_book_id uuid)
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); catalog_id uuid; library_id uuid; saved_id uuid; author_list text[]; quote_text text; payload jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':library',0));
 if jsonb_typeof(book) is distinct from 'object' or jsonb_typeof(quote) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if book->>'source' is null or book->>'source' not in ('open_library','google_books') then raise exception 'Unsupported book source'; end if;
 if book->>'source' = 'open_library' and (book->>'source_id' is null or book->>'source_id' !~ '^OL[0-9]+W$') then raise exception 'Invalid Open Library work identifier'; end if;
 if jsonb_typeof(book->'authors') is distinct from 'array' or jsonb_array_length(book->'authors') > 30 then raise exception 'Invalid authors'; end if;
 if exists(select 1 from jsonb_array_elements(book->'authors') a where jsonb_typeof(a) <> 'string' or char_length(a #>> '{}') > 300) then raise exception 'Invalid author'; end if;
 select coalesce(array_agg(btrim(value)), '{}') into author_list from jsonb_array_elements_text(book->'authors');
 payload := public.saved_item_payload(quote);
 quote_text := payload->>'text';
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
 insert into public.quotes(user_id,user_book_id,text,page_number,note,item_type,term,lookup_attribution,credit_mode,credit_source)
 values(caller,library_id,quote_text,payload->>'page_number',payload->>'note',payload->>'item_type',payload->>'term',nullif(payload->'lookup_attribution','null'::jsonb),case when payload->>'item_type'='definition' then 'custom' else 'book' end,case when payload->>'item_type'='definition' then payload->>'credit_source' else null end) returning id into saved_id;
 return query select saved_id,library_id;
end $$;

create or replace function public.save_collection_quote(quote jsonb, collection_id uuid default null, collection_name text default null)
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
 insert into public.quotes(user_id,collection_id,text,note,page_number,credit_mode,credit_author,credit_source,item_type,term,lookup_attribution)
 values(caller,target,payload->>'text',payload->>'note',payload->>'page_number','custom',payload->>'credit_author',payload->>'credit_source',payload->>'item_type',payload->>'term',nullif(payload->'lookup_attribution','null'::jsonb)) returning * into saved;
 return query select to_jsonb(saved),public.library_entry_result('collection',target);
end $$;

create or replace function public.edit_library_quote(quote_id uuid, quote jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare caller uuid:=auth.uid(); original public.quotes; changed public.quotes; payload jsonb;
begin
 if caller is null then raise exception 'Authentication required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text||':library',0));
 select * into original from public.quotes q where q.id=quote_id and q.user_id=caller;
 if original.id is null then raise exception 'Quote not found' using errcode='P0002'; end if;
 payload:=public.saved_item_payload(quote,to_jsonb(original));
 update public.quotes q set term=payload->>'term',lookup_attribution=nullif(payload->'lookup_attribution','null'::jsonb),text=payload->>'text',note=payload->>'note',page_number=payload->>'page_number',
 credit_author=case when original.item_type='definition' then null when quote ? 'credit_author' then payload->>'credit_author' else original.credit_author end,
 credit_source=case when quote ? 'credit_source' then payload->>'credit_source' else original.credit_source end,
 credit_mode=case when original.item_type='definition' then 'custom' when quote ? 'credit_author' or quote ? 'credit_source' then 'custom' else original.credit_mode end,
 credit_year=case when quote ? 'credit_source' and (payload->>'credit_source') is distinct from original.credit_source then null else original.credit_year end
 where q.id=quote_id and q.user_id=caller returning * into changed;
 return to_jsonb(changed);
end $$;

create or replace function public.move_quote(quote_id uuid,target_kind text,target_id uuid default null,new_collection_name text default null,credits jsonb default null) returns jsonb
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
 if original.item_type='definition' then old_author:=null; old_source:=original.credit_source; old_year:=null;
 elsif original.credit_mode='book' then
   select coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author'),b.title,left(b.published_date,4) into old_author,old_source,old_year
   from public.user_books ub join public.books b on b.id=ub.book_id where ub.id=original.user_book_id and ub.user_id=caller;
 else old_author:=original.credit_author; old_source:=original.credit_source; old_year:=original.credit_year; end if;
 if credits is not null then
   perform public.collection_quote_payload(jsonb_build_object('text',original.text)||credits);
   if (nullif(btrim(credits->>'credit_source'),'')) is distinct from old_source then old_year:=null; end if;
   old_author:=case when original.item_type='definition' then null else nullif(btrim(credits->>'credit_author'),'') end; old_source:=nullif(btrim(credits->>'credit_source'),'');
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

create or replace function public.save_quote_with_book_result(book jsonb, quote jsonb)
returns table(quote_record jsonb, library_entry jsonb)
language plpgsql security definer set search_path='' as $$
declare saved_id uuid; parent_id uuid;
begin
 select s.quote_id,s.user_book_id into saved_id,parent_id from public.save_quote_with_book(book,quote) s;
 return query select to_jsonb(q),public.library_entry_result('book',parent_id) from public.quotes q where q.id=saved_id and q.user_id=auth.uid();
end $$;

create function public.delete_library_item(item_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result record;
begin
 select * into result from public.delete_library_quote(item_id);
 return to_jsonb(result)||jsonb_build_object('library_entry',public.library_entry_result(case when result.collection_id is not null then 'collection' else 'book' end,coalesce(result.collection_id,result.user_book_id)));
end $$;
revoke all on function public.delete_library_item(uuid) from public,anon,authenticated;
grant execute on function public.delete_library_item(uuid) to authenticated;

create function public.get_random_library_item(exclude_item_id uuid default null) returns jsonb
language sql volatile security invoker set search_path='' as $$
 select jsonb_build_object('quote_id',q.id,'user_book_id',coalesce(q.collection_id,q.user_book_id),'entry_kind',case when q.collection_id is null then 'book' else 'collection' end,'entry_title',coalesce(c.name,b.title),
 'item_type',q.item_type,'term',q.term,'lookup_attribution',q.lookup_attribution,'text',q.text,
 'author',case when q.item_type='definition' then null when q.credit_mode='custom' then q.credit_author else coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author') end,
 'book_title',case when q.credit_mode='custom' then q.credit_source else b.title end,'published_year',case when q.credit_mode='custom' then q.credit_year else left(b.published_date,4) end)
 from public.quotes q left join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id left join public.books b on b.id=ub.book_id
 left join public.collections c on c.id=q.collection_id and c.user_id=q.user_id
 where q.user_id=(select auth.uid())
 order by(q.id is not distinct from exclude_item_id),random() limit 1;
$$;
revoke all on function public.get_random_library_item(uuid) from public,anon,authenticated;
grant execute on function public.get_random_library_item(uuid) to authenticated;

create or replace function public.get_random_library_entry_quote(exclude_quote_id uuid default null)
returns table(quote_id uuid, user_book_id uuid,entry_kind text,entry_title text,text text,author text,book_title text,published_year text)
language sql volatile security invoker set search_path='' as $$
 select q.id,coalesce(q.collection_id,q.user_book_id),case when q.collection_id is null then 'book' else 'collection' end,coalesce(c.name,b.title),q.text,
 case when q.credit_mode='custom' then q.credit_author else coalesce(nullif(array_to_string(b.authors,', '),''),'Unknown author') end,
 case when q.credit_mode='custom' then q.credit_source else b.title end,
 case when q.credit_mode='custom' then q.credit_year else left(b.published_date,4) end
 from public.quotes q left join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id left join public.books b on b.id=ub.book_id
 left join public.collections c on c.id=q.collection_id and c.user_id=q.user_id
 where q.item_type='quote' and q.user_id=(select auth.uid())
 order by(q.id is not distinct from exclude_quote_id),random() limit 1;
$$;

create or replace function public.get_random_library_quote(exclude_quote_id uuid default null)
returns table(quote_id uuid, user_book_id uuid, text text, author text, book_title text, published_year text)
language sql volatile security invoker set search_path = '' as $$
 select q.id, q.user_book_id, q.text,
        coalesce(nullif(pg_catalog.array_to_string(b.authors, ', '), ''), 'Unknown author') as author,
        b.title as book_title,
        pg_catalog.left(b.published_date, 4) as published_year
 from public.quotes q
 join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id
 join public.books b on b.id=ub.book_id
 where q.item_type='quote' and q.user_id=(select auth.uid())
 -- Prefer another quote; a single-quote library safely returns its only quote.
 order by (q.id is not distinct from exclude_quote_id), pg_catalog.random()
 limit 1;
$$;

notify pgrst, 'reload schema';
