/** Execute the actual client builders and RPC serializer with synthetic inputs.
 * No socket, credentials, provider or private application state is accessed.
 */
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import ts from 'typescript'
const { values } = parseArgs({ options: { out: { type: 'string' } } })
const sourceRoot = fileURLToPath(new URL('../../client/src/', import.meta.url))
const loaded = new Map()
function load(relative) {
  const filename = path.resolve(sourceRoot, relative)
  if (!filename.startsWith(sourceRoot)) throw new Error('Builder escaped client source')
  if (loaded.has(filename)) return loaded.get(filename)
  const result = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  })
  const exports = {}
  loaded.set(filename, exports)
  vm.runInNewContext(result.outputText, { exports, setTimeout, clearTimeout,
    require: spec => {
      if (!spec.startsWith('.')) throw new Error(`Unexpected builder dependency: ${spec}`)
      return load(path.relative(sourceRoot, path.resolve(path.dirname(filename), `${spec}.ts`)))
    },
  }, { filename })
  return exports
}
const { sessionCreateParams } = load('state/workspace.ts')
const { sharedImageAttachParams } = load('state/share.ts')
const { scopedRpcParams } = load('profiles.ts')
const { realtimeSettingsParams } = load('pet-realtime-settings.ts')
const { sendRequestResponse } = load('request-response.ts')
const { JsonRpcGatewayClient } = load('protocol/json-rpc-client.ts')
const frames = []
class Socket extends EventTarget {
  readyState = 1
  send(raw) {
    const frame = JSON.parse(raw)
    frames.push({ method: frame.method, params: frame.params })
    queueMicrotask(() => this.dispatchEvent(new MessageEvent('message', {
      data: JSON.stringify({ jsonrpc: '2.0', id: frame.id, result: {} }),
    })))
  }
  close() { this.readyState = 3 }
}
for (const profile of ['default', 'writer']) {
  const socket = new Socket()
  const gateway = new JsonRpcGatewayClient(() => socket, 1000, params => scopedRpcParams(profile, params))
  const connected = gateway.connect('ws://synthetic.invalid')
  socket.dispatchEvent(new Event('open'))
  await connected
  for (const preview of ['', 'Synthetic first message', 'Synthetic shared image question']) {
    await gateway.request('session.create', sessionCreateParams({ profile, cwd: '', preview }))
  }
  await gateway.request('image.attach_bytes', sharedImageAttachParams(
    { kind: 'image', name: 'synthetic.png' }, 'data:image/png;base64,AAAA', 'synthetic-runtime'))
  for (const engine of ['realtime', 'live']) {
    await gateway.request('pet.realtime.session', {
      ...realtimeSettingsParams({ engine, model: 'gpt-realtime-2.1-mini', effort: 'high', mode: 'session', noiseReduction: 'far_field' }),
      session_id: 'synthetic-runtime', personalityId: 'synthetic', prompt: 'Be concise.', voice: 'shimmer',
    })
  }
  for (const kind of ['approval', 'clarify', 'sudo', 'secret']) {
    await sendRequestResponse(gateway, { kind, requestId: `synthetic-${kind}`, sessionId: 'synthetic-runtime', answered: false },
      kind === 'approval' ? 'approve' : 'synthetic-test-input', 'synthetic-runtime')
  }
  await gateway.request('prompt.submit', { session_id: 'synthetic-runtime', text: 'Synthetic first message', busy_mode: 'steer' })
  gateway.disconnect()
}
const output = JSON.stringify({ schema: 1, source: 'executed-client-builders-and-serializer', frames }, null, 2) + '\n'
if (values.out) fs.writeFileSync(path.resolve(values.out), output)
else process.stdout.write(output)
