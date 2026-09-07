import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/ui/Icon';
import { BOOKS, NEW_TESTAMENT, OLD_TESTAMENT, type BookMeta } from '../lib/bible/books';
import { usePreferences } from '../context/PreferencesContext';

/** Old Testament → New Testament → book → chapter. */
export default function BiblePage() {
  const { translation, translationInfo } = usePreferences();
  const [filter, setFilter] = useState('');
  const [openBook, setOpenBook] = useState<string | null>(null);

  const query = filter.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!query) return null;
    return BOOKS.filter(
      (book) =>
        book.name.toLowerCase().includes(query) ||
        book.aliases.some((alias) => alias.startsWith(query)),
    );
  }, [query]);

  return (
    <div className="container-page space-y-4 pb-6">
      <header className="glass px-5 py-6 sm:px-7">
        <h1 className="display text-[1.75rem] leading-tight sm:text-[2.25rem]">Browse the Bible</h1>
        <p className="mt-2 text-ui-base muted">
          Sixty-six books, reading in the {translationInfo?.name ?? translation}. Choose a chapter,
          then any verse to understand it.
        </p>
        <div className="relative mt-4">
          <Icon
            name="search"
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 muted"
          />
          <label htmlFor="book-filter" className="sr-only">
            Find a book
          </label>
          <input
            id="book-filter"
            type="search"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a book…"
            className="field pl-12"
          />
        </div>
      </header>

      {matches ? (
        <section className="glass p-5">
          <h2 className="display text-lg">
            {matches.length} {matches.length === 1 ? 'book' : 'books'} matching “{filter.trim()}”
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {matches.map((book) => (
              <BookRow key={book.id} book={book} open={openBook === book.id} onToggle={setOpenBook} />
            ))}
          </ul>
        </section>
      ) : (
        <>
          <Testament
            title="Old Testament"
            subtitle="Genesis to Malachi"
            books={OLD_TESTAMENT}
            openBook={openBook}
            onToggle={setOpenBook}
          />
          <Testament
            title="New Testament"
            subtitle="Matthew to Revelation"
            books={NEW_TESTAMENT}
            openBook={openBook}
            onToggle={setOpenBook}
          />
        </>
      )}
    </div>
  );
}

function Testament({
  title,
  subtitle,
  books,
  openBook,
  onToggle,
}: {
  title: string;
  subtitle: string;
  books: BookMeta[];
  openBook: string | null;
  onToggle: (id: string | null) => void;
}) {
  return (
    <section className="glass p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="display text-[1.375rem]">{title}</h2>
        <p className="text-ui-sm muted">
          {subtitle} · {books.length} books
        </p>
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {books.map((book) => (
          <BookRow key={book.id} book={book} open={openBook === book.id} onToggle={onToggle} />
        ))}
      </ul>
    </section>
  );
}

function BookRow({
  book,
  open,
  onToggle,
}: {
  book: BookMeta;
  open: boolean;
  onToggle: (id: string | null) => void;
}) {
  return (
    <li className={open ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <button
        type="button"
        onClick={() => onToggle(open ? null : book.id)}
        aria-expanded={open}
        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
          open ? 'border-[rgb(var(--gold))]/50 bg-white/10' : 'border-white/12 hover:bg-white/10'
        }`}
      >
        <span className="flex-1 text-ui-base font-medium">{book.name}</span>
        <span className="text-ui-xs muted">
          {book.chapters} {book.chapters === 1 ? 'chapter' : 'chapters'}
        </span>
        <Icon name="chevron-down" className={`h-4 w-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>

      {open ? (
        <div className="mt-2 rounded-xl border border-white/12 bg-white/[0.04] p-3">
          <p className="mb-2.5 text-ui-xs font-semibold uppercase tracking-wider muted">
            Choose a chapter
          </p>
          <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-8 lg:grid-cols-12">
            {Array.from({ length: book.chapters }, (_, index) => index + 1).map((chapter) => (
              <li key={chapter}>
                <Link
                  to={`/bible/${book.id}/${chapter}`}
                  className="grid h-10 place-items-center rounded-lg border border-white/12 text-ui-sm font-medium transition hover:border-[rgb(var(--gold))]/60 hover:bg-[rgb(var(--gold))]/15"
                >
                  {chapter}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </li>
  );
}
