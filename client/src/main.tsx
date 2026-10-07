import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './vendor/desktop/desktop-tokens.css'
import './styles.css'
import './skin/index.css'
import { applyThemeSelection, loadThemeMode } from './state/theme'
import { installKeyboardState } from './state/keyboard'

// First paint already uses the Desktop theme (App re-applies the connection's
// own choice and the host skin once it knows them), so the phone never flashes
// the light :root defaults on a dark device.
applyThemeSelection('host', null, loadThemeMode(''))
installKeyboardState(window, document)

const root = document.getElementById('root')

if (!root) {
  throw new Error('Hermes Mobile root element is missing')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
