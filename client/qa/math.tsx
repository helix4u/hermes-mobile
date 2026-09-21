import React from 'react'
import { createRoot } from 'react-dom/client'
import { MarkdownContent } from '../src/components/MarkdownContent'
import '../src/styles.css'

const text = String.raw`# Equation rendering

Inline \(a^2+b^2=c^2\) stays alongside normal text.

\[ -\log_2 P(\text{symbol}\mid\text{history}) \]

\[ \text{better estimates} \rightarrow \text{less uncertainty} \rightarrow \text{shorter representation} \]

$$
\begin{pmatrix} a & b \\ c & d \end{pmatrix}
$$

Invalid input remains readable: $\frac{a$

Code stays literal: ` + '`\\(x^2\\)`' + String.raw`

The composer below must remain inside the viewport.`
createRoot(document.getElementById('root')!).render(
  <main style={{ display: 'flex', flexDirection: 'column', height: '100dvh', minWidth: 0, padding: 16, boxSizing: 'border-box' }}>
    <section style={{ flex: 1, minHeight: 0, minWidth: 0, overflowY: 'auto' }}>
      <MarkdownContent>{text}</MarkdownContent>
    </section>
    <textarea aria-label="Composer" style={{ width: '100%', boxSizing: 'border-box', flex: '0 0 48px' }} />
  </main>,
)
