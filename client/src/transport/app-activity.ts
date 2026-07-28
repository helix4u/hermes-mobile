export function becameActive(
  wasActive: boolean,
  isActive: boolean,
): boolean {
  return !wasActive && isActive
}

export function usesDocumentVisibility(nativeClient: boolean): boolean {
  return !nativeClient
}
