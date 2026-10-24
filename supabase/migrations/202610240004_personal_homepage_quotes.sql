-- All user-added quote text is eligible for the public homepage, as requested.
-- Replace the unused editorial pool; never copy or publish notes/account data.
drop function public.get_random_sample_quote();
drop table public.sample_quotes;

create function public.get_random_homepage_quote()
returns table(text text, author text, book_title text, published_year text)
language sql volatile security definer set search_path = '' as $$
 select q.text,
        coalesce(nullif(pg_catalog.array_to_string(b.authors, ', '), ''), 'Unknown author') as author,
        b.title as book_title,
        pg_catalog.left(b.published_date, 4) as published_year
 from public.quotes q
 join public.user_books ub on ub.id=q.user_book_id and ub.user_id=q.user_id
 join public.books b on b.id=ub.book_id
 order by pg_catalog.random()
 limit 1;
$$;
revoke all on function public.get_random_homepage_quote() from public, anon, authenticated;
grant execute on function public.get_random_homepage_quote() to anon, authenticated;
-- Existing table privileges and RLS stay unchanged: no anonymous direct quote,
-- note, profile, or library access. Only this four-field read-only projection is public.
