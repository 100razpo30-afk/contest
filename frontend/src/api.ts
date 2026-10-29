import axios, { InternalAxiosRequestConfig, AxiosResponse } from 'axios';
import keycloak from './keycloak';

const api = axios.create({
  baseURL: '',
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  try {
    await keycloak.updateToken(30);
  } catch {
    keycloak.login();
    return Promise.reject('Token refresh failed');
  }
  config.headers.Authorization = `Bearer ${keycloak.token}`;
  return config;
});

api.interceptors.response.use(
  (res: AxiosResponse) => res,
  (err: any) => {
    if (err.response?.status === 401) {
      keycloak.login();
    }
    return Promise.reject(err);
  }
);

export default api;
