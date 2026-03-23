import { useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { useShellChrome } from '../../../lib/shell-chrome.js';

interface UseCategoryTransactionsShellInput {
  fallbackHomeHref: string;
  shouldGoBackInApp: boolean;
  title: string;
}

export const useCategoryTransactionsShell = ({
  fallbackHomeHref,
  shouldGoBackInApp,
  title,
}: UseCategoryTransactionsShellInput) => {
  const navigate = useNavigate();
  const handleBack = useCallback(() => {
    if (shouldGoBackInApp) {
      navigate(-1);
      return;
    }

    navigate(fallbackHomeHref, { replace: true });
  }, [fallbackHomeHref, navigate, shouldGoBackInApp]);

  useShellChrome(
    useMemo(
      () => ({
        title,
        activeTab: '/',
        showBackButton: true,
        onBack: handleBack,
      }),
      [handleBack, title],
    ),
  );
};
