import { Stack } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { MonthlyLedgerCard } from '../features/home/components/MonthlyLedgerCard.js';
import { MonzoImportCard } from '../features/home/components/MonzoImportCard.js';
import { UpcomingCommitmentsCard } from '../features/home/components/UpcomingCommitmentsCard.js';
import { AddTransactionDialog } from '../features/home/dialogs/AddTransactionDialog.js';
import { MarkCommitmentPaidDialog } from '../features/home/dialogs/MarkCommitmentPaidDialog.js';
import { useHomeMonthCursor } from '../features/home/hooks/useHomeMonthCursor.js';
import { formatMonthParam, monthStartLocal, parseMonthParam } from '../lib/date/month.js';

export const HomePage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const monthParam = searchParams.get('month');
  const parsedMonthCursor = useMemo(
    () => monthStartLocal(parseMonthParam(monthParam) ?? new Date()),
    [monthParam],
  );
  const { monthCursor, setMonthCursor, window, goPreviousMonth, goNextMonth } = useHomeMonthCursor({
    initialMonthCursor: parsedMonthCursor,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [payInstanceId, setPayInstanceId] = useState<string | null>(null);
  const monthKey = useMemo(() => formatMonthParam(monthCursor), [monthCursor]);

  useEffect(() => {
    setMonthCursor((current) =>
      current.getTime() === parsedMonthCursor.getTime() ? current : parsedMonthCursor,
    );
  }, [parsedMonthCursor, setMonthCursor]);

  useEffect(() => {
    if (searchParams.get('month') === monthKey) {
      return;
    }
    const next = new URLSearchParams(searchParams);
    next.set('month', monthKey);
    setSearchParams(next, { replace: true });
  }, [monthKey, searchParams, setSearchParams]);

  const handleOpenCategory = ({
    categoryId,
    categoryName,
    direction,
  }: {
    categoryId: string;
    categoryName: string;
    direction?: 'in' | 'out';
  }) => {
    const nextSearch = new URLSearchParams({ month: monthKey });
    if (direction) {
      nextSearch.set('direction', direction);
    }

    navigate(`/transactions/category/${encodeURIComponent(categoryId)}?${nextSearch.toString()}`, {
      state: { inAppBackTarget: 'home', categoryName },
    });
  };

  return (
    <>
      <Stack spacing={2}>
        <MonzoImportCard />

        <MonthlyLedgerCard
          monthWindow={window}
          onPreviousMonth={goPreviousMonth}
          onNextMonth={goNextMonth}
          onAddTransaction={() => setAddOpen(true)}
          onOpenCategory={handleOpenCategory}
        />

        <UpcomingCommitmentsCard onMarkPaid={(instanceId) => setPayInstanceId(instanceId)} />
      </Stack>

      <AddTransactionDialog open={addOpen} onClose={() => setAddOpen(false)} />

      <MarkCommitmentPaidDialog
        open={payInstanceId !== null}
        instanceId={payInstanceId}
        onClose={() => setPayInstanceId(null)}
      />
    </>
  );
};
