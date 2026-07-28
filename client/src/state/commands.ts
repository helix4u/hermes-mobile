export interface CommandParts {
  name: string
  arg: string
}

export function commandParts(command: string): CommandParts {
  const [name = '', ...rest] = command.trim().replace(/^\/+/, '').split(/\s+/)
  return { name: name.toLowerCase(), arg: rest.join(' ') }
}

export function aliasCommand(target: string, originalCommand: string): string {
  const { arg } = commandParts(originalCommand)
  return `/${target}${arg ? ` ${arg}` : ''}`
}
