import Keycloak from 'keycloak-js';

const keycloak = new Keycloak({
  url: 'https://keycloak.local:30443',
  realm: 'kontent',
  clientId: 'contest',
});

export default keycloak;
