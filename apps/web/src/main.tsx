import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { registerServiceWorker } from './pwa/register-service-worker'
import 'plyr/dist/plyr.css'
import './styles.css'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('LiveTV root element was not found')
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

registerServiceWorker()
