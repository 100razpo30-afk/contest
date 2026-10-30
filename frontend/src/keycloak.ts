import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'https://keycloak.local.lan',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'kontent',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'contest',
});

export default keycloak;
