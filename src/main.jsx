import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../appforge/app.jsx';
import './styles.css';

document.title = "Vishal's Lovable";

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
