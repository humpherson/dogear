-- Deliberately public editorial samples. Personal quotes and notes remain private.
create table public.sample_quotes (
 id uuid primary key default gen_random_uuid(),
 text text not null check (char_length(btrim(text)) between 1 and 1000),
 author text not null check (char_length(btrim(author)) between 1 and 200),
 book_title text not null check (char_length(btrim(book_title)) between 1 and 500),
 published_year text check (published_year ~ '^[0-9]{4}$'),
 created_at timestamptz not null default now()
);
alter table public.sample_quotes enable row level security;
revoke all on public.sample_quotes from anon, authenticated;
grant select on public.sample_quotes to anon, authenticated;
create policy public_sample_read on public.sample_quotes for select to anon, authenticated using (true);

-- Sampling is fresh on each call; no privileged access to any personal table.
create function public.get_random_sample_quote()
returns setof public.sample_quotes
language sql volatile security invoker set search_path = '' as $$
 select sample.* from public.sample_quotes sample order by pg_catalog.random() limit 1;
$$;
revoke all on function public.get_random_sample_quote() from public, anon, authenticated;
grant execute on function public.get_random_sample_quote() to anon, authenticated;

-- Public-domain excerpts, checked against the original works at Project Gutenberg:
-- https://www.gutenberg.org/ebooks/1342 (chapter XI)
-- https://www.gutenberg.org/ebooks/844 (act I)
-- https://www.gutenberg.org/ebooks/11 (chapter II)
insert into public.sample_quotes(id,text,author,book_title,published_year) values
 ('3d9c4b32-4c71-4e60-9b8b-733fb544b1a1', 'I declare after all there is no enjoyment like reading!', 'Jane Austen', 'Pride and Prejudice', '1813'),
 ('3d9c4b32-4c71-4e60-9b8b-733fb544b1a2', 'The truth is rarely pure and never simple.', 'Oscar Wilde', 'The Importance of Being Earnest', '1895'),
 ('3d9c4b32-4c71-4e60-9b8b-733fb544b1a3', 'Who in the world am I? Ah, that''s the great puzzle!', 'Lewis Carroll', 'Alice''s Adventures in Wonderland', '1865');
