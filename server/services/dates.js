export const DAY = 86400000;

// Due dates are stored as UTC midnight of the calendar day picked in the form.
// "Today" in the same form lets us compare whole days: overdue means due before today, not before this instant.
export const today = (now = new Date()) => new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

export const round2 = (n) => Math.round(Number(n) * 100) / 100;
