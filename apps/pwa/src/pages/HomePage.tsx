import { Stack } from '@mui/material';
import { useState } from 'react';

import { MonthlyLedgerCard } from '../features/home/components/MonthlyLedgerCard.js';
import { MonzoImportCard } from '../features/home/components/MonzoImportCard.js';
import { UpcomingCommitmentsCard } from '../features/home/components/UpcomingCommitmentsCard.js';
import { AddTransactionDialog } from '../features/home/dialogs/AddTransactionDialog.js';
import { MarkCommitmentPaidDialog } from '../features/home/dialogs/MarkCommitmentPaidDialog.js';
import { useHomeMonthCursor } from '../features/home/hooks/useHomeMonthCursor.js';

export const HomePage = () => {
  const { window, goPreviousMonth, goNextMonth } = useHomeMonthCursor();

  const [addOpen, setAddOpen] = useState(false);
  const [payInstanceId, setPayInstanceId] = useState<string | null>(null);

  return (
    <>
      <Stack spacing={2}>
        <MonzoImportCard />

        <MonthlyLedgerCard
          monthWindow={window}
          onPreviousMonth={goPreviousMonth}
          onNextMonth={goNextMonth}
          onAddTransaction={() => setAddOpen(true)}
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
