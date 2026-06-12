/** Display-only money formatting. All money math lives server-side or in cart.ts. */
export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Unknown currency code — degrade gracefully rather than crash the POS.
    return `${currency} ${amount.toFixed(2)}`;
  }
}
