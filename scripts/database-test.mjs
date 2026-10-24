import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
// This runner only connects to the local stack. Never use production credentials here.
const status = execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
  encoding: 'utf8',
});
const env = JSON.parse(status);
const url = env.API_URL;
assert.ok(
  /^http:\/\/(127\.0\.0\.1|localhost):/.test(url),
  'Database tests require local Supabase',
);
const admin = createClient(url, env.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const key = env.ANON_KEY;
const users = [];
const book = {
  source: 'open_library',
  source_id: `OL${Date.now()}W`,
  title: 'Test book',
  authors: ['A. Reader'],
  description: 'A harmless fixture',
  published_date: '2020',
  cover_url: null,
  isbn_10: null,
  isbn_13: null,
};
async function account(name) {
  const email = `${name}-${Date.now()}@example.test`,
    password = 'local-testing-only-123';
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  users.push(data.user.id);
  const client = createClient(url, key, { auth: { persistSession: false } });
  assert.ifError(
    (await client.auth.signInWithPassword({ email, password })).error,
  );
  return { client, id: data.user.id };
}
let checks = 0;
function check(value, label) {
  assert.ok(value, label);
  checks++;
  console.log(`PASS ${label}`);
}
async function save(client, metadata = book, text = 'A line to keep') {
  return client.rpc('save_quote_with_book', {
    book: metadata,
    quote: { text, note: 'Private note', page_number: 'xiv' },
  });
}
try {
  const a = await account('reader-a'),
    b = await account('reader-b');
  const first = await save(a.client);
  assert.ifError(first.error);
  const { quote_id, user_book_id } = first.data[0];
  const second = await save(a.client);
  assert.ifError(second.error);
  check(
    second.data[0].user_book_id === user_book_id,
    'repeated saves reuse the association',
  );
  const bSave = await save(b.client);
  assert.ifError(bSave.error);
  for (const [table, column, value] of [
    ['profiles', 'id', b.id],
    ['user_books', 'id', bSave.data[0].user_book_id],
    ['quotes', 'id', bSave.data[0].quote_id],
  ]) {
    const read = await a.client.from(table).select('*').eq(column, value);
    assert.ifError(read.error);
    check(read.data.length === 0, `cross-user ${table} read denied`);
    const update = await a.client
      .from(table)
      .update(
        table === 'profiles'
          ? { display_name: 'intrusion' }
          : table === 'quotes'
            ? { text: 'intrusion' }
            : { user_id: a.id },
      )
      .eq(column, value)
      .select();
    check(
      !!update.error || update.data?.length === 0,
      `cross-user ${table} update denied`,
    );
    const remove = await a.client
      .from(table)
      .delete()
      .eq(column, value)
      .select();
    check(
      !!remove.error || remove.data?.length === 0,
      `cross-user ${table} delete denied`,
    );
  }
  const anon = createClient(url, key, { auth: { persistSession: false } });
  const own = await a.client.rpc('get_random_library_quote');
  assert.ifError(own.error);
  check(
    own.data.length === 1 &&
      [quote_id, second.data[0].quote_id].includes(own.data[0].quote_id),
    'library sampler returns only the caller’s quote',
  );
  const next = await a.client.rpc('get_random_library_quote', {
    exclude_quote_id: own.data[0].quote_id,
  });
  assert.ifError(next.error);
  check(
    next.data.length === 1 &&
      next.data[0].quote_id !== own.data[0].quote_id &&
      [quote_id, second.data[0].quote_id].includes(next.data[0].quote_id),
    'library refresh selects another own quote when available',
  );
  const single = await b.client.rpc('get_random_library_quote', {
    exclude_quote_id: bSave.data[0].quote_id,
  });
  assert.ifError(single.error);
  check(
    single.data.length === 1 &&
      single.data[0].quote_id === bSave.data[0].quote_id,
    'single-quote library returns its own quote safely',
  );
  const guessed = await a.client.rpc('get_random_library_quote', {
    exclude_quote_id: bSave.data[0].quote_id,
  });
  assert.ifError(guessed.error);
  check(
    [quote_id, second.data[0].quote_id].includes(guessed.data[0].quote_id),
    'excluding another user’s ID never discloses their quote',
  );
  check(
    !('note' in own.data[0]) && !('user_id' in own.data[0]),
    'library hero response omits notes and account identifiers',
  );
  check(
    !!(await anon.rpc('get_random_library_quote')).error,
    'anonymous users cannot invoke the library sampler',
  );

  const pool = await admin
    .from('quotes')
    .select(
      'text,credit_mode,credit_author,credit_source,credit_year,user_books(books(title,authors,published_date))',
    );
  assert.ifError(pool.error);
  const publicPool = pool.data.map((row) => ({
    text: row.text,
    author:
      row.credit_mode === 'custom'
        ? row.credit_author
        : row.user_books.books.authors.join(', ') || 'Unknown author',
    book_title:
      row.credit_mode === 'custom'
        ? row.credit_source
        : row.user_books.books.title,
    published_year:
      row.credit_mode === 'custom'
        ? row.credit_year
        : row.user_books.books.published_date?.slice(0, 4) || null,
  }));
  for (const client of [anon, a.client, b.client]) {
    const random = await client.rpc('get_random_homepage_quote');
    assert.ifError(random.error);
    check(
      random.data.length === 1,
      'homepage RPC returns exactly one user-added quote',
    );
    const shown = random.data[0];
    check(
      publicPool.some(
        (row) =>
          row.text === shown.text &&
          row.author === shown.author &&
          row.book_title === shown.book_title &&
          row.published_year === shown.published_year,
      ),
      'homepage quote and attribution come from saved user quotations',
    );
    check(
      JSON.stringify(Object.keys(shown).sort()) ===
        JSON.stringify(
          ['text', 'author', 'book_title', 'published_year'].sort(),
        ),
      'homepage exposes only quotation text and book attribution',
    );
    check(
      !JSON.stringify(shown).includes('Private note') &&
        !JSON.stringify(shown).includes(a.id) &&
        !JSON.stringify(shown).includes(b.id),
      'homepage projection excludes notes and user identities',
    );
  }
  check(
    !!(await anon.rpc('get_random_homepage_quote', { user_id: b.id })).error,
    'homepage RPC does not accept user identifiers or private-field arguments',
  );
  check(
    !!(await anon.rpc('get_random_sample_quote')).error,
    'editorial sample RPC has been removed',
  );

  for (const table of ['profiles', 'books', 'user_books', 'quotes'])
    check(
      !!(await anon.from(table).select('*')).error,
      `anonymous ${table} read denied`,
    );
  check(!!(await save(anon)).error, 'anonymous RPC denied');
  check(
    !!(
      await a.client.from('quotes').insert({
        user_id: a.id,
        user_book_id: bSave.data[0].user_book_id,
        text: 'intrusion',
      })
    ).error,
    'direct quote insert denied',
  );
  check(
    !!(
      await a.client
        .from('user_books')
        .insert({ user_id: a.id, book_id: randomUUID() })
    ).error,
    'direct library insert denied',
  );
  check(
    !!(await a.client.from('profiles').insert({ id: b.id })).error,
    'direct profile insert denied',
  );
  check(
    !!(await a.client.from('books').insert(book)).error,
    'direct catalog insert denied',
  );
  const cat = await admin
    .from('books')
    .select('id')
    .eq('source_id', book.source_id)
    .single();
  assert.ifError(cat.error);
  check(
    !!(
      await a.client
        .from('books')
        .update({ title: 'intrusion' })
        .eq('id', cat.data.id)
    ).error,
    'direct catalog update denied',
  );
  check(
    !!(await a.client.from('books').delete().eq('id', cat.data.id)).error,
    'direct catalog delete denied',
  );
  check(
    !!(
      await a.client.from('quotes').update({ user_id: b.id }).eq('id', quote_id)
    ).error,
    'quote ownership immutable',
  );
  check(
    !!(await a.client.rpc('delete_quote', { quote_id: bSave.data[0].quote_id }))
      .error,
    'cross-user delete RPC denied',
  );
  check(
    !!(
      await admin.from('quotes').insert({
        user_id: a.id,
        user_book_id: bSave.data[0].user_book_id,
        text: 'bad parent',
      })
    ).error,
    'composite FK rejects mismatched parent even with privileged client',
  );
  const invalidBook = { ...book, source_id: `OL${Date.now() + 1}W` };
  check(
    !!(await save(a.client, invalidBook, '  \n ')).error,
    'blank quotation rejected',
  );
  check(
    !!(
      await admin
        .from('books')
        .select('id')
        .eq('source_id', invalidBook.source_id)
        .single()
    ).error,
    'failed save leaves no catalog record',
  );
  check(
    !!(await save(a.client, book, 'x'.repeat(10001))).error,
    'oversized quote rejected',
  );
  for (const bad of [
    { source: 'manual' },
    { cover_url: 'javascript:alert(1)' },
    { authors: ['x'.repeat(301)] },
    { description: 'x'.repeat(20001) },
    { source_id: 'bad id' },
    { source_id: 'OL123M' },
  ])
    check(
      !!(await save(a.client, { ...book, ...bad })).error,
      'invalid catalog metadata rejected',
    );
  const rollbackBook = { ...book, source_id: `OL${Date.now() + 2}W` };
  const failed = await a.client.rpc('save_quote_with_book', {
    book: rollbackBook,
    quote: { text: 'Valid text', note: 'x'.repeat(5001) },
  });
  check(!!failed.error, 'oversized note rejected');
  check(
    (await admin.from('user_books').select('id').eq('user_id', a.id)).data
      .length === 1,
    'failed transaction leaves no library association',
  );
  const edited = await a.client
    .from('quotes')
    .update({ text: 'Edited line' })
    .eq('id', quote_id)
    .select()
    .single();
  assert.ifError(edited.error);
  check(edited.data.text === 'Edited line', 'owner can edit quote');
  const editedHero = await a.client.rpc('get_random_library_quote', {
    exclude_quote_id: second.data[0].quote_id,
  });
  assert.ifError(editedHero.error);
  check(
    editedHero.data[0].quote_id === quote_id &&
      editedHero.data[0].text === 'Edited line',
    'library hero reflects saved quote edits',
  );

  const profile = await a.client
    .from('profiles')
    .update({ display_name: 'A Reader' })
    .eq('id', a.id)
    .select()
    .single();
  check(profile.data?.display_name === 'A Reader', 'owner can update profile');
  const saves = await Promise.all(
    Array.from({ length: 6 }, () => save(a.client)),
  );
  saves.forEach((r) => assert.ifError(r.error));
  check(
    saves.every((r) => r.data[0].user_book_id === user_book_id),
    'concurrent saves share one library entry',
  );
  for (const id of [
    quote_id,
    second.data[0].quote_id,
    ...saves.map((r) => r.data[0].quote_id),
  ])
    assert.ifError(
      (await a.client.rpc('delete_quote', { quote_id: id })).error,
    );
  check(
    (await a.client.from('user_books').select('id').eq('id', user_book_id)).data
      .length === 0,
    'last quote removes library entry',
  );
  const emptyHero = await a.client.rpc('get_random_library_quote');
  assert.ifError(emptyHero.error);
  check(
    emptyHero.data.length === 0,
    'empty personal library never falls back to another user’s quote',
  );
  const seed = await save(a.client);
  assert.ifError(seed.error);
  const race = await Promise.all([
    a.client.rpc('delete_quote', { quote_id: seed.data[0].quote_id }),
    save(a.client),
  ]);
  race.forEach((r) => assert.ifError(r.error));
  const remaining = await a.client
    .from('user_books')
    .select('id,quotes(count)')
    .eq('user_id', a.id);
  assert.ifError(remaining.error);
  check(
    remaining.data.length === 1 && remaining.data[0].quotes[0].count === 1,
    'concurrent save and last-delete retain saved quote',
  );
  check(
    (
      await b.client
        .from('quotes')
        .select('id')
        .eq('id', bSave.data[0].quote_id)
    ).data.length === 1,
    'other user remains unaffected',
  );
  const legacyBook = {
    ...book,
    source: 'google_books',
    source_id: `legacy_${Date.now()}`,
  };
  assert.ifError((await admin.from('books').insert(legacyBook)).error);
  try {
    const legacy = await save(a.client, legacyBook);
    assert.ifError(legacy.error);
    check(
      !!legacy.data[0].quote_id,
      'existing Google catalog entries can receive new quotes',
    );
    const legacyAgain = await save(a.client, legacyBook);
    assert.ifError(legacyAgain.error);
    check(
      legacyAgain.data[0].user_book_id === legacy.data[0].user_book_id,
      'legacy associations are reused',
    );
    assert.ifError(
      (
        await a.client.rpc('delete_quote', {
          quote_id: legacy.data[0].quote_id,
        })
      ).error,
    );
    assert.ifError(
      (
        await a.client.rpc('delete_quote', {
          quote_id: legacyAgain.data[0].quote_id,
        })
      ).error,
    );
    check(
      !!(
        await save(a.client, { ...legacyBook, source_id: `new_${Date.now()}` })
      ).error,
      'new Google catalog entries are rejected',
    );
    check(
      (
        await a.client
          .from('user_books')
          .select('id')
          .eq('id', legacy.data[0].user_book_id)
      ).data.length === 0,
      'legacy last-quote cleanup still works',
    );
  } finally {
    await admin.from('books').delete().eq('source_id', legacyBook.source_id);
  }
  const responseBook = {
    ...book,
    source_id: book.source_id.replace('W', '99W'),
  };
  try {
    const result = await a.client.rpc('save_quote_with_book_result', {
      book: responseBook,
      quote: {
        text: 'Canonical saved words',
        note: 'Private note',
        page_number: '1',
      },
    });
    assert.ifError(result.error);
    const row = result.data[0];
    check(
      row.quote_record.user_id === a.id && row.library_entry.user_id === a.id,
      'save result returns only the caller’s confirmed records',
    );
    check(
      row.quote_record.text === 'Canonical saved words' &&
        row.quote_record.note === 'Private note',
      'save result contains canonical quote fields',
    );
    check(
      row.library_entry.quotes[0].count === 1 &&
        row.library_entry.books.title === responseBook.title,
      'save result contains the canonical book and count',
    );
    const repeated = await a.client.rpc('save_quote_with_book_result', {
      book: { ...responseBook, title: 'Attempted replacement' },
      quote: { text: 'Another canonical quote' },
    });
    assert.ifError(repeated.error);
    check(
      repeated.data[0].library_entry.books.title === responseBook.title &&
        repeated.data[0].library_entry.quotes[0].count === 2,
      'save result preserves immutable catalog metadata and current count',
    );
    check(
      !!(
        await b.client.rpc('delete_quote_result', {
          quote_id: row.quote_record.id,
        })
      ).error,
      'result delete rejects cross-user access',
    );
    check(
      !!(
        await anon.rpc('save_quote_with_book_result', {
          book: responseBook,
          quote: { text: 'Denied' },
        })
      ).error,
      'anonymous save-result RPC denied',
    );
    check(
      !!(
        await anon.rpc('delete_quote_result', { quote_id: row.quote_record.id })
      ).error,
      'anonymous delete-result RPC denied',
    );
    const removed = await a.client.rpc('delete_quote_result', {
      quote_id: row.quote_record.id,
    });
    assert.ifError(removed.error);
    check(
      removed.data[0].remaining_count === 1 &&
        removed.data[0].user_book_id === row.library_entry.id,
      'delete result returns the confirmed remaining count',
    );
    const last = await a.client.rpc('delete_quote_result', {
      quote_id: repeated.data[0].quote_record.id,
    });
    assert.ifError(last.error);
    check(
      last.data[0].remaining_count === 0,
      'last delete returns zero remaining quotes',
    );
    check(
      (
        await a.client
          .from('user_books')
          .select('id')
          .eq('id', row.library_entry.id)
      ).data.length === 0,
      'result delete preserves last-quote cleanup',
    );
    check(
      !!(
        await a.client.rpc('save_quote_with_book_result', {
          book: responseBook,
          quote: { text: ' ' },
        })
      ).error,
      'save-result RPC retains validation',
    );
  } finally {
    await admin.from('books').delete().eq('source_id', responseBook.source_id);
  }
  console.log(`${checks} database checks passed.`);
} finally {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  await admin.from('books').delete().like('source_id', book.source_id);
}
