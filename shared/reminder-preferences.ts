export const reminderLeadTimes = [0, 1, 3, 7] as const;
export type ReminderPreferences = {
  daysBefore: (typeof reminderLeadTimes)[number];
  hour: number;
};
export const defaultReminderPreferences: ReminderPreferences = {
  daysBefore: 3,
  hour: 9,
};
export function validReminderPreferences(
  value: unknown,
): value is ReminderPreferences {
  if (!value || typeof value !== 'object') return false;
  const prefs = value as ReminderPreferences;
  return (
    reminderLeadTimes.includes(prefs.daysBefore) &&
    Number.isInteger(prefs.hour) &&
    prefs.hour >= 0 &&
    prefs.hour <= 23
  );
}
export function leadLabel(days: number): string {
  return days === 0
    ? 'on renewal day'
    : `${days} ${days === 1 ? 'day' : 'days'} before`;
}
export function hourLabel(hour: number): string {
  return `${hour % 12 || 12} ${hour < 12 ? 'a.m.' : 'p.m.'}`;
}
