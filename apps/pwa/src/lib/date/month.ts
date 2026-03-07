export interface MonthWindow {
  from: string;
  to: string;
  label: string;
}

const MONTH_PARAM_PATTERN = /^(\d{4})-(\d{2})$/;

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

export const formatMonthParam = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

export const parseMonthParam = (value: string | null | undefined): Date | null => {
  if (!value) {
    return null;
  }

  const match = value.match(MONTH_PARAM_PATTERN);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1, 0, 0, 0, 0);
};
