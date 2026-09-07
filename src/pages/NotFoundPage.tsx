import { Link } from 'react-router-dom';
import { SearchBar } from '../components/SearchBar';

export default function NotFoundPage() {
  return (
    <div className="container-page py-8">
      <div className="glass mx-auto max-w-xl p-6 sm:p-8">
        <h1 className="display text-[1.75rem] leading-tight">That page does not exist</h1>
        <p className="mt-3 text-prose-base">
          The link may be old, or the address slightly off. Search for a verse, a topic, or
          something you are facing and we will take it from there.
        </p>
        <div className="mt-5">
          <SearchBar size="compact" />
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link to="/" className="btn btn-secondary">
            Home
          </Link>
          <Link to="/bible" className="btn btn-secondary">
            Browse the Bible
          </Link>
          <Link to="/topics" className="btn btn-secondary">
            Topics
          </Link>
        </div>
      </div>
    </div>
  );
}
