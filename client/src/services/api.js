import { demoApi } from './demoApi';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000/api';
const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const toQueryString = (params = {}) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      query.append(key, value);
    }
  });
  const serialized = query.toString();
  return serialized ? `?${serialized}` : '';
};

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'API request failed');
  }

  return response.json();
}

const liveApi = {
  fetchSongs: (params) => request(`/songs${toQueryString(params)}`),
  fetchPlaylists: () => request('/playlists'),
  fetchRecommendations: (userId = 'demo') => request(`/users/${userId}/recommendations`),
  sendFeedback: (payload) => request('/feedback', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  health: () => request('/health'),
  register: (payload) => request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  login: (payload) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  requestPasswordReset: (email) => request('/auth/password/request', {
    method: 'POST',
    body: JSON.stringify({ email })
  }),
  resetPassword: (payload) => request('/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),
  getProfile: (token) => request('/me', { token }),
  updateProfile: (token, payload) => request('/me', {
    method: 'PUT',
    body: JSON.stringify(payload),
    token
  })
};

export const api = DEMO_MODE ? demoApi : liveApi;
