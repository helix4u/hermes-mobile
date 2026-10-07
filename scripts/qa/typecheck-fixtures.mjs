import ts from 'typescript'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const configPath = fileURLToPath(new URL('../../client/tsconfig.json', import.meta.url))
const config = ts.readConfigFile(configPath, ts.sys.readFile)
if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'))
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath))
const fixtures = process.argv.slice(2).map(file => path.resolve(file))
if (!fixtures.length) throw Error('Provide explicit QA fixture paths')
const program = ts.createProgram([...parsed.fileNames, ...fixtures], { ...parsed.options, noEmit: true })
const diagnostics = ts.getPreEmitDiagnostics(program)
if (diagnostics.length) console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName: file => file, getCurrentDirectory: ts.sys.getCurrentDirectory, getNewLine: () => '\n',
}))
else console.log(`Project and ${fixtures.length} explicit fixtures typecheck passed`)
process.exitCode = diagnostics.length ? 1 : 0
