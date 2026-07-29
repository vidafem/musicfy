import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { iOSAudioManager } from './lib/iosAudio'

// Activar desbloqueo al primer toque para iOS Safari / PWA
iOSAudioManager.unlockAudioOnFirstTouch()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

