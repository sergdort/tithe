import { useMemo, useState } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { MobileShell } from './components/MobileShell.js';
import { type ShellChromeConfig, ShellChromeContext } from './lib/shell-chrome.js';
import { CategoriesPage } from './pages/CategoriesPage.js';
import { CommitmentsPage } from './pages/CommitmentsPage.js';
import { ExpenseCategoryDetailPage } from './pages/ExpenseCategoryDetailPage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { HomePage } from './pages/HomePage.js';
import { InsightsPage } from './pages/InsightsPage.js';

interface AppLocationState {
  inAppBackTarget?: string;
  categoryName?: string;
}

const getTitle = (pathname: string, state: AppLocationState | null): string => {
  if (pathname === '/') return 'Tithe';
  if (pathname.startsWith('/transactions/category/')) {
    return state?.categoryName?.trim() || 'Transactions';
  }
  if (pathname.startsWith('/transactions')) return 'Transactions';
  if (pathname.startsWith('/commitments')) return 'Commitments';
  if (pathname.startsWith('/categories')) return 'Categories';
  if (pathname.startsWith('/insights')) return 'Insights';
  return 'Tithe';
};

const mapLegacyExpensesPathToTransactions = (pathname: string): string =>
  pathname.replace(/^\/expenses\b/, '/transactions');

// Preserve existing deep links after the public Transactions route rename.
const LegacyExpensesRouteRedirect = () => {
  const location = useLocation();

  return (
    <Navigate
      replace
      to={{
        pathname: mapLegacyExpensesPathToTransactions(location.pathname),
        search: location.search,
        hash: location.hash,
      }}
      state={location.state}
    />
  );
};

export const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = (location.state as AppLocationState | null) ?? null;
  const [shellChrome, setShellChrome] = useState<ShellChromeConfig | null>(null);
  const title = shellChrome?.title ?? getTitle(location.pathname, locationState);
  const showBackButton =
    shellChrome?.showBackButton ?? location.pathname.startsWith('/transactions/category/');
  const canNavigateBackInApp = locationState?.inAppBackTarget === 'home';
  const backToHomeHref = useMemo(() => {
    const search = new URLSearchParams(location.search);
    const month = search.get('month');
    if (!month) {
      return '/';
    }
    return `/?month=${encodeURIComponent(month)}`;
  }, [location.search]);

  const handleBack = () => {
    if (canNavigateBackInApp) {
      navigate(-1);
      return;
    }
    navigate(backToHomeHref, { replace: true });
  };

  return (
    <ShellChromeContext.Provider value={setShellChrome}>
      <MobileShell
        title={title}
        activeTab={shellChrome?.activeTab}
        showBackButton={showBackButton}
        onBack={shellChrome?.onBack ?? handleBack}
      >
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/transactions" element={<ExpensesPage />} />
          <Route
            path="/transactions/category/:categoryId"
            element={<ExpenseCategoryDetailPage />}
          />
          <Route path="/expenses" element={<LegacyExpensesRouteRedirect />} />
          <Route path="/expenses/*" element={<LegacyExpensesRouteRedirect />} />
          <Route path="/commitments" element={<CommitmentsPage />} />
          <Route path="/categories" element={<CategoriesPage />} />
          <Route path="/insights" element={<InsightsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MobileShell>
    </ShellChromeContext.Provider>
  );
};
