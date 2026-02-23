export interface MonthWindow {
  from: string;
  to: string;
  label: string;
}

export const monthStartLocal = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);

export const shiftMonthLocal = (date: Date, delta: number): Date =>
  new Date(date.getFullYear(), date.getMonth() + delta, 1, 0, 0, 0, 0);

export const monthWindow = (cursor: Date): MonthWindow => {
  const start = monthStartLocal(cursor);
  const end = shiftMonthLocal(start, 1);

  return {
    from: start.toISOString(),
    to: end.toISOString(),
    label: start.toLocaleDateString('en-GB', {
      month: 'long',
      year: 'numeric',
    }),
  };
};
