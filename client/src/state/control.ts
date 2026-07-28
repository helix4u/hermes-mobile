export function nextRunLabel(
  value: string | number | null | undefined,
  locale?: string,
): string {
  if (!value) return 'No next run'
  const numeric = typeof value === 'number' ? value : Number(value)
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value))
  return Number.isNaN(date.getTime())
    ? String(value)
    : new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(date)
}

export function modelConfigValue(
  model: string,
  provider: string,
  persist: boolean,
  hasRuntimeSession: boolean,
): string {
  const global = persist || !hasRuntimeSession ? ' --global' : ''
  return `${model} --provider ${provider}${global}`
}
