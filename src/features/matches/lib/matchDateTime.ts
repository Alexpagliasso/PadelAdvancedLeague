const matchTimeZone = 'Europe/Rome';

function getDateTimeParts(value: string): Record<string, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: matchTimeZone,
    year: 'numeric'
  }).formatToParts(new Date(value));

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getRequiredPart(parts: Record<string, string>, key: string): string {
  const value = parts[key];

  if (!value) {
    throw new Error(`Missing date part: ${key}`);
  }

  return value;
}

function getTimeZoneOffsetMs(value: Date): number {
  const parts = getDateTimeParts(value.toISOString());
  const localAsUtc = Date.UTC(
    Number(getRequiredPart(parts, 'year')),
    Number(getRequiredPart(parts, 'month')) - 1,
    Number(getRequiredPart(parts, 'day')),
    Number(getRequiredPart(parts, 'hour')),
    Number(getRequiredPart(parts, 'minute')),
    Number(getRequiredPart(parts, 'second'))
  );

  return localAsUtc - value.getTime();
}

export function buildMatchDateTime(date: string, time: string): string | null {
  if (!date) {
    return null;
  }

  const [year = 0, month = 1, day = 1] = date.split('-').map(Number);
  const [hour = 0, minute = 0] = (time || '00:00').split(':').map(Number);

  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0);
  const firstGuess = new Date(localAsUtc);
  const firstOffset = getTimeZoneOffsetMs(firstGuess);
  const secondGuess = new Date(localAsUtc - firstOffset);
  const secondOffset = getTimeZoneOffsetMs(secondGuess);

  return new Date(localAsUtc - secondOffset).toISOString();
}

export function formatMatchDate(value: string | null): string {
  if (!value) {
    return 'Da programmare';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'medium',
    timeZone: matchTimeZone
  }).format(new Date(value));
}

export function formatMatchTime(value: string | null): string {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat('it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: matchTimeZone
  }).format(new Date(value));
}

export function formatMatchDateTime(value: string | null): string {
  if (!value) {
    return 'Da programmare';
  }

  return new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: matchTimeZone
  }).format(new Date(value));
}

export function getMatchDateInputValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const parts = getDateTimeParts(value);
  return `${getRequiredPart(parts, 'year')}-${getRequiredPart(parts, 'month')}-${getRequiredPart(parts, 'day')}`;
}

export function getMatchTimeInputValue(value: string | null): string {
  if (!value) {
    return '';
  }

  const parts = getDateTimeParts(value);
  return `${getRequiredPart(parts, 'hour')}:${getRequiredPart(parts, 'minute')}`;
}
