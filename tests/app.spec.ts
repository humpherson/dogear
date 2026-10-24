import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
  }),
);
const admin = createClient<Database>(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const created: string[] = [];
const fixtureSources: string[] = [];
async function mailLink(email: string, subject: string) {
  let id = '';
  await expect
    .poll(
      async () => {
        const response = await fetch(
          `${local.MAILPIT_URL || 'http://127.0.0.1:54324'}/api/v1/messages`,
        );
        const data = (await response.json()) as {
          messages: {
            ID: string;
            Subject: string;
            To: { Address: string }[];
          }[];
        };
        id =
          data.messages.find(
            (m) =>
              m.Subject.toLowerCase().includes(subject) &&
              m.To.some((to) => to.Address === email),
          )?.ID || '';
        return id;
      },
      { timeout: 20000 },
    )
    .not.toBe('');
  const response = await fetch(
    `${local.MAILPIT_URL || 'http://127.0.0.1:54324'}/api/v1/message/${id}`,
  );
  const body = (await response.json()) as { HTML: string };
  const link = body.HTML.match(/href="([^"]*\/auth\/v1\/verify[^"]*)"/)?.[1];
  if (!link) throw new Error('No authentication link found in local email');
  return link.replace(/&amp;/g, '&');
}
async function signup(page: Page) {
  const email = `browser-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`;
  created.push(email);
  await page.goto('#/signup');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Reading-words-123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('status')).toContainText('Check your email');
  await page.goto(await mailLink(email, 'confirm'));
  await expect(
    page.getByRole('heading', { name: 'Your library.' }),
  ).toBeVisible();
  return email;
}
async function checkA11y(page: Page) {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}
test.afterEach(async () => {
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const user of data.users)
    if (created.includes(user.email || ''))
      await admin.auth.admin.deleteUser(user.id);
  created.length = 0;
  if (fixtureSources.length)
    await admin.from('books').delete().in('source_id', fixtureSources);
  fixtureSources.length = 0;
});
test('landing, private-route refresh, callback errors, and accessibility', async ({
  page,
}) => {
  await page.goto('');
  const initial = await admin
    .from('quotes')
    .select('id', { count: 'exact', head: true });
  expect(initial.error).toBeNull();
  if (!initial.count) {
    await expect(
      page.getByText('A little quip will be here soon.'),
    ).toBeVisible();
  }
  const email = `homepage-${Date.now()}-${Math.random().toString(36).slice(2)}@example.test`,
    password = 'Homepage-words-123';
  created.push(email);
  const account = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(account.error).toBeNull();
  const owner = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  expect(
    (await owner.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  const source = `OL${Date.now()}W`;
  fixtureSources.push(source);
  const saved = await owner.rpc('save_quote_with_book', {
    book: {
      source: 'open_library',
      source_id: source,
      title: 'A Book Shared Through Words',
      authors: ['A Book Author'],
      published_date: '1900',
    },
    quote: {
      text: 'A user-added quotation for the homepage.',
      note: 'A note only the owner should read.',
      page_number: '42',
    },
  });
  expect(saved.error).toBeNull();
  const pool = await admin
    .from('quotes')
    .select('text,user_books(books(title,authors,published_date))');
  expect(pool.error).toBeNull();
  const fresh = page.waitForResponse((response) =>
    response.url().endsWith('/rpc/get_random_homepage_quote'),
  );
  await page.reload();
  const response = await fresh;
  expect(response.status()).toBe(200);
  const payload = await response.json();
  expect(payload).toHaveLength(1);
  expect(Object.keys(payload[0]).sort()).toEqual([
    'author',
    'book_title',
    'published_year',
    'text',
  ]);
  await expect(page.getByText('A little quip', { exact: true })).toBeVisible();
  await expect(page.locator('.lead')).toHaveText(
    'A little space for words that matter. Give them a place to live — a personal collection of quotes, quips, and lines worth remembering.',
  );
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-GB');
  const shown = page.locator('.literary-card blockquote');
  await expect(shown).toBeVisible();
  const text = await shown.innerText();
  const matching = pool.data!.find((row) => row.text === text);
  expect(matching).toBeTruthy();
  await expect(page.locator('.literary-card')).toContainText(
    matching!.user_books.books.title,
  );
  await expect(page.locator('.literary-card')).not.toContainText(
    'A note only the owner should read.',
  );
  await expect(page.locator('.literary-card')).not.toContainText(email);
  await expect(
    page.getByRole('heading', { name: /Keep the words/ }),
  ).toBeVisible();
  await checkA11y(page);
  await page.keyboard.press('Tab');
  await page.getByRole('link', { name: 'Skip to content' }).press('Enter');
  await expect(page.getByRole('main')).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.goto('#/library');
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await checkA11y(page);
  await page.goto(
    '?auth=callback#error=access_denied&error_description=Expired%20link',
  );
  await expect(page.getByRole('alert')).toContainText('Expired link');
  await expect(page).toHaveURL(/#\/auth\/callback$/);
});
test('real signup, quote lifecycle, refresh and navigation logout', async ({
  page,
}) => {
  const source = `OL${Date.now()}W`;
  fixtureSources.push(source);
  await page.route('https://openlibrary.org/search.json?*', (route) =>
    route.fulfill({
      json: {
        docs: [
          {
            key: `/works/${source}`,
            title: 'A Book for Keeping',
            author_name: ['A. Reader'],
            first_publish_year: 2020,
          },
        ],
      },
    }),
  );
  await page.route(`https://openlibrary.org/works/${source}.json`, (route) =>
    route.fulfill({
      json: { description: { value: 'A story worth remembering.' } },
    }),
  );
  await signup(page);
  await expect(page.getByText('Your first dogear is waiting.')).toBeVisible();
  await expect(page.locator('.library-quote-hero')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your library.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Add a quote', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Find a new book' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Filter your library')).toHaveCount(0);
  await page.getByRole('combobox').fill('A Book');
  await page.getByRole('combobox').press('ArrowDown');
  await expect(page.getByRole('option')).toBeVisible();
  await page.getByRole('combobox').press('ArrowDown');
  await page.getByRole('combobox').press('Enter');
  await expect(page.getByText('A story worth remembering.')).toBeVisible();
  await page
    .getByLabel('The words you want to keep')
    .fill('The words we carry become a part of us.');
  await page.getByLabel(/Page or location/).fill('xiv');
  await page.getByLabel(/A note to yourself/).fill('Come back to this.');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(
    page.getByText('The words we carry become a part of us.', { exact: true }),
  ).toBeVisible();
  await checkA11y(page);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  const singleHero = page.getByRole('region', {
    name: 'A little quip from your library',
  });
  await expect(singleHero.locator('blockquote')).toHaveText(
    'The words we carry become a part of us.',
  );
  await expect(
    singleHero.getByRole('button', { name: 'Refresh', exact: true }),
  ).toBeDisabled();
  await singleHero
    .getByRole('link', { name: 'A Book for Keeping', exact: true })
    .click();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page
    .getByLabel('The words you want to keep')
    .fill('An edited thought.');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(
    page.getByText('An edited thought.', { exact: true }),
  ).toBeVisible();
  const bookUrl = page.url();
  let externalRequests = 0;
  const countExternal = (request: { url: () => string }) => {
    if (request.url().startsWith('https://openlibrary.org/'))
      externalRequests++;
  };
  page.on('request', countExternal);
  await page.getByRole('link', { name: 'Add quote', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Choose from your library' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Choose from your library' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await page.getByRole('button', { name: 'Find a new book' }).click();
  await expect(page.getByRole('combobox')).toBeVisible();
  await expect(page.getByLabel('Filter your library')).toHaveCount(0);
  await page.getByRole('button', { name: 'Choose from your library' }).click();
  await page.getByLabel('Filter your library').fill('A. Reader');
  await checkA11y(page);
  await page
    .getByRole('button', { name: /^Choose A Book for Keeping/ })
    .click();
  await page.getByLabel('The words you want to keep').fill('Another passage.');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your quotes (2)' }),
  ).toBeVisible();
  await expect(page).toHaveURL(bookUrl);
  expect(externalRequests).toBe(0);
  page.off('request', countExternal);
  await page.getByRole('link', { name: 'Library', exact: true }).click();
  await expect(page.getByText('2 quotes kept')).toBeVisible();
  const hero = page.getByRole('region', {
    name: 'A little quip from your library',
  });
  await expect(hero.locator('blockquote')).toBeVisible();
  const firstHeroText = await hero.locator('blockquote').innerText();
  expect(['An edited thought.', 'Another passage.']).toContain(firstHeroText);
  await hero.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(hero.locator('blockquote')).not.toHaveText(firstHeroText);
  await expect(hero).not.toContainText('Come back to this.');
  const heroBounds = await hero.boundingBox();
  const headingBounds = await page
    .locator('.library-content .page-heading')
    .boundingBox();
  expect(heroBounds!.x).toBe(0);
  expect(heroBounds!.width).toBe(page.viewportSize()!.width);
  expect(headingBounds!.y).toBeGreaterThanOrEqual(
    heroBounds!.y + heroBounds!.height,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    page.viewportSize()!.width,
  );
  await page.screenshot({
    path: `test-results/library-hero-${test.info().project.name}.png`,
  });

  await expect(
    page.getByRole('heading', { name: 'A Book for Keeping' }),
  ).toHaveCount(1);
  await checkA11y(page);
  await page
    .locator('.book-card')
    .filter({ has: page.getByRole('heading', { name: 'A Book for Keeping' }) })
    .click();
  await page
    .getByRole('button', { name: 'Delete', exact: true })
    .first()
    .click();
  await checkA11y(page);
  await page.getByRole('button', { name: 'Delete quote', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your quotes (1)' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete quote', exact: true }).click();
  await expect(page.getByText('Your first dogear is waiting.')).toBeVisible();
  await expect(page.locator('.library-quote-hero')).toHaveCount(0);
  await expect(
    page.getByRole('link', { name: 'Settings', exact: true }),
  ).toHaveCount(0);
  await page.goto('#/settings');
  await expect(page).toHaveURL(/#\/library$/);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
});
test('password recovery follows the actual local email redirect', async ({
  page,
}) => {
  const email = await signup(page);
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(
    page.getByRole('heading', { name: 'Find your way back.' }),
  ).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByRole('status')).toContainText('If an account exists');
  await page.goto(await mailLink(email, 'reset'));
  await expect(
    page.getByRole('heading', { name: 'A fresh start.' }),
  ).toBeVisible();
  await page.getByLabel('Password', { exact: true }).fill('Changed-words-456');
  await page.getByRole('button', { name: 'Update password' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library.' }),
  ).toBeVisible();
  await page.goto('#/update-password');
  await expect(
    page.getByRole('heading', { name: 'Request a new reset link' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('Changed-words-456');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your library.' }),
  ).toBeVisible();
});

test('switching accounts in the same browser clears private library data', async ({
  page,
}) => {
  const password = 'Separate-libraries-123';
  const emailA = `switch-a-${Date.now()}@example.test`,
    emailB = `switch-b-${Date.now()}@example.test`;
  created.push(emailA, emailB);
  for (const email of [emailA, emailB]) {
    const { error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }
  const a = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  const signedIn = await a.auth.signInWithPassword({ email: emailA, password });
  if (signedIn.error) throw signedIn.error;
  const source = `OL${Date.now()}W`;
  fixtureSources.push(source);
  const saved = await a.rpc('save_quote_with_book', {
    book: {
      source: 'open_library',
      source_id: source,
      title: 'A private collection',
      authors: ['A Reader'],
    },
    quote: { text: 'A private test passage' },
  });
  if (saved.error) throw saved.error;
  await page.goto('#/login');
  await page.getByLabel('Email address').fill(emailA);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'A private collection' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Welcome back.' }),
  ).toBeVisible();
  await page.getByLabel('Email address').fill(emailB);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText('Your first dogear is waiting.')).toBeVisible();
  await expect(page.locator('.library-quote-hero')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'A private collection' }),
  ).toHaveCount(0);
});
