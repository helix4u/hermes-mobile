import { describe, it, expect } from 'vitest'
import { readVoiceHistory } from './voice-history'
describe('scoped voice history read', () => {
  const records = Array.from({length: 10}, (_, n) => ({id: String(n), role: n % 2 ? 'assistant' : 'user', text: 'Record ' + n + ' complete '.repeat(10000)}))
  it('defaults to newest complete records and exposes earlier coverage', () => {
    const result = readVoiceHistory(records, {})
    expect(result.records).toEqual(records.slice(4).map((record, n) => ({...record,index:n+4})))
    expect(result.earlierAvailable).toBe(true)
    expect(result.contentTruncated).toBe(false)
  })
  it('searches whole records and pages without rewriting text', () => {
    expect(readVoiceHistory(records, {query:'Record 0'}).records[0].text).toBe(records[0].text)
    expect(readVoiceHistory(records, {start:0,limit:2}).nextStart).toBe(2)
    expect(readVoiceHistory([], {}).totalRecords).toBe(0)
  })
  it.each([{limit:0}, {start:-1}, {query:3}, {limit:100}, {start:1.5}])('rejects malformed arguments %j', args => {
    expect(() => readVoiceHistory(records,args)).toThrow()
  })
})
