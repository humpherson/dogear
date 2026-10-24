// Optional low-volume live check; never runs in CI or against hosted Supabase.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
const local = JSON.parse(
  execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
    encoding: 'utf8',
  }),
);
assert.match(local.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):/);
const admin = createClient(local.API_URL, local.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const email = `live-openlibrary-${Date.now()}@example.test`,
  password = 'Local-reading-check-123';
const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
assert.ifError(error);
let browser;
let sourceId;
let catalogWasPresent = true;
try {
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:5173/#/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByRole('heading', { name: 'Your library.' }).waitFor();
  await page.getByRole('link', { name: 'Add a quote', exact: true }).click();
  const response = page.waitForResponse(
    (r) => r.url().startsWith('https://openlibrary.org/search.json?'),
    { timeout: 40000 },
  );
  await page.getByRole('combobox').fill('Pride and Prejudice');
  assert.equal(
    (await response).status(),
    200,
    'Live search must return HTTP 200',
  );
  await page.getByRole('option').first().click({ timeout: 40000 });
  const link = await page
    .getByRole('link', { name: 'View on Open Library' })
    .getAttribute('href');
  sourceId = link.split('/').at(-1);
  assert.match(sourceId, /^OL\d+W$/);
  const existing = await admin
    .from('books')
    .select('id')
    .eq('source', 'open_library')
    .eq('source_id', sourceId);
  assert.ifError(existing.error);
  catalogWasPresent = existing.data.length > 0;
  const save = page.getByRole('button', {
    name: 'Keep this quote',
    exact: true,
  });
  await save.waitFor();
  await page
    .getByLabel('The words you want to keep')
    .fill('A live Open Library test quotation.');
  await save.click({ timeout: 40000 });
  await page
    .getByText('A live Open Library test quotation.', { exact: true })
    .waitFor();
  const saved = await admin
    .from('books')
    .select('*')
    .eq('source', 'open_library')
    .eq('source_id', sourceId)
    .single();
  assert.ifError(saved.error);
  assert.equal(saved.data.authors.includes('Jane Austen'), true);
  assert.ok(saved.data.published_date);
  await page.screenshot({
    path: '/tmp/dogear-openlibrary-live.png',
    fullPage: true,
  });
  console.log(
    `PASS live browser search, metadata selection, ${saved.data.description ? 'description, ' : ''}and quote persistence using Open Library (no API interception)`,
  );
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('button', { name: 'Delete quote', exact: true }).click();
  await page.getByText('Your first dogear is waiting.').waitFor();
  console.log('PASS live quote deletion and last-quote library cleanup');
} finally {
  await browser?.close();
  await admin.auth.admin.deleteUser(data.user.id);
  if (sourceId && !catalogWasPresent)
    await admin
      .from('books')
      .delete()
      .eq('source', 'open_library')
      .eq('source_id', sourceId);
}
