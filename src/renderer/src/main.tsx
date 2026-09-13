import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App.js';
import './styles/reset.css';
import './styles/tokens.css';
import './styles/global.css';

const rootEl = document.getElementById('root');
if (!rootEl) {
  throw new Error('Root element #root not found');
}

// NOTE: We intentionally do NOT use React.StrictMode here. The app relies on
// side-effect lifecycle hooks (creating/destroying native WebContentsViews,
// MediaStream tracks, etc.) where double-invocation would cause churn and
// memory leaks in dev. Effect dependencies are explicit so we don't need
// StrictMode's intentional double-invoke for safety.
ReactDOM.createRoot(rootEl).render(<App />);
