import { startTransition, useMemo, useState } from 'react';

import { monthStartLocal, monthWindow, shiftMonthLocal } from '../../../lib/date/month.js';

export const useHomeMonthCursor = () => {
  const [monthCursor, setMonthCursor] = useState(() => monthStartLocal(new Date()));

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
