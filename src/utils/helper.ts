export const toBool = (value: unknown): boolean =>
  value === true || value === 'true';

export const toStringArray = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => toStringArray(item));
  }
  if (typeof value !== 'string') return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};
