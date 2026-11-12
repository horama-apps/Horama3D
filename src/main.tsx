import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './i18n';
import './styles.css';
import './studio.css';
import './printing-calculator/studioCalculator.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
