export const pounds = (amountMinor: number, currency = 'GBP'): string =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amountMinor) / 100);

export const signedPounds = (amountMinor: number, currency = 'GBP'): string =>
  `${amountMinor >= 0 ? '+' : '-'}${pounds(amountMinor, currency)}`;
