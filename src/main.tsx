import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import { defineCustomElements as pwaElements } from '@ionic/pwa-elements/loader'
import App from './App.tsx'
import './index.css'

if (Capacitor.getPlatform() === 'web') {
  jeepSqlite(window);
  pwaElements(window);
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
)
