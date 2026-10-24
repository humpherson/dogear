import { ArrowRight, Bookmark, LockKeyhole, Library } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LandingQuote } from '../components/quotes/LandingQuote';
export function LandingPage() {
  const { session, loading } = useAuth();
  if (loading) return <p role="status">Opening Dogear…</p>;
  if (session) return <Navigate to="/library" replace />;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">A home for your reading life</p>
          <h1>
            Keep the words
            <br />
            that <em>stay with you.</em>
          </h1>
          <p className="lead">
            A little space for words that matter. Give them a place to live — a
            personal collection of quotes, quips, and lines worth remembering.
          </p>
          <Link className="button" to="/signup">
            Start your library <ArrowRight size={18} />
          </Link>
          <p className="hint">Your library. Your notes stay private.</p>
        </div>
        <LandingQuote />
      </section>
      <section className="intro-grid" aria-label="How Dogear works">
        <article>
          <Library />
          <h2>Find your book</h2>
          <p>
            Search the books you’re reading, from old favourites to new
            discoveries.
          </p>
        </article>
        <article>
          <Bookmark />
          <h2>Keep a little of it</h2>
          <p>
            Save a passage, mark the page, and leave a thought for your future
            self.
          </p>
        </article>
        <article>
          <LockKeyhole />
          <h2>Make it yours</h2>
          <p>
            A personal library with private notes. Saved quote text and book
            attribution may appear on the public homepage.
          </p>
        </article>
      </section>
    </>
  );
}
