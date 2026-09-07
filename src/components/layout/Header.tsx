import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Icon } from '../ui/Icon';
import type { IconName } from '../ui/icon-paths';
import { TranslationSelector } from './TranslationSelector';

const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Home', icon: 'home' },
  { to: '/bible', label: 'Bible', icon: 'book' },
  { to: '/topics', label: 'Topics', icon: 'layers' },
  { to: '/daily', label: 'Daily', icon: 'sunrise' },
  { to: '/saved', label: 'Saved', icon: 'bookmark' },
  { to: '/profile', label: 'Profile', icon: 'user' },
];

export function Header() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const { user, accountsAvailable } = useAuth();

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-40 pt-3">
      <div className="container-wide">
        <div className="glass-strong flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-2.5 rounded-xl px-1 py-1"
            aria-label="Bible Verses Understood — home"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(var(--gold))] text-[#241701]">
              <Icon name="sunrise" className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="display block truncate text-[1.05rem] leading-tight">
                Bible Verses Understood
              </span>
              <span className="hidden text-ui-xs muted sm:block">
                Understand the Word. Apply it to your life.
              </span>
            </span>
          </Link>

          <nav aria-label="Main" className="ml-auto hidden lg:block">
            <ul className="flex items-center gap-1">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2 rounded-full px-3.5 py-2 text-ui-sm font-medium transition ${
                        isActive
                          ? 'bg-white/15 text-[rgb(var(--ink-on-dark))]'
                          : 'text-[rgb(var(--ink-on-dark-muted))] hover:bg-white/10 hover:text-[rgb(var(--ink-on-dark))]'
                      }`
                    }
                  >
                    <Icon name={item.icon} className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="ml-auto flex items-center gap-2 lg:ml-2">
            <div className="hidden sm:block">
              <TranslationSelector />
            </div>
            {accountsAvailable && !user ? (
              <Link to="/sign-in" className="btn btn-primary hidden px-4 lg:inline-flex">
                Sign in
              </Link>
            ) : null}
            <button
              type="button"
              onClick={() => setMenuOpen((value) => !value)}
              className="btn btn-secondary px-3 lg:hidden"
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              <Icon name={menuOpen ? 'close' : 'menu'} className="h-5 w-5" />
              <span className="sr-only">{menuOpen ? 'Close menu' : 'Open menu'}</span>
            </button>
          </div>
        </div>
      </div>

      {menuOpen ? <MobileMenu onNavigate={() => setMenuOpen(false)} /> : null}
    </header>
  );
}

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { user, accountsAvailable } = useAuth();

  return (
    <div id="mobile-menu" className="fixed inset-0 top-0 z-30 lg:hidden">
      <button
        type="button"
        className="absolute inset-0 bg-[rgb(3_12_30/0.6)] backdrop-blur-sm"
        aria-label="Close menu"
        onClick={onNavigate}
      />
      <div className="container-wide relative pt-[4.75rem]">
        <div className="glass-strong max-h-[calc(100svh-6rem)] overflow-y-auto p-4">
          <nav aria-label="Main">
            <ul className="grid gap-1.5">
              {NAV.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.to === '/'}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3 py-3 text-ui-base font-medium transition ${
                        isActive ? 'bg-white/15' : 'hover:bg-white/10'
                      }`
                    }
                  >
                    <Icon name={item.icon} className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          <div className="mt-4 border-t border-white/10 pt-4">
            <p className="mb-2 text-ui-xs font-semibold uppercase tracking-wider muted">
              Bible translation
            </p>
            <TranslationSelector variant="block" />
          </div>

          {accountsAvailable && !user ? (
            <Link to="/sign-in" onClick={onNavigate} className="btn btn-primary mt-4 w-full">
              Sign in or create an account
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
