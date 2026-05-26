import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { PopupApp } from './popup-app';
import './style.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PopupApp />
  </StrictMode>,
);

