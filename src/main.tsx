import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { TimerOverlay } from './components/TimerOverlay'
import { AppStateProvider } from './state/AppStateContext'
import './style.css'

const isTimerOverlay = new URLSearchParams(window.location.search).get('overlay') === 'timer';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStateProvider>
      {isTimerOverlay ? <TimerOverlay /> : <App />}
    </AppStateProvider>
  </React.StrictMode>
)
