import { render } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BookDetails } from '../components/books/BookDetails';
import type { BookSearchResult } from '../types';
const book: BookSearchResult = {
  source: 'open_library',
  source_id: 'OL1W',
  title: 'A book',
  authors: ['A Writer'],
  description: null,
  published_date: null,
  cover_url: null,
  isbn_10: null,
  isbn_13: null,
};
it('caps long descriptions at 320 displayed characters including the ellipsis', () => {
  const description = 'An opening sentence. '.repeat(30) + 'An omitted ending.';
  const { container } = render(<BookDetails book={{ ...book, description }} />);
  const text = container.querySelector('.description')!.textContent!;
  expect(text.length).toBeLessThanOrEqual(320);
  expect(text.startsWith('An opening sentence.')).toBe(true);
  expect(text.endsWith('...')).toBe(true);
  expect(text).not.toContain('An omitted ending.');
});
it('leaves an exactly 320-character description intact', () => {
  const description = 'A'.repeat(320);
  const { container } = render(<BookDetails book={{ ...book, description }} />);
  expect(container.querySelector('.description')!.textContent).toBe(
    description,
  );
});
it('counts Unicode characters without cutting surrogate pairs', () => {
  const { container } = render(
    <BookDetails book={{ ...book, description: '📚'.repeat(321) }} />,
  );
  const text = container.querySelector('.description')!.textContent!;
  expect(Array.from(text)).toHaveLength(320);
  expect(text.endsWith('...')).toBe(true);
  expect(text).not.toContain('\uFFFD');
});
it('does not add an empty description', () => {
  const { container } = render(<BookDetails book={book} />);
  expect(container.querySelector('.description')).toBeNull();
});
