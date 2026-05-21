import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Capacitor } from '@capacitor/core';
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite';
import { defineCustomElements as jeepSqlite } from 'jeep-sqlite/loader'
import { defineCustomElements as pwaElements } from '@ionic/pwa-elements/loader'
import App from './App.tsx'
import './index.css'

async function bootstrap() {
  if (Capacitor.getPlatform() === 'web') {
    // 1. Define the jeep-sqlite custom element
    await jeepSqlite(window);
    pwaElements(window);

    // 2. Create and add the jeep-sqlite element to the DOM BEFORE React renders
    const jeepEl = document.createElement('jeep-sqlite');
    document.body.appendChild(jeepEl);

    // 3. Wait for the custom element to be fully defined
    await customElements.whenDefined('jeep-sqlite');

    // 4. Initialize the web store BEFORE any React component mounts
    const sqlite = new SQLiteConnection(CapacitorSQLite);
    await sqlite.initWebStore();
  }

  createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </React.StrictMode>,
  )
}

bootstrap();
