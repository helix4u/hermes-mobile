import { memo, type ReactNode } from 'react'

// Hidden tabs stay mounted (they keep their scroll, drafts and open folders),
// but re-rendering them on every App state change made typing in the chat
// composer re-render Sessions, Files and Settings per keystroke. A frozen
// subtree skips renders while it stays hidden and catches up with the latest
// props the moment it is shown again.
export const Freeze = memo(
  function Freeze({ children }: { active: boolean; children: ReactNode }) {
    return <>{children}</>
  },
  (previous, next) => !previous.active && !next.active,
)
