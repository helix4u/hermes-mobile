import { useEffect, useRef, useState } from 'react'
import { appendCronOutput, pollCron, type CronClient, type CronOutput, type CronOutputPage } from '../cron'

export function CronOutputs({ client, jobId, active }: { client: CronClient | null; jobId: string; active: boolean }) {
  const [outputs, setOutputs] = useState<CronOutput[]>([])
  const [before, setBefore] = useState<string | null>(null)
  const [selected, setSelected] = useState<CronOutput | null>(null)
  const [page, setPage] = useState<CronOutputPage | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const epoch = useRef(0)
  const historyInitialized = useRef(false)
  useEffect(() => {
    ++epoch.current
    historyInitialized.current = false
    setOutputs([]); setBefore(null); setSelected(null); setPage(null); setError(''); setPending(false)
    if (!active || !client) return
    const stop = pollCron(() => client.outputs(jobId), result => {
      setOutputs(current => [...result.outputs, ...current.filter(row => !result.outputs.some(fresh => fresh.id === row.id))])
      if (!historyInitialized.current) { historyInitialized.current = true; setBefore(result.next_before) }
    }, reason => setError(String(reason)))
    return () => { ++epoch.current; stop() }
  }, [active, client, jobId])

  async function read(output: CronOutput, offset = 0) {
    if (!client || !active) return
    const request = ++epoch.current
    setPending(true); setError('')
    if (offset === 0) { setSelected(output); setPage(null) }
    try {
      const next = await client.output(jobId, output, offset)
      if (request === epoch.current) setPage(appendCronOutput(offset ? page : null, next))
    } catch (reason) { if (request === epoch.current) setError(String(reason)) }
    finally { if (request === epoch.current) setPending(false) }
  }

  return <section className="cron-output" aria-label="Saved cron output">
    <h3>Saved output</h3>
    <p>Includes script-only results. New completed output appears as the host saves it.</p>
    {!outputs.length && <p>No saved output yet.</p>}
    <div className="cron-output-list">
      {outputs.map(output => <button className="quiet-button" type="button" key={output.id} disabled={!active} onClick={() => void read(output)}>
        {output.id} ({output.size_bytes.toLocaleString()} bytes)
      </button>)}
      {before && <button className="quiet-button" type="button" disabled={pending || !active} onClick={() => {
        if (!client) return
        const request = epoch.current
        setPending(true)
        void client.outputs(jobId, before).then(result => {
          if (request !== epoch.current) return
          setOutputs(current => [...current, ...result.outputs.filter(row => !current.some(old => old.id === row.id))])
          setBefore(result.next_before)
        }).catch(reason => { if (request === epoch.current) setError(String(reason)) })
          .finally(() => { if (request === epoch.current) setPending(false) })
      }}>Older output</button>}
    </div>
    {error && <p role="alert">{error}</p>}
    {pending && <p role="status">Loading output...</p>}
    {page && <div className="cron-output-content">
      <pre>{page.content}</pre>
      {page.next_offset !== null && <button className="quiet-button" type="button" disabled={pending || !active} onClick={() => { if (selected) void read(selected, page.next_offset!) }}>Load more output</button>}
      {page.next_offset === null && <p>End of saved output.</p>}
    </div>}
  </section>
}
