-- Icon choices are private collection presentation, with a compatible default.
alter table public.collections add column icon text not null default 'layers'
 check (icon in ('layers','music','tv','book','speech','paw-print','user','face-grinning','face-slightly-frowning','star','brush'));

create or replace function public.edit_collection(collection_id uuid, collection_name text, appearance jsonb default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 -- Existing rename validates ownership and acquires the shared library lock.
 result := public.rename_collection(collection_id,collection_name);
 if appearance is not null then
   if jsonb_typeof(appearance) is distinct from 'object' then raise exception 'Choose valid collection appearance.'; end if;
   if exists(select 1 from jsonb_each(appearance) e where
     e.key not in ('icon','background_colour','icon_colour','text_colour','border_colour')
     or jsonb_typeof(e.value) is distinct from 'string'
     or (e.key='icon' and (e.value #>> '{}') not in ('layers','music','tv','book','speech','paw-print','user','face-grinning','face-slightly-frowning','star','brush'))
     or (e.key<>'icon' and (e.value #>> '{}') !~ '^#[0-9a-fA-F]{6}$')
   ) then raise exception 'Choose valid collection appearance.'; end if;
   update public.collections c set
     icon=coalesce(appearance->>'icon',c.icon),
     background_colour=coalesce(appearance->>'background_colour',c.background_colour),
     icon_colour=coalesce(appearance->>'icon_colour',c.icon_colour),
     text_colour=coalesce(appearance->>'text_colour',c.text_colour),
     border_colour=coalesce(appearance->>'border_colour',c.border_colour)
   where c.id=collection_id and c.user_id=auth.uid();
 end if;
 return public.library_entry_result('collection',collection_id);
end $$;
-- Preserve the existing authenticated-only execute grant and wrapper signatures.
