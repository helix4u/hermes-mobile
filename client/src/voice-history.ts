export interface VoiceHistoryRecord { id: string; role: string; text: string }
/** Complete records, never character-clipped; indexes refer to this scoped archive. */
export function readVoiceHistory(records: VoiceHistoryRecord[], args: Record<string, unknown>) {
  const limit = args.limit === undefined ? 6 : args.limit
  const start = args.start
  if (!Number.isInteger(limit) || Number(limit) < 1 || Number(limit) > 20 ||
      (start !== undefined && (!Number.isInteger(start) || Number(start) < 0)) ||
      (args.query !== undefined && typeof args.query !== 'string')) throw new Error('Use start >= 0, limit 1-20 and a text query.')
  const query = String(args.query || '').toLocaleLowerCase()
  const matches = records.map((record, index) => ({ ...record, index })).filter(record => !query || record.text.toLocaleLowerCase().includes(query))
  const offset = start === undefined ? Math.max(0, matches.length - Number(limit)) : Number(start)
  const page = matches.slice(offset, offset + Number(limit))
  return { records: page, totalRecords: records.length, matchedRecords: matches.length,
    start: offset, nextStart: offset + page.length < matches.length ? offset + page.length : null,
    earlierAvailable: offset > 0, contentTruncated: false, readOnly: true,
    coverage: 'Complete matching records retained by this running client for this target. Not all historic sessions; no guarantee of archive survival after app restart.' }
}
