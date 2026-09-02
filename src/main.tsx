import React from 'react'
import ReactDOM from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
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

// `reducedMotion="user"` folgt dem Systemwunsch „Bewegung reduzieren".
//
// Der zweite Hebel neben der Media Query in `style.css`: Framer Motion
// animiert ueber Inline-Styles, die keine Media Query erreicht. Ohne das
// hier blieben Drawer, Dialoge und Reiterwechsel weiter geraeumlich
// bewegt, obwohl das System etwas anderes sagt. Deckkraft bleibt erlaubt —
// ohne sie faende man den Fokus nicht wieder.
ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <AppStateProvider>
        {isTimerOverlay ? <TimerOverlay /> : <App />}
      </AppStateProvider>
    </MotionConfig>
  </React.StrictMode>
)
