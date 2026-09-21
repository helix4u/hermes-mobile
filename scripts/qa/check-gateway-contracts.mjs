/** Offline reconciliation diagnostic, not a substitute for dispatched behavior tests.
 * Uses the host's generated public OpenRPC document, never private backend imports.
 * Example: node scripts/qa/check-gateway-contracts.mjs --contracts <openrpc.json>
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import ts from 'typescript'

const root = fileURLToPath(new URL('../../', import.meta.url))
const { values } = parseArgs({ options: {
  contracts: { type: 'string' }, project: { type: 'string' },
  surface: { type: 'string', default: 'mobile' }, out: { type: 'string' },
} })
if (!values.contracts) throw new Error('Pass --contracts with the target host OpenRPC JSON path')
if (!['mobile', 'desktop'].includes(values.surface)) throw new Error('Unknown surface')
const project = path.resolve(values.project || path.join(root, 'client')).replaceAll('\\', '/')
const document = JSON.parse(fs.readFileSync(values.contracts, 'utf8'))
const contracts = new Map(document.methods.map(method => {
  const ref = method.params?.[0]?.schema?.$ref
  const schema = ref?.startsWith('#/components/schemas/')
    ? document.components.schemas[ref.slice('#/components/schemas/'.length)]
    : method.params?.[0]?.schema
  if (!schema) throw new Error(`Missing parameter schema: ${method.name}`)
  return [method.name, schema]
}))
const configPath = ts.findConfigFile(project, ts.sys.fileExists, 'tsconfig.json')
if (!configPath) throw new Error('No TypeScript project found')
const config = ts.readConfigFile(configPath, ts.sys.readFile)
if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, project)
const program = ts.createProgram(parsed.fileNames, parsed.options)
const checker = program.getTypeChecker()
const calls = [], unresolved = []
const literals = node => {
  const type = checker.getTypeAtLocation(node)
  return (type.isUnion() ? type.types : [type]).filter(t => t.isStringLiteral()).map(t => t.value)
}
for (const file of program.getSourceFiles()) {
  if (!file.fileName.replaceAll('\\', '/').startsWith(`${project}/src/`) || /\.(test|spec)\./.test(file.fileName)) continue
  const location = node => ({ file: path.relative(project, file.fileName).replaceAll('\\', '/'),
    line: file.getLineAndCharacterOfPosition(node.getStart()).line + 1 })
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const index = node.arguments.findIndex(arg => literals(arg).some(name => contracts.has(name)))
      if (index >= 0) {
        const arg = node.arguments[index + 1]
        const fields = arg ? checker.getTypeAtLocation(arg).getProperties().map(p => p.getName()) : []
        const scoped = values.surface === 'mobile' || /ForProfile|ForAgent|ForBot|ForOwnedSession|ForSessionProfile|ForPetSession|requestForBot/.test(node.expression.getText(file))
        for (const method of literals(node.arguments[index]).filter(name => contracts.has(name))) {
          const schema = contracts.get(method)
          const wireFields = [...new Set([...fields, ...(scoped ? ['profile'] : [])])]
          calls.push({ ...location(node), method, fields: wireFields,
            unknown: schema.additionalProperties === true ? [] : wireFields.filter(key => !(key in (schema.properties || {}))),
            dynamicPayload: Boolean(arg) && fields.length === 0 })
        }
      } else if (/^(?:.*\.)?(?:request|requestGateway|requestForOwnedSession|requestGatewayForProfile|requestForPetSession|requestForBot)$/.test(node.expression.getText(file))) {
        const arg = node.arguments[0]
        for (const method of arg ? literals(arg) : []) {
          // gateway.ping is implemented by the WebSocket transport itself.
          if (/^[a-z][a-z_]*(?:\.[a-z_]+)+$/.test(method) && method !== 'gateway.ping') {
            calls.push({ ...location(node), method, fields: [], unknown: ['<undeclared method>'], dynamicPayload: false })
          }
        }
        unresolved.push({ ...location(node), callee: node.expression.getText(file),
          argumentType: arg ? checker.typeToString(checker.getTypeAtLocation(arg)) : '' })
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
}
const mismatches = calls.filter(call => call.unknown.length)
const report = { schema: 1, layer: 'static-wire-diagnostic', surface: values.surface,
  callSites: calls.length, mismatches, unresolved, calls,
  limitation: 'Dynamic methods/payloads require review. Handler behavior and profile isolation need dispatched tests.' }
if (values.out) fs.writeFileSync(path.resolve(values.out), JSON.stringify(report, null, 2))
console.log(JSON.stringify({ callSites: calls.length, mismatches, unresolvedCount: unresolved.length,
  dynamicPayloads: calls.filter(call => call.dynamicPayload).length, limitation: report.limitation }, null, 2))
process.exitCode = mismatches.length ? 1 : 0
