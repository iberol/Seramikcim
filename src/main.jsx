/**
 * main.jsx — React entry point for R3F scene
 *
 * R3F sahnesi #viewer-canvas div'ine mount edilir (tam ekran).
 * Legacy main.js paralel çalışır ve panel/event/state mantığını yönetir;
 * 3D rendering tamamen R3F tarafına devredilmiştir.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.jsx';
import 'bootstrap/dist/css/bootstrap.min.css';

const container = document.getElementById('viewer-canvas');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
