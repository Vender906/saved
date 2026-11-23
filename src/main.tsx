import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyTheme, readPref, THEMES } from './prefs';
import './styles.css';

// Тема — до першого малювання, щоб не блимало
const theme = readPref('theme', 'dark', THEMES);
applyTheme(theme);
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const t = readPref('theme', 'dark', THEMES);
  if (t === 'system') applyTheme(t);
});

if (import.meta.env.DEV && location.hash === '#demo') {
  void import('./demo').then((m) => m.seedDemo());
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
