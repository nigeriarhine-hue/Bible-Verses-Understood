import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Spinner } from './components/ui/Spinner';
import { AuthProvider } from './context/AuthContext';
import { PreferencesProvider } from './context/PreferencesContext';
import { ToastProvider } from './context/ToastContext';
import { TrailProvider } from './context/TrailContext';
import HomePage from './pages/HomePage';

// Everything except the home page is split out, so the first paint is small.
const VersePage = lazy(() => import('./pages/VersePage'));
const BiblePage = lazy(() => import('./pages/BiblePage'));
const ChapterPage = lazy(() => import('./pages/ChapterPage'));
const TopicsPage = lazy(() => import('./pages/TopicsPage'));
const TopicPage = lazy(() => import('./pages/TopicPage'));
const DailyPage = lazy(() => import('./pages/DailyPage'));
const GuidancePage = lazy(() => import('./pages/GuidancePage'));
const SavedPage = lazy(() => import('./pages/SavedPage'));
const CollectionPage = lazy(() => import('./pages/CollectionPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const SignInPage = lazy(() => import('./pages/SignInPage'));
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

function PageLoading() {
  return (
    <div className="container-page flex justify-center py-24" role="status" aria-live="polite">
      <span className="glass-pill">
        <Spinner className="h-4 w-4" />
        Loading
      </span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PreferencesProvider>
            <TrailProvider>
              <Routes>
                <Route element={<Layout />}>
                  <Route index element={<HomePage />} />
                  <Route
                    path="*"
                    element={
                      <Suspense fallback={<PageLoading />}>
                        <Routes>
                          <Route path="/verse/:bookId/:chapter/:verse?" element={<VersePage />} />
                          <Route path="/bible" element={<BiblePage />} />
                          <Route path="/bible/:bookId/:chapter" element={<ChapterPage />} />
                          <Route path="/topics" element={<TopicsPage />} />
                          <Route path="/topics/:slug" element={<TopicPage />} />
                          <Route path="/daily" element={<DailyPage />} />
                          <Route path="/guidance" element={<GuidancePage />} />
                          <Route path="/saved" element={<SavedPage />} />
                          <Route path="/collections/:id" element={<CollectionPage />} />
                          <Route path="/history" element={<HistoryPage />} />
                          <Route path="/profile" element={<ProfilePage />} />
                          <Route path="/sign-in" element={<SignInPage />} />
                          <Route path="/auth/callback" element={<AuthCallbackPage />} />
                          <Route path="/auth/reset" element={<ResetPasswordPage />} />
                          <Route path="/about" element={<AboutPage />} />
                          <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                      </Suspense>
                    }
                  />
                </Route>
              </Routes>
            </TrailProvider>
          </PreferencesProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
