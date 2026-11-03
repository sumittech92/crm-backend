/** "https://www.SunriseClasses.in:443/home" -> "sunriseclasses.in". Returns null for an empty value. */
export const normalizeDomain = (value: unknown): string | null => {
  const host = String(value ?? "").trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/^www\./, "").replace(/\.$/, "");
  return host || null;
};

export const isValidDomain = (host: string) => /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
