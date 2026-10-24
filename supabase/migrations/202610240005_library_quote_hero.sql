-- Owner-only sampling for the signed-in library, independent of public sampling.
create function public.get_random_library_quote(exclude_quote_id uuid default null)
returns table(quote_id uuid, user_book_id uuid, text text, author text, book_title text, published_year text)
language sql volatile security invoker set search_path = '' as $$
 select q.id, q.user_book_id, q.text,
        coalesce(nullif(pg_catalog.array_to_string(b.authors, ', '), ''), 'Unknown author') as author,
        b.title as book_title,
        pg_catalog.left(b.published_date, 4) as published_year
 from public.quotes q
 join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id
 join public.books b on b.id=ub.book_id
 where q.user_id=(select auth.uid())
 -- Prefer another quote; a single-quote library safely returns its only quote.
 order by (q.id is not distinct from exclude_quote_id), pg_catalog.random()
 limit 1;
$$;
revoke all on function public.get_random_library_quote(uuid) from public, anon, authenticated;
grant execute on function public.get_random_library_quote(uuid) to authenticated;
