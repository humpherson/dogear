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
const anon = createClient(local.API_URL, local.ANON_KEY, {
  auth: { persistSession: false },
});
const users = [],
  sources = [];
let count = 0;
function check(condition, label) {
  assert.ok(condition, label);
  count++;
  console.log(`PASS ${label}`);
}
async function rpc(client, name, args = {}) {
  const result = await client.rpc(name, args);
  assert.ifError(result.error);
  return result.data;
}
async function account() {
  const email = `collections-${randomUUID()}@example.test`,
    password = 'Collections-test-123';
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
const make = (client, name, text = 'Collection words', credits = {}) =>
  rpc(client, 'save_collection_quote', {
    collection_name: name,
    quote: { text, ...credits },
  }).then((rows) => rows[0]);
const add = (client, id, text = 'Another line') =>
  rpc(client, 'save_collection_quote', {
    collection_id: id,
    quote: { text },
  }).then((rows) => rows[0]);
const book = async (client, title) => {
  const source = `OL${Date.now()}${sources.length}W`;
  sources.push(source);
  return (
    await rpc(client, 'save_quote_with_book_result', {
      book: {
        source: 'open_library',
        source_id: source,
        title,
        authors: ['Original Writer'],
        published_date: '1999',
      },
      quote: {
        text: `From ${title}`,
        note: 'Keep this private',
        page_number: '42',
      },
    })
  )[0];
};
try {
  const a = await account(),
    b = await account();
  const first = await make(a.client, 'Private collection name', 'First\nline', {
    credit_author: 'A Speaker',
    credit_source: 'A Song',
    note: 'Private note',
    page_number: 'chorus',
  });
  const id = first.library_entry.id;
  check(
    first.library_entry.icon === 'layers',
    'collections default to the original layers icon',
  );
  check(
    first.library_entry.kind === 'collection' &&
      first.library_entry.user_id === a.id,
    'collection creation returns owned canonical entry',
  );
  check(
    first.quote_record.user_book_id === null &&
      first.quote_record.collection_id === id,
    'collection quote has exactly one parent',
  );
  check(
    first.quote_record.credit_author === 'A Speaker' &&
      first.quote_record.credit_source === 'A Song',
    'collection credits are stored per quote',
  );
  check(
    first.quote_record.text === 'First\nline',
    'collection text preserves line breaks',
  );
  check(
    !!(
      await a.client.rpc('save_collection_quote', {
        collection_name: ' private COLLECTION name ',
        quote: { text: 'Duplicate' },
      })
    ).error,
    'duplicate collection names are rejected without merging',
  );
  check(
    !!(
      await a.client.rpc('save_collection_quote', {
        collection_name: 'Invalid empty',
        quote: { text: ' ' },
      })
    ).error,
    'blank quote rejected before collection creation',
  );
  check(
    !(
      await a.client
        .from('collections')
        .select('id')
        .eq('name', 'Invalid empty')
    ).data.length,
    'invalid save leaves no empty collection',
  );
  check(
    !!(
      await a.client.rpc('save_collection_quote', {
        collection_name: 'x'.repeat(121),
        quote: { text: 'Too long' },
      })
    ).error,
    'oversized collection names are rejected',
  );
  const second = await add(a.client, id);
  check(
    second.library_entry.quotes[0].count === 2 &&
      second.quote_record.credit_author === null,
    'existing collection accepts an unattributed quote',
  );
  const renamed = await rpc(a.client, 'rename_collection', {
    collection_id: id,
    collection_name: 'Renamed private collection',
  });
  check(
    renamed.id === id && renamed.name === 'Renamed private collection',
    'rename preserves collection identity',
  );
  const originalBook = await book(a.client, 'Original book');
  const original = originalBook.quote_record;
  const into = await rpc(a.client, 'move_quote', {
    quote_id: original.id,
    target_kind: 'collection',
    target_id: id,
  });
  check(
    into.quote_record.id === original.id &&
      into.quote_record.created_at === original.created_at,
    'move preserves quote identity and creation date',
  );
  check(
    into.quote_record.note === original.note &&
      into.quote_record.page_number === original.page_number,
    'move preserves notes and references',
  );
  check(
    into.quote_record.credit_author === 'Original Writer' &&
      into.quote_record.credit_source === 'Original book' &&
      into.quote_record.credit_year === '1999',
    'book-to-collection move snapshots original attribution',
  );
  check(
    into.source_entry === null && into.source_remaining_count === 0,
    'moving last book quote removes its library association',
  );
  check(
    (
      await a.client
        .from('books')
        .select('id')
        .eq('id', originalBook.library_entry.book_id)
    ).data.length === 1,
    'moving last book quote retains shared catalogue metadata',
  );
  const destinationBook = await book(a.client, 'Destination book');
  const out = await rpc(a.client, 'move_quote', {
    quote_id: first.quote_record.id,
    target_kind: 'book',
    target_id: destinationBook.library_entry.id,
    credits: { credit_author: 'New speaker', credit_source: 'New source' },
  });
  check(
    out.quote_record.collection_id === null &&
      out.quote_record.user_book_id === destinationBook.library_entry.id,
    'collection-to-book move changes parent atomically',
  );
  check(
    out.quote_record.credit_source === 'New source',
    'destination book does not replace edited attribution',
  );
  const newCollection = await rpc(a.client, 'move_quote', {
    quote_id: destinationBook.quote_record.id,
    target_kind: 'collection',
    new_collection_name: 'Created during move',
  });
  check(
    newCollection.destination_entry.name === 'Created during move' &&
      newCollection.destination_entry.quotes[0].count === 1,
    'moving can atomically create a collection with its first quote',
  );
  const back = await rpc(a.client, 'move_quote', {
    quote_id: destinationBook.quote_record.id,
    target_kind: 'collection',
    target_id: id,
  });
  check(
    back.source_entry === null,
    'collection-to-collection move cleans up an empty source',
  );
  const edited = await rpc(a.client, 'edit_library_quote', {
    quote_id: original.id,
    quote: {
      text: 'Edited credit',
      note: original.note,
      page_number: original.page_number,
      credit_author: '',
      credit_source: '',
    },
  });
  check(
    edited.credit_author === null &&
      edited.credit_source === null &&
      edited.credit_year === null,
    'explicitly cleared credits stay blank and clear the old year',
  );
  const renamedAgain = await rpc(a.client, 'rename_collection', {
    collection_id: id,
    collection_name: 'Still private',
  });
  check(
    renamedAgain.name === 'Still private' &&
      (
        await a.client
          .from('quotes')
          .select('credit_source')
          .eq('id', original.id)
      ).data[0].credit_source === null,
    'renaming never changes quote credits',
  );
  const foreign = await make(b.client, 'Other account collection');
  check(
    !(await b.client.from('collections').select('id').eq('id', id)).data.length,
    'cross-user collection read denied',
  );
  check(
    !(await b.client.from('quotes').select('id').eq('id', original.id)).data
      .length,
    'cross-user collection quote read denied',
  );
  for (const [name, args] of [
    ['save_collection_quote', { collection_id: id, quote: { text: 'Denied' } }],
    ['rename_collection', { collection_id: id, collection_name: 'Denied' }],
    [
      'edit_library_quote',
      { quote_id: original.id, quote: { text: 'Denied' } },
    ],
    ['delete_library_quote', { quote_id: original.id }],
    [
      'move_quote',
      {
        quote_id: original.id,
        target_kind: 'collection',
        target_id: foreign.library_entry.id,
      },
    ],
    [
      'move_quote',
      {
        quote_id: foreign.quote_record.id,
        target_kind: 'collection',
        target_id: id,
      },
    ],
  ])
    check(
      !!(await b.client.rpc(name, args)).error,
      `${name} rejects cross-user access`,
    );
  check(
    !!(
      await a.client
        .from('collections')
        .insert({ user_id: a.id, name: 'Direct write' })
    ).error,
    'direct collection insertion denied',
  );
  check(
    !!(
      await a.client
        .from('quotes')
        .update({ collection_id: foreign.library_entry.id })
        .eq('id', original.id)
    ).error,
    'direct parent mutation denied',
  );
  check(
    !!(
      await admin.from('quotes').insert({
        user_id: a.id,
        collection_id: foreign.library_entry.id,
        text: 'Wrong owner',
        credit_mode: 'custom',
      })
    ).error,
    'collection composite FK rejects mismatched ownership',
  );
  check(
    !!(await admin.from('quotes').insert({ user_id: a.id, text: 'No parent' }))
      .error,
    'quote without a parent rejected',
  );
  check(
    !!(
      await admin.from('quotes').insert({
        user_id: a.id,
        user_book_id: destinationBook.library_entry.id,
        collection_id: id,
        text: 'Two parents',
        credit_mode: 'custom',
      })
    ).error,
    'quote with two parents rejected',
  );
  for (const [name, args] of [
    ['get_library_entries', {}],
    ['get_random_library_entry_quote', {}],
    [
      'save_collection_quote',
      { collection_name: 'Anon', quote: { text: 'Denied' } },
    ],
    ['rename_collection', { collection_id: id, collection_name: 'Denied' }],
    ['delete_library_quote', { quote_id: original.id }],
    [
      'edit_library_quote',
      { quote_id: original.id, quote: { text: 'Denied' } },
    ],
    [
      'move_quote',
      { quote_id: original.id, target_kind: 'collection', target_id: id },
    ],
  ])
    check(!!(await anon.rpc(name, args)).error, `anonymous ${name} denied`);
  const entries = await rpc(a.client, 'get_library_entries');
  check(
    entries.some((e) => e.kind === 'collection') &&
      entries.some((e) => e.kind === 'book'),
    'unified library contains books and collections',
  );
  check(
    entries.every((e) => e.user_id === a.id),
    'unified library is owner scoped',
  );
  check(
    entries
      .filter((e) => e.kind === 'book')
      .every((e) => !('description' in e.books) && !('isbn_10' in e.books)),
    'unified library keeps compact book summaries',
  );
  const all = await a.client
    .from('quotes')
    .select('id')
    .eq('collection_id', id);
  assert.ifError(all.error);
  for (const item of all.data)
    await rpc(a.client, 'delete_library_quote', { quote_id: item.id });
  check(
    !(await a.client.from('collections').select('id').eq('id', id)).data.length,
    'last quote deletion removes collection',
  );
  const solo = await make(
    a.client,
    'Never public collection name',
    'Unattributed personal thought',
  );
  const hero = (
    await rpc(a.client, 'get_random_library_entry_quote', {
      exclude_quote_id: first.quote_record.id,
    })
  )[0];
  check(
    hero.quote_id === solo.quote_record.id && hero.entry_kind === 'collection',
    'owner hero samples collection quotes',
  );
  check(
    hero.entry_title === 'Never public collection name' &&
      hero.book_title === null &&
      hero.author === null,
    'private hero separates grouping from optional credits',
  );
  const publicRows = await rpc(anon, 'get_random_homepage_quote');
  check(
    JSON.stringify(Object.keys(publicRows[0]).sort()) ===
      JSON.stringify(['author', 'book_title', 'published_year', 'text']),
    'public projection remains exactly four permitted fields',
  );
  check(
    !JSON.stringify(publicRows).includes('Never public collection name') &&
      !JSON.stringify(publicRows).includes('Private note'),
    'public sample excludes collection names and private notes',
  );
  const left = await make(a.client, 'Concurrent left'),
    right = await make(a.client, 'Concurrent right');
  await add(a.client, left.library_entry.id);
  await add(a.client, right.library_entry.id);
  const swaps = await Promise.all([
    a.client.rpc('move_quote', {
      quote_id: left.quote_record.id,
      target_kind: 'collection',
      target_id: right.library_entry.id,
    }),
    a.client.rpc('move_quote', {
      quote_id: right.quote_record.id,
      target_kind: 'collection',
      target_id: left.library_entry.id,
    }),
  ]);
  swaps.forEach((r) => assert.ifError(r.error));
  check(
    swaps.every((r) => r.data.quote_record.id),
    'opposing concurrent moves complete without deadlock',
  );
  const renameRace = await Promise.all([
    a.client.rpc('rename_collection', {
      collection_id: left.library_entry.id,
      collection_name: 'Collision',
    }),
    a.client.rpc('rename_collection', {
      collection_id: right.library_entry.id,
      collection_name: 'COLLISION',
    }),
  ]);
  check(
    renameRace.filter((r) => !!r.error).length === 1,
    'concurrent rename collision preserves uniqueness',
  );
  const race = await make(a.client, 'Last quote race');
  const [removed, saved] = await Promise.all([
    a.client.rpc('delete_library_quote', { quote_id: race.quote_record.id }),
    a.client.rpc('save_collection_quote', {
      collection_id: race.library_entry.id,
      quote: { text: 'Concurrent retained line' },
    }),
  ]);
  assert.ifError(removed.error);
  const remaining = (
    await a.client
      .from('quotes')
      .select('id')
      .eq('collection_id', race.library_entry.id)
  ).data;
  check(
    saved.error ? remaining.length === 0 : remaining.length === 1,
    'last-delete and save race loses no confirmed quote',
  );
  const before = await book(a.client, 'Concurrent book source'),
    target = await make(a.client, 'Concurrent book target');
  const [moved, legacySaved] = await Promise.all([
    a.client.rpc('move_quote', {
      quote_id: before.quote_record.id,
      target_kind: 'collection',
      target_id: target.library_entry.id,
    }),
    a.client.rpc('save_quote_with_book', {
      book: before.library_entry.books,
      quote: { text: 'Legacy concurrent save' },
    }),
  ]);
  assert.ifError(moved.error);
  assert.ifError(legacySaved.error);
  check(
    (
      await a.client
        .from('quotes')
        .select('id')
        .eq('id', legacySaved.data[0].quote_id)
    ).data.length === 1,
    'legacy book saves safely interoperate with moves',
  );
  check(
    !!(
      await a.client.rpc('move_quote', {
        quote_id: solo.quote_record.id,
        target_kind: 'collection',
        new_collection_name: 'Collision',
      })
    ).error,
    'failed move to a duplicate name rolls back',
  );
  check(
    (
      await a.client
        .from('quotes')
        .select('collection_id')
        .eq('id', solo.quote_record.id)
    ).data[0].collection_id === solo.library_entry.id,
    'failed move retains its source and quote',
  );
  const colours = {
    background_colour: '#123456',
    icon_colour: '#456789',
    text_colour: '#ffffff',
    border_colour: '#abcdef',
  };
  const styled = (
    await rpc(a.client, 'save_styled_collection_quote', {
      collection_name: 'Coloured collection',
      quote: { text: 'Coloured words' },
      appearance: colours,
    })
  )[0];
  check(
    Object.entries(colours).every(
      ([key, value]) => styled.library_entry[key] === value,
    ),
    'creation persists collection colours atomically',
  );
  const styledEdited = await rpc(a.client, 'edit_collection', {
    collection_id: styled.library_entry.id,
    collection_name: 'Renamed colours',
    appearance: { background_colour: '#654321' },
  });
  check(
    styledEdited.name === 'Renamed colours' &&
      styledEdited.background_colour === '#654321' &&
      styledEdited.text_colour === '#ffffff',
    'editing saves name and colours while preserving omitted choices',
  );
  check(
    (await rpc(a.client, 'get_library_entries')).some(
      (entry) =>
        entry.id === styledEdited.id && entry.background_colour === '#654321',
    ),
    'unified library returns saved appearance',
  );
  check(
    !!(
      await b.client.rpc('edit_collection', {
        collection_id: styledEdited.id,
        collection_name: 'Stolen',
        appearance: colours,
      })
    ).error,
    'cross-user appearance edits denied',
  );
  for (const appearance of [
    { background_colour: 'red' },
    { text_colour: null },
    { border_colour: 123 },
    { other: '#ffffff' },
  ]) {
    check(
      !!(
        await a.client.rpc('edit_collection', {
          collection_id: styledEdited.id,
          collection_name: 'Invalid rename',
          appearance,
        })
      ).error,
      'invalid appearance rejected',
    );
  }
  check(
    (
      await a.client
        .from('collections')
        .select('name')
        .eq('id', styledEdited.id)
        .single()
    ).data.name === 'Renamed colours',
    'invalid appearance rolls back rename',
  );
  check(
    !!(
      await a.client.rpc('save_styled_collection_quote', {
        collection_name: 'Invalid colours',
        quote: { text: 'Rejected' },
        appearance: { background_colour: 'url(invalid)' },
      })
    ).error,
    'invalid creation colours rejected',
  );
  check(
    (
      await a.client
        .from('collections')
        .select('id')
        .eq('name', 'Invalid colours')
    ).data.length === 0,
    'invalid colours leave no collection or quote',
  );
  const styledMove = await rpc(a.client, 'move_quote_with_appearance', {
    quote_id: styled.quote_record.id,
    target_kind: 'collection',
    new_collection_name: 'Styled move',
    appearance: colours,
  });
  check(
    styledMove.destination_entry.background_colour === '#123456' &&
      styledMove.quote_record.id === styled.quote_record.id,
    'move creates styled collection and retains quote identity',
  );
  for (const [fn, args] of [
    [
      'edit_collection',
      { collection_id: styledEdited.id, collection_name: 'No' },
    ],
    [
      'save_styled_collection_quote',
      { quote: { text: 'No' }, collection_name: 'No' },
    ],
    [
      'move_quote_with_appearance',
      {
        quote_id: styled.quote_record.id,
        target_kind: 'collection',
        new_collection_name: 'No',
      },
    ],
  ]) {
    check(!!(await anon.rpc(fn, args)).error, `anonymous ${fn} denied`);
  }
  const iconSaved = (
    await rpc(a.client, 'save_styled_collection_quote', {
      collection_name: 'Music icons',
      quote: { text: 'An icon quote' },
      appearance: { icon: 'music' },
    })
  )[0];
  check(
    iconSaved.library_entry.icon === 'music',
    'creation persists the chosen collection icon',
  );
  const iconId = iconSaved.library_entry.id;
  for (const icon of [
    'layers',
    'music',
    'tv',
    'book',
    'speech',
    'paw-print',
    'user',
    'face-grinning',
    'face-slightly-frowning',
    'star',
    'brush',
  ]) {
    const result = await rpc(a.client, 'edit_collection', {
      collection_id: iconId,
      collection_name: 'Music icons',
      appearance: { icon },
    });
    check(result.icon === icon, `supported icon ${icon} can be saved`);
  }
  for (const icon of ['invalid', '#123456', null, 123]) {
    check(
      !!(
        await a.client.rpc('edit_collection', {
          collection_id: iconId,
          collection_name: 'Rejected icon edit',
          appearance: { icon },
        })
      ).error,
      'invalid icon rejected',
    );
  }
  const afterIconFailure = await a.client
    .from('collections')
    .select('icon,name')
    .eq('id', iconId)
    .single();
  check(
    afterIconFailure.data.icon === 'brush' &&
      afterIconFailure.data.name === 'Music icons',
    'invalid icon edit rolls back name and appearance',
  );
  check(
    !!(
      await b.client.rpc('edit_collection', {
        collection_id: iconId,
        collection_name: 'Stolen icon',
        appearance: { icon: 'star' },
      })
    ).error,
    'cross-user icon update denied',
  );
  const iconMoved = await rpc(a.client, 'move_quote_with_appearance', {
    quote_id: iconSaved.quote_record.id,
    target_kind: 'collection',
    new_collection_name: 'Icon move',
    appearance: { icon: 'tv' },
  });
  check(
    iconMoved.destination_entry.icon === 'tv',
    'move creates a collection with its chosen icon',
  );
  const changedColour = await rpc(a.client, 'edit_collection', {
    collection_id: iconMoved.destination_entry.id,
    collection_name: 'Icon move',
    appearance: { text_colour: '#123456' },
  });
  check(changedColour.icon === 'tv', 'colour-only edit preserves the icon');
  check(
    !!(
      await a.client.rpc('save_styled_collection_quote', {
        collection_name: 'Bad icon creation',
        quote: { text: 'Rejected' },
        appearance: { icon: 'invalid' },
      })
    ).error,
    'invalid icon creation rejected',
  );
  check(
    (
      await a.client
        .from('collections')
        .select('id')
        .eq('name', 'Bad icon creation')
    ).data.length === 0,
    'invalid icon leaves no collection or quote',
  );
  console.log(`${count} Collections database checks passed.`);
} finally {
  for (const id of users)
    assert.ifError((await admin.auth.admin.deleteUser(id)).error);
  for (const source of sources)
    assert.ifError(
      (await admin.from('books').delete().eq('source_id', source)).error,
    );
}
