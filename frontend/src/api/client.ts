import { translateApiMessage, translateText } from '../i18n/text';
const BASE_URL = '/api';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(translateApiMessage(message));
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const normalized = endpoint.startsWith('/api') ? endpoint.substring(4) : endpoint;
  const cleanEndpoint = normalized.startsWith('/') ? normalized : `/${normalized}`;
  const url = `${BASE_URL}${cleanEndpoint}`;
  
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> || {}),
  };

  const storedToken = typeof window !== 'undefined' ? localStorage.getItem('packpanel_token') : null;
  if (storedToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${storedToken}`;
  }

  // Only set Content-Type to application/json if body is not FormData
  if (options.body !== undefined && !(options.body instanceof FormData) && !headers['Content-Type']) {
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
    const errorMsg = data?.error || data?.message || translateText('Erreur serveur ({0})', { 0: res.status });
    throw new ApiError(errorMsg, res.status, data);
  }

  // Validation responses return an error with HTTP 200.
  if (data && typeof data === 'object' && typeof data.error === 'string') data.error = translateApiMessage(data.error);
  return data as T;
}

export const api = {
  download: async (endpoint: string) => {
    const token = localStorage.getItem('packpanel_token');
    const response = await fetch(`${BASE_URL}${endpoint}`, { credentials: 'include', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!response.ok) throw new ApiError('Téléchargement impossible', response.status);
    const filename = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] || 'launcher.zip';
    const url = URL.createObjectURL(await response.blob());
    const anchor = document.createElement('a');
    anchor.href = url; anchor.download = filename; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  },
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
