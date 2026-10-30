import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import keycloak from './keycloak';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('app')!);

keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }).then((authenticated) => {
  if (authenticated) {
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    return;
  }

  throw new Error('Keycloak did not authenticate the user');
}).catch((error: unknown) => {
  console.error('Keycloak initialization failed', error);

  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <React.StrictMode>
      <main style={{ maxWidth: 720, margin: '64px auto', padding: 24, fontFamily: 'sans-serif' }}>
        <h1>Не удалось запустить авторизацию</h1>
        <p>{message}</p>
        <button type="button" onClick={() => window.location.assign('/')}>
          Попробовать снова
        </button>
      </main>
    </React.StrictMode>
  );
});
