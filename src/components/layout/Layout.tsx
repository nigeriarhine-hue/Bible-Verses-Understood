import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { trackPageView } from '../../lib/analytics';
import { ErrorBoundary } from '../ui/ErrorBoundary';
import { Toaster } from '../ui/Toaster';
import { Footer } from './Footer';
import { Header } from './Header';
import { SkyBackground } from './SkyBackground';

export function Layout() {
  const location = useLocation();

  // One page_view per navigation. The gtag config in index.html has
  // send_page_view disabled, so this is the only place they come from.
  //
  // A short delay lets the page set its own document.title first (a study page
  // titles itself once the passage arrives) and collapses rapid redirects into
  // a single view.
  useEffect(() => {
    const path = location.pathname + location.search;
    const timer = window.setTimeout(() => trackPageView(path, document.title), 400);
    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  useEffect(() => {
    // A new page starts at the top, unless the browser is restoring a position.
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  return (
    <div className="relative flex min-h-svh flex-col">
      <SkyBackground />
      <a
        href="#main"
        className="glass-pill sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="flex-1 pt-6 sm:pt-8">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
      <Footer />
      <Toaster />
    </div>
  );
}
