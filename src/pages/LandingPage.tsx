import { LoadingIndicator } from '../components/ui/LoadingIndicator';
import { ArrowRight, Bookmark, LockKeyhole, Library } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthProvider';
import { LandingQuote } from '../components/quotes/LandingQuote';
export function LandingPage() {
  const { session, loading } = useAuth();
  if (loading) return <LoadingIndicator>Opening dog-eared…</LoadingIndicator>;
  if (session) return <Navigate to="/library" replace />;
  return (
    <>
      <section className="hero">
        <div>
          <p className="eyebrow">A home for words in your life</p>
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
      <section className="intro-grid" aria-label="How Dog-eared works">
        <article>
          <Library />
          <h2>Find a home for your words</h2>
          <p>
            Find a book, or create a collection for lyrics, conversations and
            thoughts of your own.
          </p>
        </article>
        <article>
          <Bookmark />
          <h2>Keep a good line</h2>
          <p>
            Save a quote, a definition or a passing thought. Add a source, a
            reference or a note whenever you like.
          </p>
        </article>
        <article>
          <LockKeyhole />
          <h2>Make it yours</h2>
          <p>
            A personal library with private notes. Keep your favourite lines
            together, from books and beyond.
          </p>
        </article>
      </section>
    </>
  );
}
