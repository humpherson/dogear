import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
  }),
);
if (!/^http:\/\/(127\.0\.0\.1|localhost):/.test(local.API_URL))
  throw new Error('Only local Supabase is allowed.');
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const users: string[] = [],
  sources: string[] = [];
test.afterEach(async () => {
  for (const id of users) await admin.auth.admin.deleteUser(id);
  users.length = 0;
  for (const id of sources)
    await admin.from('books').delete().eq('source_id', id);
  sources.length = 0;
});
async function login(page: Page) {
  const email = `definition-browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password = 'Definition-browser-123';
  const account = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(account.error).toBeNull();
  users.push(account.data.user!.id);
  const owner = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  expect(
    (await owner.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  const source = `OL${Date.now()}81W`;
  sources.push(source);
  const saved = await owner.rpc('save_quote_with_book_result', {
    book: {
      source: 'open_library',
      source_id: source,
      title: 'Words to Explore',
      authors: ['Book Author'],
    },
    quote: { text: 'An existing quote.' },
  });
  expect(saved.error).toBeNull();
  await page.goto('#/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your library.' }).waitFor();
  return { owner, parent: saved.data[0].library_entry.id };
}
async function add(page: Page) {
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Add words', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/words\/new$/);
  await page.getByRole('button', { name: /^Choose Words to Explore/ }).click();
}
const meaning = [
  {
    word: 'serendipity',
    meanings: [
      {
        partOfSpeech: 'noun',
        definitions: [
          { definition: 'A fortunate discovery of an unfamiliar color.' },
          { definition: 'An unexpected pleasant result.' },
        ],
      },
    ],
    sourceUrls: ['https://en.wiktionary.org/wiki/serendipity'],
    license: {
      name: 'CC BY-SA 3.0',
      url: 'https://creativecommons.org/licenses/by-sa/3.0/',
    },
  },
];
test('definitions share the quote lifecycle, dictionary selection, filters and private hero', async ({
  page,
}) => {
  const { owner, parent } = await login(page);
  let lookups = 0;
  await page.route('https://api.dictionaryapi.dev/**', async (route) => {
    lookups++;
    await route.fulfill({ json: meaning });
  });
  await add(page);
  await page
    .getByLabel('The words you want to keep')
    .fill('An unsaved quote draft.');
  await page.getByRole('button', { name: 'Definition', exact: true }).click();
  await page.getByLabel('Word or phrase').fill('serendipity');
  await page
    .getByLabel('Meaning', { exact: true })
    .fill('My own first explanation.');
  expect(lookups).toBe(0);
  await page.getByRole('button', { name: 'Quote', exact: true }).click();
  await expect(page.getByLabel('The words you want to keep')).toHaveValue(
    'An unsaved quote draft.',
  );
  await page.getByRole('button', { name: 'Definition', exact: true }).click();
  await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue(
    'My own first explanation.',
  );
  await page.getByRole('button', { name: 'Find meaning', exact: true }).click();
  await page
    .getByText('A fortunate discovery of an unfamiliar colour.', {
      exact: true,
    })
    .waitFor();
  await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue(
    'My own first explanation.',
  );
  await page
    .getByRole('button', { name: 'Replace meaning', exact: true })
    .first()
    .click();
  await expect(page.getByLabel('Meaning', { exact: true })).toHaveValue(
    'A fortunate discovery of an unfamiliar colour.',
  );
  await page
    .getByRole('button', { name: 'Keep this definition', exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`#/books/${parent}$`));
  const card = page.locator('.quote-card').filter({
    has: page.getByRole('heading', { name: 'serendipity', exact: true }),
  });
  await expect(card).toContainText(
    'A fortunate discovery of an unfamiliar colour.',
  );
  await expect(card.getByText(/Based on Free Dictionary API/)).toHaveCount(0);
  await expect(card.getByRole('link', { name: 'CC BY-SA 3.0' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Definitions', exact: true }).click();
  await expect(page.locator('.quote-card')).toHaveCount(1);
  await page.getByLabel('Filter your words').fill('fortunate');
  await expect(card).toBeVisible();
  await page.getByLabel('Filter your words').fill('missing');
  await expect(page.getByText('No words match your filter.')).toBeVisible();
  await page.getByLabel('Filter your words').clear();
  await card.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(card.locator('.item-type-switch')).toHaveCount(0);
  await expect(
    page.locator('.quote-form').getByLabel('Word or phrase'),
  ).toHaveValue('serendipity');
  await page
    .locator('.quote-form')
    .getByLabel('Meaning', { exact: true })
    .fill('A happy unexpected discovery.');
  await page
    .locator('.quote-form')
    .getByRole('button', { name: 'Save changes' })
    .click();
  await expect(card).toContainText('A happy unexpected discovery.');
  const stored = await owner
    .from('quotes')
    .select('*')
    .eq('user_book_id', parent)
    .eq('item_type', 'definition')
    .single();
  expect(stored.error).toBeNull();
  expect(stored.data.term).toBe('serendipity');
  expect(stored.data.lookup_attribution.provider).toBe('free-dictionary-api');
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.locator('.book-card').first()).toContainText(
    '1 quote · 1 definition kept',
  );
  // Refresh until the sampler chooses the definition; with two rows exclusion is deterministic.
  const hero = page.getByRole('region', { name: 'From your library' });
  if (!(await hero.locator('.definition-term').count()))
    await hero.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(
    hero.getByRole('heading', { name: 'serendipity' }),
  ).toBeVisible();
  await expect(
    hero.getByRole('link', { name: 'Words to Explore', exact: true }),
  ).toBeVisible();
  await hero
    .getByRole('link', { name: 'Words to Explore', exact: true })
    .click();
  await card.getByRole('button', { name: 'Move', exact: true }).click();
  const dialog = page.getByRole('alertdialog');
  await expect(dialog.getByLabel('Author or speaker')).toHaveCount(0);
  await dialog.getByLabel('Destination').selectOption('new');
  await dialog.getByLabel('New collection name').fill('Vocabulary');
  await dialog
    .getByRole('button', { name: 'Move definition', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/collections\//);
  await expect(
    page.getByRole('heading', { level: 1, name: 'Vocabulary' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'serendipity' }),
  ).toBeVisible();
  expect(
    (
      await owner
        .from('quotes')
        .select('id,term,lookup_attribution')
        .eq('id', stored.data.id)
        .single()
    ).data!.term,
  ).toBe('serendipity');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .locator('.quote-card')
    .getByRole('button', { name: 'Delete', exact: true })
    .click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Delete definition', exact: true })
    .click();
  await expect(page).toHaveURL(/#\/library$/);
  await expect(
    page.getByRole('heading', { name: 'Vocabulary', exact: true }),
  ).toHaveCount(0);
  await expect(page.locator('.book-card')).toContainText('1 quote kept');
});
test('lookup failures and stale requests never block a manually saved definition', async ({
  page,
}) => {
  await login(page);
  await add(page);
  await page.getByRole('button', { name: 'Definition', exact: true }).click();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  let attempts = 0;
  await page.route('https://api.dictionaryapi.dev/**', async (route) => {
    attempts++;
    if (route.request().url().endsWith('/old')) {
      await gate;
      await route.fulfill({ json: meaning }).catch(() => {});
    } else
      await route.fulfill({
        status: 404,
        json: { title: 'No Definitions Found' },
      });
  });
  try {
    await page.getByLabel('Word or phrase').fill('old');
    await page.getByRole('button', { name: 'Find meaning' }).click();
    await expect(page.getByText('Finding meanings…')).toBeVisible();
    await page.getByLabel('Word or phrase').fill('déjà vu');
    release();
    await expect(
      page.getByText('A fortunate discovery of an unfamiliar colour.', {
        exact: true,
      }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Find meaning' }).click();
    await expect(page.getByText(/No definition found/)).toBeVisible();
    await page
      .getByLabel('Meaning', { exact: true })
      .fill('A feeling of having experienced something before.');
    await page.getByRole('button', { name: 'Keep this definition' }).click();
    await expect(page.getByRole('heading', { name: 'déjà vu' })).toBeVisible();
    expect(attempts).toBe(2);
    await page.goto('#/quotes/new');
    await expect(
      page.getByRole('heading', { name: 'Keep words.' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Create a collection', exact: true })
      .click();
    await page
      .getByLabel('Collection name', { exact: true })
      .fill('Personal glossary');
    await page.getByRole('button', { name: 'Use this collection' }).click();
    await page.getByRole('button', { name: 'Definition', exact: true }).click();
    await page.getByLabel('Word or phrase').fill('a phrase of my own');
    await page
      .getByLabel('Meaning', { exact: true })
      .fill('A personally chosen explanation.');
    await page.getByRole('button', { name: 'Keep this definition' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Personal glossary' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'a phrase of my own' }),
    ).toBeVisible();
    expect(attempts).toBe(2);
  } finally {
    release();
  }
});
