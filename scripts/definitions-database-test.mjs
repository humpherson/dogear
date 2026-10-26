import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
  }),
);
assert.match(local.API_URL, /^http:\/\/(localhost|127\.0\.0\.1):/);
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anonymous = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false },
});
const users = [],
  sources = [];
let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log(`PASS ${label}`);
}
async function rpc(client, name, args = {}) {
  const result = await client.rpc(name, args);
  assert.ifError(result.error);
  return result.data;
}
async function account() {
  const email = `definitions-${randomUUID()}@example.test`,
    password = 'Definitions-local-123';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  users.push(data.user.id);
  const client = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  assert.ifError(
    (await client.auth.signInWithPassword({ email, password })).error,
  );
  return { client, id: data.user.id };
}
const attribution = {
  provider: 'free-dictionary-api',
  source_urls: ['https://en.wiktionary.org/wiki/serendipity'],
  license_name: 'CC BY-SA 3.0',
  license_url: 'https://creativecommons.org/licenses/by-sa/3.0/',
};
const definition = {
  item_type: 'definition',
  term: 'serendipity',
  text: 'An unexpected fortunate discovery.',
  lookup_attribution: attribution,
};
try {
  const a = await account(),
    b = await account();
  const source = `OL${Date.now()}71W`;
  sources.push(source);
  const book = {
    source: 'open_library',
    source_id: source,
    title: 'Definition context',
    authors: ['Not the dictionary author'],
  };
  const saved = (
    await rpc(a.client, 'save_quote_with_book_result', {
      book,
      quote: definition,
    })
  )[0];
  const id = saved.quote_record.id,
    parent = saved.library_entry.id;
  check(
    saved.quote_record.item_type === 'definition' &&
      saved.quote_record.term === definition.term,
    'book definition has typed fields',
  );
  check(
    saved.library_entry.item_counts.definition === 1 &&
      saved.library_entry.item_counts.quote === 0,
    'first definition creates a counted book association',
  );
  check(
    saved.quote_record.credit_mode === 'custom' &&
      !saved.quote_record.credit_author,
    'definition is not credited to book author',
  );
  const hero = await rpc(a.client, 'get_random_library_item');
  check(
    hero.item_type === 'definition' &&
      hero.term === definition.term &&
      !hero.author,
    'mixed sampler renders a definition without false author',
  );
  check(
    (await rpc(a.client, 'get_random_library_entry_quote')).length === 0,
    'legacy sampler excludes definitions',
  );
  check(
    (await rpc(a.client, 'get_random_library_quote')).length === 0,
    'legacy book sampler excludes definitions',
  );
  check(
    (await rpc(b.client, 'get_random_library_item')) === null,
    'other account cannot sample a definition',
  );
  const q = (
    await rpc(a.client, 'save_quote_with_book_result', {
      book,
      quote: { text: 'A legacy quotation.' },
    })
  )[0];
  check(
    q.quote_record.item_type === 'quote',
    'legacy creation defaults to quote',
  );
  check(
    q.library_entry.id === parent &&
      q.library_entry.item_counts.total === 2 &&
      q.library_entry.item_counts.definition === 1,
    'mixed content shares one parent with accurate counts',
  );
  const entry = await rpc(a.client, 'get_library_entry', {
    entry_kind: 'book',
    entry_id: parent,
  });
  check(
    entry.item_counts.quote === 1 && entry.item_counts.definition === 1,
    'detail RPC returns compact typed counts',
  );
  check(
    (await rpc(b.client, 'get_library_entry', {
      entry_kind: 'book',
      entry_id: parent,
    })) === null,
    'cross-user parent detail denied',
  );
  const projection = await b.client.from('quotes').select('*').eq('id', id);
  check(
    !projection.error && projection.data.length === 0,
    'cross-user definition rows hidden',
  );
  for (const [name, args] of [
    ['get_library_entry', { entry_kind: 'book', entry_id: parent }],
    ['get_random_library_item', {}],
    ['delete_library_item', { item_id: id }],
  ])
    check((await anonymous.rpc(name, args)).error, `anonymous ${name} denied`);
  for (const [name, args] of [
    [
      'edit_library_quote',
      { quote_id: id, quote: { ...definition, text: 'Stolen' } },
    ],
    ['delete_library_item', { item_id: id }],
    [
      'move_quote',
      {
        quote_id: id,
        target_kind: 'collection',
        new_collection_name: 'Stolen',
      },
    ],
  ])
    check((await b.client.rpc(name, args)).error, `cross-user ${name} denied`);
  check(
    (
      await a.client.rpc('edit_library_quote', {
        quote_id: id,
        quote: { text: 'Changed', item_type: 'quote' },
      })
    ).error,
    'saved type conversion rejected',
  );
  const edited = await rpc(a.client, 'edit_library_quote', {
    quote_id: id,
    quote: {
      text: 'A lucky unexpected discovery.',
      note: 'A private definition note',
    },
  });
  check(
    edited.item_type === 'definition' &&
      edited.term === definition.term &&
      edited.lookup_attribution.provider === attribution.provider,
    'legacy edit preserves definition identity and attribution',
  );
  const renamed = await rpc(a.client, 'edit_library_quote', {
    quote_id: id,
    quote: {
      ...definition,
      term: 'déjà vu',
      text: 'A feeling of prior experience.',
    },
  });
  check(renamed.term === 'déjà vu', 'phrases and accented terms can be edited');
  for (const invalid of [
    { ...definition, term: '' },
    { ...definition, term: 'x'.repeat(121) },
    { ...definition, text: ' ' },
    { ...definition, term: 'two\nlines' },
    { ...definition, item_type: 'other' },
    { ...definition, item_type: null },
    { text: 'Quote', term: 'not allowed' },
    {
      ...definition,
      lookup_attribution: {
        ...attribution,
        license_url: 'javascript:alert(1)',
      },
    },
    {
      ...definition,
      lookup_attribution: { ...attribution, source_urls: [42] },
    },
  ]) {
    check(
      (
        await a.client.rpc('save_quote_with_book_result', {
          book,
          quote: invalid,
        })
      ).error,
      'invalid typed payload rejected',
    );
  }
  const repeat = (
    await rpc(a.client, 'save_quote_with_book_result', {
      book,
      quote: definition,
    })
  )[0];
  check(
    repeat.library_entry.item_counts.definition === 2,
    'multiple definitions of the same term are allowed',
  );
  await rpc(a.client, 'delete_library_item', {
    item_id: repeat.quote_record.id,
  });
  const deleted = await rpc(a.client, 'delete_library_item', {
    item_id: q.quote_record.id,
  });
  check(
    deleted.remaining_count === 1 &&
      deleted.library_entry.item_counts.definition === 1,
    'deleting final quote retains a definition-only parent',
  );
  const moved = await rpc(a.client, 'move_quote_with_appearance', {
    quote_id: id,
    target_kind: 'collection',
    new_collection_name: 'Definitions',
    appearance: { icon: 'book' },
  });
  check(
    moved.quote_record.term === 'déjà vu' &&
      moved.quote_record.lookup_attribution.provider === attribution.provider,
    'moving definition preserves term and dictionary source',
  );
  check(
    moved.source_entry === null &&
      moved.destination_entry.item_counts.definition === 1,
    'last-item move cleans up source and counts destination',
  );
  const collection = moved.destination_entry.id;
  const extra = (
    await rpc(a.client, 'save_styled_collection_quote', {
      collection_id: collection,
      quote: { ...definition, term: 'another meaning' },
    })
  )[0];
  check(
    extra.library_entry.item_counts.definition === 2,
    'existing collection accepts another definition',
  );
  const legacy = await rpc(a.client, 'edit_library_quote', {
    quote_id: extra.quote_record.id,
    quote: { text: 'Legacy edit', note: 'retained definition' },
  });
  check(
    legacy.term === 'another meaning' &&
      legacy.lookup_attribution.provider === attribution.provider,
    'collection definition survives old-client edit',
  );
  const badParent = await b.client.rpc('save_styled_collection_quote', {
    collection_id: collection,
    quote: definition,
  });
  check(badParent.error, 'cross-user definition attachment denied');
  const concurrent = await Promise.all([
    rpc(a.client, 'save_styled_collection_quote', {
      collection_id: collection,
      quote: definition,
    }),
    rpc(a.client, 'delete_library_item', { item_id: extra.quote_record.id }),
  ]);
  check(
    concurrent[0][0].library_entry.id === collection,
    'concurrent definition save and deletion retain parent',
  );
  const rows = await a.client
    .from('quotes')
    .select('id')
    .eq('collection_id', collection);
  assert.ifError(rows.error);
  for (const row of rows.data)
    await rpc(a.client, 'delete_library_item', { item_id: row.id });
  check(
    (await rpc(a.client, 'get_library_entry', {
      entry_kind: 'collection',
      entry_id: collection,
    })) === null,
    'last definition deletion removes empty collection',
  );
  check(
    (await rpc(a.client, 'get_random_library_item')) === null,
    'empty mixed library has no cross-user fallback',
  );
  console.log(`${checks} definition database checks passed.`);
} finally {
  for (const id of users)
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  for (const source of sources)
    assert.ifError(
      (await admin.from('books').delete().eq('source_id', source)).error,
    );
}
