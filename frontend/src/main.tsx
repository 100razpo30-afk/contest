import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './keycloak';
import './index.css';

keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }).then((authenticated) => {
  if (authenticated) {
    ReactDOM.createRoot(document.getElementById('app')!).render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
  }
});
