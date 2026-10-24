-- Appearance belongs to private collections, never to public quote attribution.
alter table public.collections
 add column background_colour text not null default '#f5f0e6' check (background_colour ~ '^#[0-9a-fA-F]{6}$'),
 add column icon_colour text not null default '#203b35' check (icon_colour ~ '^#[0-9a-fA-F]{6}$'),
 add column text_colour text not null default '#203b35' check (text_colour ~ '^#[0-9a-fA-F]{6}$'),
 add column border_colour text not null default '#96713d' check (border_colour ~ '^#[0-9a-fA-F]{6}$');

create function public.edit_collection(collection_id uuid, collection_name text, appearance jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Rename performs authentication, ownership, validation and the shared library lock.
 result := public.rename_collection(collection_id,collection_name);
 if appearance is not null then
   if jsonb_typeof(appearance) is distinct from 'object' or exists(
     select 1 from jsonb_each(appearance) e where e.key not in ('background_colour','icon_colour','text_colour','border_colour')
       or jsonb_typeof(e.value) is distinct from 'string' or (e.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$'
   ) then raise exception 'Choose valid collection colours.'; end if;
   update public.collections c set
     background_colour=coalesce(appearance->>'background_colour',c.background_colour),
     icon_colour=coalesce(appearance->>'icon_colour',c.icon_colour),
     text_colour=coalesce(appearance->>'text_colour',c.text_colour),
     border_colour=coalesce(appearance->>'border_colour',c.border_colour)
   where c.id=collection_id and c.user_id=auth.uid();
 end if;
 return public.library_entry_result('collection',collection_id);
end $$;

create function public.save_styled_collection_quote(quote jsonb, collection_id uuid default null, collection_name text default null, appearance jsonb default null)
returns table(quote_record jsonb,library_entry jsonb)
language plpgsql security definer set search_path='' as $$
declare saved record; entry jsonb;
begin
 if collection_id is not null and appearance is not null then raise exception 'Edit existing collection colours from its collection page.'; end if;
 select * into saved from public.save_collection_quote(quote,collection_id,collection_name);
 entry:=saved.library_entry;
 if appearance is not null then entry:=public.edit_collection((entry->>'id')::uuid,entry->>'name',appearance); end if;
 return query select saved.quote_record,entry;
end $$;

create function public.move_quote_with_appearance(quote_id uuid,target_kind text,target_id uuid default null,new_collection_name text default null,credits jsonb default null,appearance jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; entry jsonb;
begin
 if appearance is not null and (target_kind is distinct from 'collection' or target_id is not null or new_collection_name is null) then raise exception 'Only new collections accept colours when moving.'; end if;
 result:=public.move_quote(quote_id,target_kind,target_id,new_collection_name,credits);
 if appearance is not null then
   entry:=result->'destination_entry';
   entry:=public.edit_collection((entry->>'id')::uuid,entry->>'name',appearance);
   result:=jsonb_set(result,'{destination_entry}',entry);
 end if;
 return result;
end $$;
revoke all on function public.edit_collection(uuid,text,jsonb),public.save_styled_collection_quote(jsonb,uuid,text,jsonb),public.move_quote_with_appearance(uuid,text,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.edit_collection(uuid,text,jsonb),public.save_styled_collection_quote(jsonb,uuid,text,jsonb),public.move_quote_with_appearance(uuid,text,uuid,text,jsonb,jsonb) to authenticated;
