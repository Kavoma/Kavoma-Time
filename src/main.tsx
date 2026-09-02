import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { TimerOverlay } from './components/TimerOverlay'
import { AppStateProvider } from './state/AppStateContext'
import { applyStoredHint } from './utils/theme'
import './style.css'

const isTimerOverlay = new URLSearchParams(window.location.search).get('overlay') === 'timer';

// Thema setzen, bevor React rendert. Der AppState kommt asynchron aus dem
// electron-store — genau diese Wartezeit wuerde man sonst als Aufblitzen des
// falschen Themas sehen. Der Hinweis stammt aus `localStorage` und wird vom
// geladenen Zustand Millisekunden spaeter bestaetigt oder korrigiert.
//
// Das Overlay bleibt fest dunkel: eigenes transparentes Fenster, eigene
// Farben, nimmt am Themensystem nicht teil.
if (isTimerOverlay) {
  document.documentElement.dataset.theme = 'dark';
} else {
  applyStoredHint();
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <AppStateProvider>
      {isTimerOverlay ? <TimerOverlay /> : <App />}
    </AppStateProvider>
  </React.StrictMode>
)
