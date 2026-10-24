-- Add canonical mutation results without changing the existing RPC contracts.
-- The original RPCs retain validation, ownership checks and transaction locks.
create function public.save_quote_with_book_result(book jsonb, quote jsonb)
returns table(quote_record jsonb, library_entry jsonb)
language plpgsql security invoker set search_path = '' as $$
declare saved_id uuid; library_id uuid;
begin
 select s.quote_id, s.user_book_id into saved_id, library_id
 from public.save_quote_with_book(book, quote) s;
 return query
 select to_jsonb(q), to_jsonb(ub) || jsonb_build_object(
   'books', to_jsonb(b),
   'quotes', jsonb_build_array(jsonb_build_object('count',
     (select count(*) from public.quotes own where own.user_book_id = ub.id and own.user_id = auth.uid())))
 )
 from public.quotes q
 join public.user_books ub on ub.id = q.user_book_id and ub.user_id = q.user_id
 join public.books b on b.id = ub.book_id
 where q.id = saved_id and ub.id = library_id and q.user_id = auth.uid();
end $$;

create function public.delete_quote_result(quote_id uuid)
returns table(user_book_id uuid, remaining_count bigint)
language plpgsql security invoker set search_path = '' as $$
declare library_id uuid;
begin
 select q.user_book_id into library_id from public.quotes q
 where q.id = quote_id and q.user_id = auth.uid();
 -- The existing function rejects missing or foreign quotes and takes the lock.
 perform public.delete_quote(quote_id);
 return query select library_id, count(*) from public.quotes q
 where q.user_book_id = library_id and q.user_id = auth.uid();
end $$;

revoke all on function public.save_quote_with_book_result(jsonb,jsonb), public.delete_quote_result(uuid) from public, anon, authenticated;
grant execute on function public.save_quote_with_book_result(jsonb,jsonb), public.delete_quote_result(uuid) to authenticated;
