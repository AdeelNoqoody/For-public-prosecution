import '@fontsource-variable/cairo';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { applyBrandingTheme } from './config/branding';

applyBrandingTheme();

// Touch kiosk hygiene: no context menu, no drag-and-drop of images/links.
window.addEventListener('contextmenu', (event) => event.preventDefault());
window.addEventListener('dragstart', (event) => event.preventDefault());

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
