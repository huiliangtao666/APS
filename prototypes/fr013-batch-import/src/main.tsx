import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import './praetor-bridge';
// install-bridge.sh adds the praetor-bridge boot import above this line so
// the Praetor app-bridge starts on load (idempotent — safe to re-run).

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
