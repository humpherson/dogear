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
test('shows startup feedback and keeps the homepage visible during a slow quote request', async ({
  page,
}) => {
  let releaseScript!: () => void;
  let releaseQuote!: () => void;
  const scriptGate = new Promise<void>((resolve) => {
    releaseScript = resolve;
  });
  const quoteGate = new Promise<void>((resolve) => {
    releaseQuote = resolve;
  });
  await page.route('**/assets/index-*.js', async (route) => {
    await scriptGate;
    await route.continue();
  });
  await page.route(
    '**/rest/v1/rpc/get_random_homepage_quote',
    async (route) => {
      await quoteGate;
      await route.fulfill({
        status: 503,
        json: { message: 'Temporarily unavailable' },
      });
    },
  );
  try {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('', { waitUntil: 'commit' });
    await expect(page.locator('.app-startup')).toContainText(
      'Opening Dogeard…',
    );
    await expect(page.locator('.startup-spinner')).toBeVisible();
    releaseScript();
    await expect(page.locator('.lead')).toBeVisible();
    await expect(
      page.locator('.literary-card .loading-indicator'),
    ).toContainText('Finding a little quip');
    await expect(
      page.getByRole('progressbar', { name: 'Request in progress' }),
    ).toBeVisible();
    expect(
      await page
        .locator('.literary-card .spinner')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');
    await checkA11y(page);
    await page.screenshot({
      path: `test-results/loading-${test.info().project.name}.png`,
    });
    releaseQuote();
    await expect(page.locator('.literary-card [role="alert"]')).toContainText(
      'We couldn’t load a sample quote.',
    );
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.locator('.literary-card .spinner')).toHaveCount(0);
    await expect(page.locator('.lead')).toBeVisible();
  } finally {
    releaseScript();
    releaseQuote();
  }
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
    matching!.user_books?.books.title || payload[0].book_title || '',
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
test('cached navigation, compact reads, intent prefetch and confirmed mutations work during slow reads', async ({
  page,
}) => {
  const email = await signup(page);
  const owner = createClient(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  expect(
    (
      await owner.auth.signInWithPassword({
        email,
        password: 'Reading-words-123',
      })
    ).error,
  ).toBeNull();
  const source = `OL${Date.now()}W`;
  fixtureSources.push(source);
  const metadata = {
    source: 'open_library',
    source_id: source,
    title: 'A Fast Library Book',
    authors: ['A Writer'],
    description: 'Stored description loaded on demand.',
    cover_url: 'https://covers.openlibrary.org/b/id/1-M.jpg?default=false',
  };
  const first = await owner.rpc('save_quote_with_book_result', {
    book: metadata,
    quote: { text: 'First cached passage.' },
  });
  const second = await owner.rpc('save_quote_with_book_result', {
    book: metadata,
    quote: { text: 'Second cached passage.' },
  });
  expect(first.error).toBeNull();
  expect(second.error).toBeNull();
  let releaseLibrary!: () => void,
    releaseHero!: () => void,
    releaseDetails!: () => void,
    releaseQuotes!: () => void,
    releaseBackground!: () => void;
  const libraryGate = new Promise<void>((resolve) => {
    releaseLibrary = resolve;
  });
  const heroGate = new Promise<void>((resolve) => {
    releaseHero = resolve;
  });
  const detailsGate = new Promise<void>((resolve) => {
    releaseDetails = resolve;
  });
  const quotesGate = new Promise<void>((resolve) => {
    releaseQuotes = resolve;
  });
  const backgroundGate = new Promise<void>((resolve) => {
    releaseBackground = resolve;
  });
  const reads = { library: 0, hero: 0, details: 0, quotes: 0 };
  let blockBackground = false;
  await page.route('https://covers.openlibrary.org/**', (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="46" height="68"><rect width="46" height="68" fill="tan"/></svg>',
    }),
  );
  await page.route('**/rest/v1/rpc/get_library_entries', async (route) => {
    reads.library++;
    await (blockBackground ? backgroundGate : libraryGate);
    await route.continue().catch(() => undefined);
  });
  await page.route('**/rest/v1/user_books?*', async (route) => {
    reads.details++;
    await (blockBackground ? backgroundGate : detailsGate);
    await route.continue().catch(() => undefined);
  });
  await page.route('**/rest/v1/quotes?*', async (route) => {
    if (route.request().method() === 'GET') {
      reads.quotes++;
      await (blockBackground ? backgroundGate : quotesGate);
    }
    await route.continue().catch(() => undefined);
  });
  await page.route(
    '**/rest/v1/rpc/get_random_library_entry_quote',
    async (route) => {
      reads.hero++;
      await (blockBackground ? backgroundGate : heroGate);
      await route.continue().catch(() => undefined);
    },
  );
  try {
    await page.reload();
    await expect.poll(() => reads.library).toBe(1);
    await expect.poll(() => reads.hero).toBe(1);
    const response = page.waitForResponse((value) =>
      value.url().endsWith('/rest/v1/rpc/get_library_entries'),
    );
    releaseHero();
    releaseLibrary();
    const summary = await (await response).json();
    expect(summary[0].books).not.toHaveProperty('description');
    expect(summary[0].books).not.toHaveProperty('isbn_10');
    const card = page
      .locator('.book-card')
      .filter({ has: page.getByRole('heading', { name: metadata.title }) });
    await expect(card).toBeVisible();
    await expect(card.locator('img')).toHaveAttribute('loading', 'lazy');
    await expect(card.locator('img')).toHaveAttribute('decoding', 'async');
    await card.focus();
    await expect.poll(() => reads.details).toBe(1);
    await expect.poll(() => reads.quotes).toBe(1);
    await card.click();
    await expect(
      page.getByRole('heading', { name: metadata.title }),
    ).toBeVisible();
    await expect(page.getByText('Loading your quotes…')).toBeVisible();
    releaseDetails();
    await expect(page.getByText(metadata.description)).toBeVisible();
    await expect(page.getByText('Loading your quotes…')).toBeVisible();
    releaseQuotes();
    await expect(
      page.getByText('First cached passage.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Second cached passage.', { exact: true }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await page.locator('.book-card').click();
    await expect(
      page.getByText('First cached passage.', { exact: true }),
    ).toBeVisible();
    expect(reads).toEqual({ library: 1, hero: 1, details: 1, quotes: 1 });
    blockBackground = true;
    await page
      .getByRole('button', { name: 'Edit', exact: true })
      .first()
      .click();
    await page
      .getByLabel('The words you want to keep')
      .fill('Confirmed edit with reads blocked.');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(
      page.getByText('Confirmed edit with reads blocked.', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('The words you want to keep')).toHaveCount(0);
    expect(reads.details).toBe(1);
    expect(reads.quotes).toBe(1);
    await page
      .getByRole('button', { name: 'Delete', exact: true })
      .first()
      .click();
    await page
      .getByRole('button', { name: 'Delete quote', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Your quotes (1)' }),
    ).toBeVisible();
    await expect(page.getByRole('alertdialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page
      .getByRole('button', { name: 'Delete quote', exact: true })
      .click();
    await expect(
      page.getByText('Your first dogeard is waiting.'),
    ).toBeVisible();
    await expect(page.locator('.book-card')).toHaveCount(0);
  } finally {
    releaseLibrary();
    releaseHero();
    releaseDetails();
    releaseQuotes();
    releaseBackground();
  }
});

test('header Sign in opens without another page-code download', async ({
  page,
}) => {
  await page.goto('');
  await expect(page.locator('.lead')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const extraScripts: string[] = [];
  await page.route('**/assets/*.js', async (route) => {
    extraScripts.push(route.request().url());
    await gate;
    await route.continue();
  });
  try {
    await page
      .getByRole('navigation')
      .getByRole('link', { name: 'Sign in', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible({ timeout: 1500 });
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
    expect(extraScripts).toEqual([]);
    await page.getByRole('link', { name: 'Forgot password?' }).click();
    await expect(
      page.getByRole('heading', { name: 'Find your way back.' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'Create an account', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Begin your collection.' }),
    ).toBeVisible();
    expect(extraScripts).toEqual([]);
  } finally {
    release();
  }
});

test('book search visibly spins and keeps its status after the field loses focus', async ({
  page,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  await page.route('https://openlibrary.org/search.json?*', async (route) => {
    if (++attempts <= 3) {
      await gate;
      await route.fulfill({ status: 503, json: { message: 'Unavailable' } });
    } else {
      await route.fulfill({ json: { docs: [] } });
    }
  });
  try {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await signup(page);
    await expect(
      page.getByText('Your first dogeard is waiting.'),
    ).toBeVisible();
    await page
      .locator('.page-heading')
      .getByRole('link', { name: 'Add a quote', exact: true })
      .click();
    await expect(page.getByLabel('Book catalogue')).toHaveCount(0);
    const input = page.getByRole('combobox', { name: 'Find a book' });
    const spinner = page.locator('.search-field-icon .spinner');
    await input.fill('A slow book');
    await expect(spinner).toBeVisible();
    await expect(input).toHaveAttribute('aria-busy', 'true');
    const rotation = await spinner.evaluate(async (element) => {
      const before = getComputedStyle(element).transform;
      await new Promise((resolve) => setTimeout(resolve, 160));
      return {
        before,
        after: getComputedStyle(element).transform,
        animation: getComputedStyle(element).animationName,
      };
    });
    expect(rotation.animation).toBe('loading-spin');
    expect(rotation.after).not.toBe(rotation.before);
    await page.getByRole('heading', { name: 'Keep a quote.' }).click();
    await expect(spinner).toBeVisible();
    await expect(page.locator('.search [role="status"]')).toHaveText(
      'Searching Open Library…',
    );
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await spinner.evaluate(
        (element) => getComputedStyle(element).animationName,
      ),
    ).toBe('none');
    await expect(page.locator('.search [role="status"]')).toHaveText(
      'Searching Open Library…',
    );
    await checkA11y(page);
    release();
    await expect(page.locator('.search [role="alert"]')).toContainText(
      'Open Library is unavailable',
    );
    expect(attempts).toBe(3);
    await expect(spinner).toHaveCount(0);
    await expect(input).toHaveAttribute('aria-busy', 'false');
    await page.getByRole('button', { name: 'Retry search' }).click();
    await expect(page.locator('.search [role="status"]')).toHaveText(
      'No books found. Try another title or author.',
    );
    await expect(spinner).toHaveCount(0);
  } finally {
    release();
  }
});

test('Add quote opens without waiting for more page code or a fresh library request', async ({
  page,
}) => {
  await signup(page);
  await expect(page.getByText('Your first dogeard is waiting.')).toBeVisible();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let libraryReads = 0;
  const extraScripts: string[] = [];
  await page.route('**/rest/v1/rpc/get_library_entries', async (route) => {
    libraryReads++;
    await gate;
    await route.continue().catch(() => undefined);
  });
  await page.route('**/assets/*.js', async (route) => {
    extraScripts.push(route.request().url());
    await gate;
    await route.continue();
  });
  await page.route('**/rest/v1/user_books?*', async (route) => {
    libraryReads++;
    await gate;
    await route.continue();
  });
  try {
    await page
      .locator('.page-heading')
      .getByRole('link', { name: 'Add a quote', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'Keep a quote.' }),
    ).toBeVisible({ timeout: 1500 });
    await expect(
      page.getByRole('combobox', { name: 'Find a book' }),
    ).toBeVisible();
    expect(extraScripts).toEqual([]);
    expect(libraryReads).toBe(0);
    await page.getByRole('link', { name: 'Library', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your library.' }),
    ).toBeVisible();
    await page.getByRole('link', { name: 'Add quote', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Keep a quote.' }),
    ).toBeVisible({ timeout: 1500 });
    expect(extraScripts).toEqual([]);
    expect(libraryReads).toBe(0);
  } finally {
    release();
  }
});

test('real signup, quote lifecycle, refresh and navigation logout', async ({
  page,
}) => {
  const source = `OL${Date.now()}W`;
  fixtureSources.push(source);
  await page.route('https://openlibrary.org/search.json?*', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
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
    });
  });
  await page.route(`https://openlibrary.org/works/${source}.json`, (route) =>
    route.fulfill({
      json: { description: { value: 'A story worth remembering.' } },
    }),
  );
  await page.route(
    '**/rest/v1/rpc/save_quote_with_book_result',
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600));
      await route.continue();
    },
  );
  await signup(page);
  await expect(page.getByText('Your first dogeard is waiting.')).toBeVisible();
  await expect(page.locator('.library-quote-hero')).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole('heading', { name: 'Your library.' }),
  ).toBeVisible();
  await page
    .locator('.page-heading')
    .getByRole('link', { name: 'Add a quote', exact: true })
    .click();
  await expect(
    page.getByRole('button', { name: 'Find a new book' }),
  ).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByLabel('Filter your library')).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Find a book' }).fill('A Book');
  await expect(page.locator('.search .spinner')).toBeVisible();
  await page.getByRole('combobox', { name: 'Find a book' }).press('ArrowDown');
  await expect(page.locator('.search li[role=option]')).toBeVisible();
  await page.getByRole('combobox', { name: 'Find a book' }).press('ArrowDown');
  await page.getByRole('combobox', { name: 'Find a book' }).press('Enter');
  await expect(page.getByText('A story worth remembering.')).toBeVisible();
  await page
    .getByLabel('The words you want to keep')
    .fill('The words we carry become a part of us.');
  await page.getByLabel(/Page or location/).fill('xiv');
  await page.getByLabel(/A note to yourself/).fill('Come back to this.');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(
    page.getByRole('button', { name: 'Saving…', exact: true }),
  ).toBeDisabled();
  await expect(page.locator('.quote-form .spinner')).toBeVisible();
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
  await expect(page.getByRole('combobox', { name: 'Find a book' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Find a new book' }).click();
  await expect(
    page.getByRole('combobox', { name: 'Find a book' }),
  ).toBeVisible();
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
  await expect(page.getByText('Your first dogeard is waiting.')).toBeVisible();
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
  await expect(page.getByText('Your first dogeard is waiting.')).toBeVisible();
  await expect(page.locator('.library-quote-hero')).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'A private collection' }),
  ).toHaveCount(0);
});

test('creates, reuses, renames and moves personal collections without book searches', async ({
  page,
}) => {
  const email = await signup(page);
  let bookRequests = 0;
  await page.route('https://openlibrary.org/**', (route) => {
    bookRequests++;
    return route.abort();
  });
  await page.getByRole('link', { name: 'Add quote', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create a collection', exact: true })
    .click();
  await page.getByLabel('Collection name').fill('Passing thoughts');
  await page.getByText('Customise collection', { exact: true }).click();
  const iconChoices = page.getByRole('group', {
    name: 'Collection icon',
    exact: true,
  });
  await expect(iconChoices.getByRole('button')).toHaveText('Layers');
  await iconChoices.getByRole('button').click();
  await expect(iconChoices.getByRole('radio')).toHaveCount(11);
  await checkA11y(page);
  await page.screenshot({
    path: `test-results/icon-dropdown-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  await iconChoices.getByRole('radio', { name: 'Music', exact: true }).check();
  await expect(iconChoices.getByRole('button')).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  for (const name of [
    'Background colour',
    'Icon colour',
    'Text colour',
    'Border colour',
  ]) {
    await expect(page.getByRole('group', { name, exact: true })).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Use this collection' }).click();
  for (const name of [
    'Background colour',
    'Icon colour',
    'Text colour',
    'Border colour',
  ]) {
    await expect(page.getByRole('group', { name, exact: true })).toHaveCount(0);
  }
  await page
    .getByLabel('The words you want to keep')
    .fill('A small observation worth keeping.');
  await page.getByLabel('Author or speaker').fill('A friend');
  await page.getByLabel('Source', { exact: false }).fill('A conversation');
  await page.getByLabel('Reference').fill('Yesterday');
  await page.getByLabel('A note to yourself').fill('A private reminder');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(page).toHaveURL(/#\/collections\//);
  await expect(page.locator('.collection-cover svg')).toHaveAttribute(
    'data-collection-icon',
    'music',
  );
  await expect(page.locator('.collection-cover')).toHaveCSS(
    'background-color',
    'rgb(245, 240, 230)',
  );
  await expect(page.locator('.collection-cover > span')).toHaveText(
    'Passing thoughts',
  );
  await expect(page.locator('.quote-credit')).toContainText('A friend');
  await checkA11y(page);
  await page.screenshot({
    path: `test-results/collection-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  // Simulate a collection with previously saved custom colours. Hidden controls
  // must not reset them when the name/icon is edited or more quotes are added.
  const owner = createClient<Database>(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  expect(
    (
      await owner.auth.signInWithPassword({
        email,
        password: 'Reading-words-123',
      })
    ).error,
  ).toBeNull();
  const collectionId = page.url().split('/collections/')[1];
  expect(
    (
      await owner.rpc('edit_collection', {
        collection_id: collectionId,
        collection_name: 'Passing thoughts',
        appearance: {
          background_colour: '#eee0d0',
          icon_colour: '#b8775e',
          text_colour: '#342a20',
          border_colour: '#96713d',
        },
      })
    ).error,
  ).toBeNull();
  await page.reload();
  await expect(
    page.getByRole('button', { name: 'Edit collection' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Edit collection' }).click();
  let dialog = page.getByRole('alertdialog');
  await dialog.getByLabel('Collection name').fill('Little observations');
  await dialog.getByText('Customise collection', { exact: true }).click();
  await dialog
    .getByRole('group', { name: 'Collection icon', exact: true })
    .getByRole('button')
    .click();
  await dialog
    .getByRole('group', { name: 'Collection icon', exact: true })
    .getByRole('radio', { name: 'Star', exact: true })
    .check();
  for (const name of [
    'Background colour',
    'Icon colour',
    'Text colour',
    'Border colour',
  ]) {
    await expect(dialog.getByRole('group', { name, exact: true })).toHaveCount(
      0,
    );
  }
  await dialog.getByRole('button', { name: 'Save collection' }).click();
  await expect(
    page.getByRole('heading', { name: 'Little observations', exact: true }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Add quote', exact: true }).click();
  await page
    .getByRole('button', { name: /Choose Little observations/ })
    .click();
  await page
    .getByLabel('The words you want to keep')
    .fill('An original line with no attribution.');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(page.locator('.quote-card')).toHaveCount(2);
  const first = page
    .locator('.quote-card')
    .filter({ hasText: 'A small observation worth keeping.' });
  await first.getByRole('button', { name: 'Move', exact: true }).click();
  dialog = page.getByRole('alertdialog');
  await expect(dialog.getByLabel('Author or speaker')).toHaveValue('A friend');
  await dialog.getByLabel('Destination').selectOption('new');
  await dialog.getByLabel('New collection name').fill('Conversations');
  await dialog.getByText('Customise collection', { exact: true }).click();
  await dialog
    .getByRole('group', { name: 'Collection icon', exact: true })
    .getByRole('button')
    .click();
  await dialog
    .getByRole('group', { name: 'Collection icon', exact: true })
    .getByRole('radio', { name: 'TV', exact: true })
    .check();
  await checkA11y(page);
  await page.screenshot({
    path: `test-results/move-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  await dialog.getByRole('button', { name: 'Move quote', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Conversations', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.collection-cover svg')).toHaveAttribute(
    'data-collection-icon',
    'tv',
  );
  await expect(page.locator('.quote-card')).toContainText('A private reminder');
  await expect(page.locator('.quote-credit')).toContainText('A conversation');
  await page
    .locator('.quote-card')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  dialog = page.getByRole('alertdialog');
  await dialog
    .getByLabel('Destination')
    .selectOption({ label: 'Little observations — Collection' });
  await dialog.getByLabel('Author or speaker').fill('');
  await dialog.getByLabel('Source', { exact: false }).fill('');
  await dialog.getByRole('button', { name: 'Move quote', exact: true }).click();
  await expect(page.locator('.quote-card')).toHaveCount(2);
  await expect(page.locator('.quote-credit')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.collection-cover')).toHaveCSS(
    'background-color',
    'rgb(238, 224, 208)',
  );
  await expect(page.locator('.collection-cover')).toHaveCSS(
    'color',
    'rgb(52, 42, 32)',
  );
  await expect(page.locator('.collection-cover')).toHaveCSS(
    'border-left-color',
    'rgb(150, 113, 61)',
  );
  await expect(page.locator('.collection-cover svg')).toHaveAttribute(
    'data-collection-icon',
    'star',
  );
  await expect(page.locator('.collection-cover svg')).toHaveCSS(
    'color',
    'rgb(184, 119, 94)',
  );
  await expect(page.locator('.collection-cover > span')).toHaveText(
    'Little observations',
  );
  await expect(page.locator('.quote-card')).toHaveCount(2);
  await checkA11y(page);
  await page
    .getByRole('link', { name: 'Library', exact: true })
    .first()
    .click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Little observations');
  await page.locator('.book-card').click();
  await page.getByRole('button', { name: 'Edit collection' }).click();
  dialog = page.getByRole('alertdialog');
  const longName =
    'Little observations and other memorable words gathered from everyday conversations';
  await dialog.getByLabel('Collection name').fill(longName);
  await dialog.getByRole('button', { name: 'Save collection' }).click();
  await expect(dialog).not.toBeVisible();
  const thumbnailName = page.locator('.collection-cover > span');
  await expect(thumbnailName).toHaveText(longName);
  expect(
    await thumbnailName.evaluate((node) => node.scrollWidth > node.clientWidth),
  ).toBe(true);
  await expect(
    page.getByRole('heading', { name: longName, exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: `test-results/collection-colours-${page.viewportSize()!.width}.png`,
    fullPage: true,
  });
  expect(bookRequests).toBe(0);
});

test('moving between books and collections retains original attribution and quote identity', async ({
  page,
}) => {
  const email = await signup(page);
  const owner = createClient<Database>(local.API_URL, local.ANON_KEY, {
    auth: { persistSession: false },
  });
  expect(
    (
      await owner.auth.signInWithPassword({
        email,
        password: 'Reading-words-123',
      })
    ).error,
  ).toBeNull();
  const ids = [`OL${Date.now()}91W`, `OL${Date.now()}92W`];
  fixtureSources.push(...ids);
  const saved = await owner.rpc('save_quote_with_book_result', {
    book: {
      source: 'open_library',
      source_id: ids[0],
      title: 'Original source',
      authors: ['Original writer'],
      published_date: '1994',
    },
    quote: {
      text: 'The original words.',
      note: 'A private detail',
      page_number: '42',
    },
  });
  const other = await owner.rpc('save_quote_with_book_result', {
    book: {
      source: 'open_library',
      source_id: ids[1],
      title: 'Another book',
      authors: ['Another writer'],
    },
    quote: { text: 'Already in the destination.' },
  });
  expect(saved.error).toBeNull();
  expect(other.error).toBeNull();
  const original = saved.data![0].quote_record as {
    id: string;
    created_at: string;
  };
  const association = saved.data![0].library_entry as { id: string };
  await page.goto(`#/books/${association.id}`);
  await page
    .locator('.quote-card')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  let dialog = page.getByRole('alertdialog');
  await expect(dialog.getByLabel('Author or speaker')).toHaveValue(
    'Original writer',
  );
  await expect(dialog.getByLabel('Source', { exact: false })).toHaveValue(
    'Original source',
  );
  await dialog.getByLabel('Destination').selectOption('new');
  await dialog.getByLabel('New collection name').fill('Collected lines');
  await dialog.getByRole('button', { name: 'Move quote', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Collected lines', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.quote-credit')).toContainText('Original source');
  await page
    .locator('.quote-card')
    .getByRole('button', { name: 'Move', exact: true })
    .click();
  dialog = page.getByRole('alertdialog');
  await dialog
    .getByLabel('Destination')
    .selectOption({ label: 'Another book — Book' });
  await dialog.getByRole('button', { name: 'Move quote', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Another book', exact: true }),
  ).toBeVisible();
  const moved = page
    .locator('.quote-card')
    .filter({ hasText: 'The original words.' });
  await expect(moved.locator('.quote-credit')).toContainText('Original writer');
  await expect(moved.locator('.quote-credit')).toContainText('Original source');
  await expect(moved).toContainText('A private detail');
  const record = await owner
    .from('quotes')
    .select('*')
    .eq('id', original.id)
    .single();
  expect(record.error).toBeNull();
  expect(record.data).toMatchObject({
    id: original.id,
    created_at: original.created_at,
    credit_year: '1994',
    page_number: '42',
    note: 'A private detail',
  });
  await page
    .getByRole('link', { name: 'Library', exact: true })
    .first()
    .click();
  await expect(page.locator('.book-card')).toHaveCount(1);
  await expect(page.locator('.book-card')).toContainText('Another book');
});

// Retained for a future Google discovery trial; production UI currently exposes only Open Library.
test.skip('switches catalogues and saves Google Books while retaining Open Library and library reuse', async ({
  page,
}) => {
  await signup(page);
  const sourceId = `google_browser_${Date.now()}`;
  fixtureSources.push(sourceId);
  let googleReads = 0,
    openReads = 0,
    releaseGoogle!: () => void;
  const gate = new Promise<void>((resolve) => {
    releaseGoogle = resolve;
  });
  await page.route('https://openlibrary.org/search.json?*', (route) => {
    openReads++;
    return route.fulfill({
      json: {
        docs: [
          {
            key: '/works/OL123W',
            title: 'An Open Library result',
            author_name: ['Open Writer'],
          },
        ],
      },
    });
  });
  await page.route(
    'https://www.googleapis.com/books/v1/volumes?*',
    async (route) => {
      googleReads++;
      expect(new URL(route.request().url()).searchParams.get('key')).toBe(
        'browser-test-key-not-a-real-credential',
      );
      expect(route.request().headers()['x-goog-api-key']).toBeUndefined();
      if (googleReads === 1) {
        await gate;
        return route.fulfill({
          status: 503,
          json: {
            error: {
              code: 429,
              status: 'RESOURCE_EXHAUSTED',
              message: 'Quota exceeded for Queries per day',
              details: [
                {
                  metadata: {
                    quota_limit_value: '0',
                    quota_unit: '1/d/{project}',
                    quota_limit: 'defaultPerDayPerProject',
                  },
                },
              ],
            },
          },
        });
      }
      return route.fulfill({
        json: {
          items: [
            {
              id: sourceId,
              volumeInfo: {
                title: 'A Google Books trial',
                authors: ['Google Writer'],
                description: '<p>A Google description.</p>',
                publishedDate: '2022-04-01',
                industryIdentifiers: [
                  { type: 'ISBN_13', identifier: '9781234567890' },
                ],
              },
            },
          ],
        },
      });
    },
  );
  try {
    await page.getByRole('link', { name: 'Add quote', exact: true }).click();
    const search = page.getByRole('combobox', { name: 'Find a book' });
    await search.fill('A Google Books trial');
    await expect(
      page.getByRole('option', { name: /An Open Library result/ }),
    ).toBeVisible();
    await page.getByLabel('Book catalogue').selectOption('google_books');
    await expect(
      page.getByRole('option', { name: /An Open Library result/ }),
    ).toHaveCount(0);
    await expect(search).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('status')).toContainText(
      'Searching Google Books',
    );
    releaseGoogle();
    await expect(page.getByRole('alert')).toContainText(
      'Google Books has no daily search allowance',
    );
    await page.getByRole('button', { name: 'Retry search' }).click();
    await expect(
      page.getByRole('grid', { name: 'Google Books search results' }),
    ).toBeVisible();
    await expect(
      page.getByRole('grid').locator('.placeholder > span'),
    ).not.toBeVisible();
    await expect(
      page.getByRole('link', {
        name: 'View A Google Books trial on Google Books',
      }),
    ).toHaveAttribute('href', `https://books.google.com/books?id=${sourceId}`);
    await expect(page.getByAltText('Powered by Google')).toBeVisible();
    await checkA11y(page);
    await expect
      .poll(() =>
        page
          .getByAltText('Powered by Google')
          .evaluate((node) => (node as HTMLImageElement).naturalWidth),
      )
      .toBeGreaterThan(0);
    await page.screenshot({
      path: `test-results/google-search-${page.viewportSize()!.width}.png`,
      fullPage: true,
    });
    await search.focus();
    await search.press('ArrowDown');
    await search.press('Enter');
    await expect(
      page.getByRole('heading', { name: 'A Google Books trial' }),
    ).toBeVisible();
    await expect(
      page.getByText('A Google description.', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'View on Google Books' }),
    ).toBeVisible();
    await page
      .getByLabel('The words you want to keep')
      .fill('Saved through Google Books.');
    await page.getByRole('button', { name: 'Keep this quote' }).click();
    await expect(page).toHaveURL(/#\/books\//);
    await expect(page.locator('.quote-card')).toContainText(
      'Saved through Google Books.',
    );
    const catalogue = await admin
      .from('books')
      .select('source,source_id,title,isbn_13,description')
      .eq('source_id', sourceId)
      .single();
    expect(catalogue.error).toBeNull();
    expect(catalogue.data).toMatchObject({
      source: 'google_books',
      source_id: sourceId,
      title: 'A Google Books trial',
      isbn_13: '9781234567890',
      description: 'A Google description.',
    });
    await page.getByRole('link', { name: 'Add quote', exact: true }).click();
    await page
      .getByRole('button', { name: /Choose A Google Books trial/ })
      .click();
    await page
      .getByLabel('The words you want to keep')
      .fill('Reused without an external search.');
    await page.getByRole('button', { name: 'Keep this quote' }).click();
    await expect(page.locator('.quote-card')).toHaveCount(2);
    await page.reload();
    await expect(page.locator('.quote-card')).toHaveCount(2);
    await checkA11y(page);
    expect(googleReads).toBe(2);
    expect(openReads).toBe(1);
  } finally {
    releaseGoogle();
  }
});

test.skip('retries Google backend failures while showing progress and offers an explicit Open Library fallback', async ({
  page,
}) => {
  await signup(page);
  const attempts: Record<string, number[]> = {};
  let openReads = 0;
  await page.route('https://www.googleapis.com/books/v1/volumes?*', (route) => {
    const term = new URL(route.request().url()).searchParams.get('q')!;
    (attempts[term] ||= []).push(Date.now());
    if (term === 'retry success' && attempts[term].length === 3)
      return route.fulfill({
        json: {
          items: [
            {
              id: 'retry_success',
              volumeInfo: {
                title: 'Recovered Google result',
                authors: ['A Writer'],
              },
            },
          ],
        },
      });
    return route.fulfill({
      status: 503,
      json: { error: { code: 503, errors: [{ reason: 'backendFailed' }] } },
    });
  });
  await page.route('https://openlibrary.org/search.json?*', (route) => {
    openReads++;
    expect(new URL(route.request().url()).searchParams.get('q')).toBe(
      'still unavailable',
    );
    return route.fulfill({
      json: {
        docs: [{ key: '/works/OL123W', title: 'Open Library fallback result' }],
      },
    });
  });
  await page.getByRole('link', { name: 'Add quote', exact: true }).click();
  await page.getByLabel('Book catalogue').selectOption('google_books');
  const search = page.getByRole('combobox', { name: 'Find a book' });
  await search.fill('retry success');
  await expect
    .poll(() => attempts['retry success']?.length || 0)
    .toBeGreaterThanOrEqual(1);
  await expect(search).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('status')).toContainText(
    'Searching Google Books',
  );
  await expect(page.locator('.search .spinner')).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Recovered Google result/ }),
  ).toBeVisible({ timeout: 10000 });
  expect(attempts['retry success']).toHaveLength(3);
  expect(
    attempts['retry success'][1] - attempts['retry success'][0],
  ).toBeGreaterThanOrEqual(500);
  expect(
    attempts['retry success'][2] - attempts['retry success'][1],
  ).toBeGreaterThanOrEqual(1000);
  await search.fill('still unavailable');
  await expect(page.getByRole('alert')).toContainText(
    'Google Books is unavailable',
    { timeout: 10000 },
  );
  expect(attempts['still unavailable']).toHaveLength(3);
  expect(openReads).toBe(0);
  await checkA11y(page);
  await page
    .getByRole('button', { name: 'Search Open Library instead' })
    .click();
  await expect(page.getByLabel('Book catalogue')).toHaveValue('open_library');
  await expect(search).toHaveValue('still unavailable');
  await expect(
    page.getByRole('option', { name: /Open Library fallback result/ }),
  ).toBeVisible();
  expect(openReads).toBe(1);
  expect(attempts['still unavailable']).toHaveLength(3);
});

test('collection layouts fit review viewports and preserve drafts and visible dialog actions', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await signup(page);
  await page.getByRole('link', { name: 'Add quote', exact: true }).click();
  await page
    .getByRole('button', { name: 'Create a collection', exact: true })
    .click();
  const longName = 'W'.repeat(120);
  await page.getByLabel('Collection name').fill(longName);
  await page.getByRole('button', { name: 'Use this collection' }).click();
  const writing = page.getByLabel('The words you want to keep');
  await expect(writing).toBeFocused();
  const writingBox = await writing.boundingBox();
  expect(writingBox!.y).toBeGreaterThanOrEqual(0);
  expect(writingBox!.y + writingBox!.height).toBeLessThanOrEqual(568);
  await expect(page.locator('.collection-customise')).not.toHaveAttribute(
    'open',
    '',
  );
  await writing.fill('A line for the responsive collection review.');
  await page.getByRole('button', { name: 'Keep this quote' }).click();
  await expect(page).toHaveURL(/#\/collections\//);
  const noOverflow = async () => {
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  };
  const footerVisible = async () => {
    const footer = await page.locator('.dialog-footer').boundingBox();
    expect(footer!.y).toBeGreaterThanOrEqual(0);
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(
      page.viewportSize()!.height,
    );
  };
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await noOverflow();
    for (const control of await page
      .locator('nav a, nav .nav-sign-out, .quote-meta .actions button')
      .all()) {
      const box = await control.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.width).toBeGreaterThanOrEqual(44);
    }
    await page
      .getByRole('button', { name: 'Edit collection', exact: true })
      .click();
    const dialog = page.getByRole('alertdialog');
    await dialog.getByLabel('Collection name').fill('Unsaved draft');
    await dialog.getByText('Customise collection', { exact: true }).click();
    const icon = dialog.getByRole('button', {
      name: 'Collection icon: Layers',
      exact: true,
    });
    await icon.click();
    await footerVisible();
    await page.screenshot({
      path: `test-results/ui-review-dialog-${viewport.width}-${test.info().project.name}.png`,
    });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeVisible();
    await expect(icon).toBeFocused();
    await expect(icon).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByLabel('Collection name')).toHaveValue(
      'Unsaved draft',
    );
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await page
      .getByRole('link', { name: 'Library', exact: true })
      .first()
      .click();
    await expect(page.locator('.book-card')).toContainText(longName);
    await noOverflow();
    await page.screenshot({
      path: `test-results/ui-review-library-${viewport.width}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page.locator('.book-card').click();
    await checkA11y(page);
    await page.screenshot({
      path: `test-results/ui-review-${viewport.width}-${test.info().project.name}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  const move = page.getByRole('alertdialog');
  await move.getByLabel('Destination').selectOption('new');
  await move.getByLabel('New collection name').fill('Another collection');
  await move.getByText('Customise collection', { exact: true }).click();
  await move.getByRole('button', { name: 'Collection icon: Layers' }).click();
  await footerVisible();
  await move.getByLabel('Source (optional)', { exact: true }).focus();
  const source = await move
    .getByLabel('Source (optional)', { exact: true })
    .boundingBox();
  const scroll = await page.locator('.dialog-scroll').boundingBox();
  expect(source!.y).toBeGreaterThanOrEqual(scroll!.y);
  expect(source!.y + source!.height).toBeLessThanOrEqual(
    scroll!.y + scroll!.height + 1,
  );
  await footerVisible();
  await checkA11y(page);
  await move.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(move).not.toBeVisible();
});
