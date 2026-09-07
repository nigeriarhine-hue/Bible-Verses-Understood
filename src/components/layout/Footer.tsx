import { Link } from 'react-router-dom';
import { usePreferences } from '../../context/PreferencesContext';
import { Disclaimer } from './Disclaimer';

export function Footer() {
  const { translationInfo } = usePreferences();

  return (
    <footer className="container-page pb-safe mt-14 pt-2">
      <Disclaimer />

      <div className="glass mt-4 px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-ui-xs">
          <span className="muted">© {new Date().getFullYear()} Bible Verses Understood</span>
          <Link to="/about" className="underline underline-offset-4 hover:text-[rgb(var(--gold))]">
            About
          </Link>
          <Link to="/topics" className="underline underline-offset-4 hover:text-[rgb(var(--gold))]">
            Topics
          </Link>
          <Link to="/bible" className="underline underline-offset-4 hover:text-[rgb(var(--gold))]">
            Browse the Bible
          </Link>
        </div>
        {translationInfo?.copyrightNotice ? (
          <p className="mt-3 border-t border-white/10 pt-3 text-ui-xs leading-relaxed muted">
            {translationInfo.copyrightNotice}
          </p>
        ) : null}
      </div>
    </footer>
  );
}
