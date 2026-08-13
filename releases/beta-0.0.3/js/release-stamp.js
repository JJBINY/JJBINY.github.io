const DEFAULT_TIME_ZONE = "Asia/Seoul";

export function formatReleaseStamp(releasedAt, { timeZone = DEFAULT_TIME_ZONE } = {}) {
  if (typeof releasedAt !== "string" || !releasedAt.trim()) return null;

  const timestamp = new Date(releasedAt);
  if (Number.isNaN(timestamp.getTime())) return null;

  let parts;
  try {
    parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    }).formatToParts(timestamp);
  } catch {
    return null;
  }

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const ordered = ["year", "month", "day", "hour", "minute", "second"]
    .map((key) => values[key]);
  if (ordered.some((value) => !value)) return null;

  return `${ordered.join(".")} released`;
}
