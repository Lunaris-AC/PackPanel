const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  // Only set Content-Type to application/json if body is not FormData
  if (!(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include'
  });

  if (res.status === 204) {
    return {} as T;
  }

  let data: any;
  const contentType = res.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Erreur serveur (${res.status})`;
    throw new ApiError(errorMsg, res.status, data);
  }

  return data as T;
}

export const api = {
  get: <T = any>(url: string, params?: Record<string, any>) => {
    let query = '';
    if (params) {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null && v !== '') {
          sp.append(k, String(v));
        }
      }
      const qs = sp.toString();
      if (qs) query = `?${qs}`;
    }
    return request<T>(`${url}${query}`, { method: 'GET' });
  },

  post: <T = any>(url: string, body?: any) => {
    return request<T>(url, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  put: <T = any>(url: string, body?: any) => {
    return request<T>(url, {
      method: 'PUT',
      body: body instanceof FormData ? body : JSON.stringify(body)
    });
  },

  delete: <T = any>(url: string) => {
    return request<T>(url, { method: 'DELETE' });
  }
};
