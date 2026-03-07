import { startTransition, useMemo, useState } from 'react';

import { monthStartLocal, monthWindow, shiftMonthLocal } from '../../../lib/date/month.js';

interface UseHomeMonthCursorOptions {
  initialMonthCursor?: Date;
}

export const useHomeMonthCursor = (options?: UseHomeMonthCursorOptions) => {
  const [monthCursor, setMonthCursor] = useState(() =>
    monthStartLocal(options?.initialMonthCursor ?? new Date()),
  );

  const window = useMemo(() => monthWindow(monthCursor), [monthCursor]);

  const goPreviousMonth = () => {
    startTransition(() => {
      setMonthCursor((value) => shiftMonthLocal(value, -1));
    });
  };

  const goNextMonth = () => {
    startTransition(() => {
      setMonthCursor((value) => shiftMonthLocal(value, 1));
    });
  };

  return {
    monthCursor,
    setMonthCursor,
    window,
    goPreviousMonth,
    goNextMonth,
  };
};
