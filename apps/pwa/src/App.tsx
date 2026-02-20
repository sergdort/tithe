import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { MobileShell } from './components/MobileShell.js';
import { CategoriesPage } from './pages/CategoriesPage.js';
import { CommitmentsPage } from './pages/CommitmentsPage.js';
import { ExpensesPage } from './pages/ExpensesPage.js';
import { HomePage } from './pages/HomePage.js';
import { InsightsPage } from './pages/InsightsPage.js';

const titleByPath: Record<string, string> = {
  '/': 'Tithe',
  '/expenses': 'Expenses',
  '/commitments': 'Commitments',
  '/categories': 'Categories',
  '/insights': 'Insights',
};

export const App = () => {
  const location = useLocation();
  const title = titleByPath[location.pathname] ?? 'Tithe';

  return (
    <MobileShell title={title}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/expenses" element={<ExpensesPage />} />
        <Route path="/commitments" element={<CommitmentsPage />} />
        <Route path="/categories" element={<CategoriesPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </MobileShell>
  );
};
