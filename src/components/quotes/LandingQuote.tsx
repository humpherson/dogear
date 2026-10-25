import { useState } from 'react';
import { Bookmark } from 'lucide-react';
import { homepageQuotes } from '../../content/homepageQuotes';

export function LandingQuote() {
  const [quote] = useState(
    () => homepageQuotes[Math.floor(Math.random() * homepageQuotes.length)],
  );
  return (
    <div className="literary-card">
      <Bookmark size={30} strokeWidth={1} aria-hidden="true" />
      <p className="eyebrow">A little quip</p>
      <blockquote>{quote.text}</blockquote>
      <div className="rule" />
      <p>{quote.author}</p>
      <span className="muted">
        {quote.book_title} · {quote.published_year}
      </span>
      <div className="card-corner" aria-hidden="true" />
    </div>
  );
}
