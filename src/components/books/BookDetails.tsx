import { useState } from 'react';
import { BookOpen } from 'lucide-react';
import type { BookSearchResult } from '../../types';
export function Cover({
  book,
  large = false,
}: {
  book: BookSearchResult;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return book.cover_url && !failed ? (
    <img
      className={large ? 'cover large' : 'cover'}
      src={book.cover_url}
      alt={`Cover of ${book.title}`}
      onError={() => setFailed(true)}
      referrerPolicy="no-referrer"
    />
  ) : (
    <div
      className={large ? 'cover placeholder large' : 'cover placeholder'}
      aria-label="No cover available"
    >
      <BookOpen aria-hidden="true" />
      <span>{book.title}</span>
    </div>
  );
}
export function BookDetails({ book }: { book: BookSearchResult }) {
  return (
    <section className="book-details">
      <Cover key={book.source_id} book={book} large />
      <div>
        <p className="eyebrow">Your next dogeard</p>
        <h2>{book.title}</h2>
        <p>{book.authors.join(', ') || 'Unknown author'}</p>
        {book.published_date && (
          <p className="muted">
            {book.source === 'open_library' ? 'First published' : 'Published'}{' '}
            {book.published_date}
          </p>
        )}
        {book.description && <p className="description">{book.description}</p>}
        {book.source === 'open_library' && /^OL\d+W$/.test(book.source_id) && (
          <p>
            <a
              href={`https://openlibrary.org/works/${book.source_id}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Open Library
            </a>
          </p>
        )}
      </div>
    </section>
  );
}
