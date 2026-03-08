import { useMemo } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';

import { MobileShell } from './components/MobileShell.js';
import { CategoriesPage } from './pages/CategoriesPage.js';
import { CommitmentsPage } from './pages/CommitmentsPage.js';
import { ExpenseCategoryDetailPage } from './pages/ExpenseCategoryDetailPage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { HomePage } from './pages/HomePage.js';
import { InsightsPage } from './pages/InsightsPage.js';

const getTitle = (pathname: string): string => {
  if (pathname === '/') return 'Tithe';
  if (pathname.startsWith('/expenses')) return 'Expenses';
  if (pathname.startsWith('/commitments')) return 'Commitments';
  if (pathname.startsWith('/categories')) return 'Categories';
  if (pathname.startsWith('/insights')) return 'Insights';
  return 'Tithe';
};

export const App = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const title = getTitle(location.pathname);
  const showBackButton = location.pathname.startsWith('/expenses/category/');
  const canNavigateBackInApp =
    (location.state as { inAppBackTarget?: string } | null)?.inAppBackTarget === 'home';
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
    <MobileShell title={title} showBackButton={showBackButton} onBack={handleBack}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/expenses/category/:categoryId" element={<ExpenseCategoryDetailPage />} />
        <Route path="/commitments" element={<CommitmentsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MobileShell>
  );
};
