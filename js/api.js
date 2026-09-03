/**
 * Centralized API configuration. Every other frontend JS file imports
 * from this constant instead of hardcoding the backend URL, so the whole
 * site can be re-pointed at a different backend by editing one line.
 */
const API_BASE_URL = 'https://mainhandles.onrender.com';

const TOKEN_KEY = 'handles_token';
const USER_KEY = 'handles_user';

const Auth = {
  getToken() {
    return localStorage.getItem(TOKEN_KEY);
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
    } catch {
      return null;
    }
  },
  clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
  isLoggedIn() {
    return !!Auth.getToken();
  },
  logout() {
    Auth.clearSession();
    window.location.href = 'login.html';
  }
};

/**
 * Wrapper around fetch() that attaches the auth token, parses JSON, and
 * throws a normal Error with a readable message on failure so callers can
 * just try/catch.
 */
async function apiRequest(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = Auth.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (err) {
    throw new Error('Could not reach the server. Please check your connection and try again.');
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    // no JSON body (e.g. 204) - fine
  }

  if (response.status === 401 && auth) {
    Auth.clearSession();
    if (!location.pathname.endsWith('login.html') && !location.pathname.endsWith('register.html') && !location.pathname.endsWith('index.html') && location.pathname !== '/') {
      window.location.href = 'login.html';
    }
  }

  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }

  return data;
}

const Api = {
  register: (name, email, password) =>
    apiRequest('/api/auth/register', { method: 'POST', body: { name, email, password }, auth: false }),
  login: (email, password) =>
    apiRequest('/api/auth/login', { method: 'POST', body: { email, password }, auth: false }),
  me: () => apiRequest('/api/auth/me'),
  updateAccount: (payload) => apiRequest('/api/auth/account', { method: 'PATCH', body: payload }),

  getDashboard: () => apiRequest('/api/dashboard'),

  listWebsites: () => apiRequest('/api/websites'),
  createWebsite: (payload) => apiRequest('/api/websites', { method: 'POST', body: payload }),
  getWebsite: (id) => apiRequest(`/api/websites/${id}`),
  updateWebsite: (id, payload) => apiRequest(`/api/websites/${id}`, { method: 'PATCH', body: payload }),
  deleteWebsite: (id) => apiRequest(`/api/websites/${id}`, { method: 'DELETE' }),

  listForms: (websiteId) => apiRequest(`/api/forms${websiteId ? `?websiteId=${encodeURIComponent(websiteId)}` : ''}`),
  createForm: (payload) => apiRequest('/api/forms', { method: 'POST', body: payload }),
  getForm: (id) => apiRequest(`/api/forms/${id}`),
  updateForm: (id, payload) => apiRequest(`/api/forms/${id}`, { method: 'PATCH', body: payload }),
  deleteForm: (id) => apiRequest(`/api/forms/${id}`, { method: 'DELETE' }),

  listSubmissions: (params = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v);
    });
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiRequest(`/api/submissions${suffix}`);
  },
  getSubmission: (id) => apiRequest(`/api/submissions/${id}`),
  markSubmission: (id, read) => apiRequest(`/api/submissions/${id}`, { method: 'PATCH', body: { read } }),
  deleteSubmission: (id) => apiRequest(`/api/submissions/${id}`, { method: 'DELETE' })
};
