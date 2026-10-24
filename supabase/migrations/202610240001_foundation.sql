-- All client writes are ownership checked; catalog and library lifecycle writes use RPCs.
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text check (char_length(display_name) <= 100),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.books (
 id uuid primary key default gen_random_uuid(),
 source text not null check (source = 'google_books'),
 source_id text not null check (source_id ~ '^[A-Za-z0-9_-]{1,128}$'),
 title text not null check (char_length(btrim(title)) between 1 and 1000),
 authors text[] not null default '{}',
 description text check (char_length(description) <= 20000),
 published_date text check (published_date ~ '^\d{4}(-\d{2})?(-\d{2})?$'),
 cover_url text check (char_length(cover_url) <= 2048 and cover_url ~ '^https://[A-Za-z0-9.-]+(:443)?(/[^[:space:]]*)?$'),
 isbn_10 text check (isbn_10 ~ '^[0-9Xx]{10}$'), isbn_13 text check (isbn_13 ~ '^[0-9]{13}$'),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(source, source_id)
);
create table public.user_books (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 book_id uuid not null references public.books(id), created_at timestamptz not null default now(),
 unique(user_id, book_id), unique(id, user_id)
);
create table public.quotes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 user_book_id uuid not null,
 text text not null check (char_length(text) between 1 and 10000 and text = btrim(text) and text ~ '[^[:space:]]'),
 page_number text check (char_length(page_number) <= 100), note text check (char_length(note) <= 5000),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key (user_book_id, user_id) references public.user_books(id,user_id) on delete cascade
);
create index quotes_parent on public.quotes(user_book_id);
create index quotes_owner on public.quotes(user_id);
create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;
create trigger profiles_timestamp before update on public.profiles for each row execute function public.touch_updated_at();
create trigger books_timestamp before update on public.books for each row execute function public.touch_updated_at();
create trigger quotes_timestamp before update on public.quotes for each row execute function public.touch_updated_at();
create function public.provision_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id) values(new.id) on conflict do nothing; return new; end $$;
create trigger provision_profile after insert on auth.users for each row execute function public.provision_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.books enable row level security;
alter table public.user_books enable row level security;
alter table public.quotes enable row level security;
create policy own_profile_read on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy own_profile_update on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy catalog_read on public.books for select to authenticated using (true);
create policy own_library_read on public.user_books for select to authenticated using ((select auth.uid()) = user_id);
create policy own_quotes_read on public.quotes for select to authenticated using ((select auth.uid()) = user_id);
create policy own_quotes_update on public.quotes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.profiles, public.books, public.user_books, public.quotes from anon, authenticated;
grant select on public.profiles, public.books, public.user_books, public.quotes to authenticated;
grant update(display_name) on public.profiles to authenticated;
grant update(text,page_number,note) on public.quotes to authenticated;

create function public.save_quote_with_book(book jsonb, quote jsonb)
returns table(quote_id uuid, user_book_id uuid)
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); catalog_id uuid; library_id uuid; saved_id uuid; author_list text[]; quote_text text;
begin
 if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 if jsonb_typeof(book) is distinct from 'object' or jsonb_typeof(quote) is distinct from 'object' then raise exception 'Invalid input'; end if;
 if book->>'source' is distinct from 'google_books' then raise exception 'Unsupported book source'; end if;
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
 values ('google_books',book->>'source_id',btrim(book->>'title'),author_list,regexp_replace(book->>'description','<[^>]*>','','g'),book->>'published_date',book->>'cover_url',book->>'isbn_10',book->>'isbn_13')
 on conflict(source,source_id) do nothing;
 select b.id into catalog_id from public.books b where b.source='google_books' and b.source_id=book->>'source_id';
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || catalog_id::text,0));
 insert into public.user_books(user_id,book_id) values(caller,catalog_id) on conflict(user_id,book_id) do nothing;
 select ub.id into library_id from public.user_books ub where ub.user_id=caller and ub.book_id=catalog_id;
 insert into public.quotes(user_id,user_book_id,text,page_number,note)
 values(caller,library_id,quote_text,nullif(btrim(quote->>'page_number'),''),nullif(btrim(quote->>'note'),'')) returning id into saved_id;
 return query select saved_id,library_id;
end $$;

create function public.delete_quote(quote_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); catalog_id uuid; library_id uuid;
begin
 if caller is null then raise exception 'Authentication required' using errcode = '42501'; end if;
 select ub.book_id, ub.id into catalog_id,library_id from public.quotes q join public.user_books ub on ub.id=q.user_book_id where q.id=quote_id and q.user_id=caller;
 if library_id is null then raise exception 'Quote not found' using errcode = 'P0002'; end if;
 perform pg_advisory_xact_lock(hashtextextended(caller::text || ':' || catalog_id::text,0));
 delete from public.quotes q where q.id=quote_id and q.user_id=caller;
 delete from public.user_books ub where ub.id=library_id and ub.user_id=caller and not exists(select 1 from public.quotes q where q.user_book_id=library_id);
end $$;
revoke all on function public.save_quote_with_book(jsonb,jsonb), public.delete_quote(uuid), public.provision_profile(), public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.save_quote_with_book(jsonb,jsonb), public.delete_quote(uuid) to authenticated;
