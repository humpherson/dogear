-- Re-enable Google Books discovery alongside Open Library. Preserve caller
-- ownership, canonical metadata, validation and shared transaction lock order.
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


-- CREATE OR REPLACE retains the existing authenticated-only execution grant.
