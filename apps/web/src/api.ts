import { en, type ApiError, type DeliveryStatus } from '@doorlivery/shared';

export interface Delivery {
  id: string;
  status: DeliveryStatus;
  customer_name: string | null; // null once removed by the retention job
  customer_phone: string | null;
  pickup_note: string;
  item_note: string | null;
  rider_phone: string | null;
  dropoff_postcode: string | null;
  dropoff_confidence: string | null;
  landmark_note: string | null;
  code_locked: boolean;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DeliveryEvent {
  event_type: string;
  actor: string;
  occurred_at: string;
}

export interface DeliveryDetail extends Delivery {
  events: DeliveryEvent[];
}

export interface DeliveryPage {
  data: Delivery[];
  page: number;
  limit: number;
  total: number;
}

export interface Me {
  id: string;
  email: string;
  business_name: string;
}

export interface ShareLink {
  link: string;
  whatsapp_url: string;
}

export class RequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
  }
}

// Called on any 401 so the app can drop back to the login screen.
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new RequestError(en.vendor.offline, 0);
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/api/auth/login') onUnauthorized();
    throw new RequestError(data?.message ?? en.vendor.errorGeneric, res.status, data?.code);
  }
  return data as T;
}

export const api = {
  me: () => request<Me>('GET', '/api/auth/me'),
  login: (email: string, password: string) => request<void>('POST', '/api/auth/login', { email, password }),
  logout: () => request<void>('POST', '/api/auth/logout'),
  list: (page: number) => request<DeliveryPage>('GET', `/api/deliveries?page=${page}&limit=20`),
  get: (id: string) => request<DeliveryDetail>('GET', `/api/deliveries/${encodeURIComponent(id)}`),
  create: (body: Record<string, string>) => request<Delivery>('POST', '/api/deliveries', body),
  customerLink: (id: string) => request<ShareLink>('POST', `/api/deliveries/${encodeURIComponent(id)}/customer-link`),
  assign: (id: string, rider_phone?: string) =>
    request<ShareLink>('POST', `/api/deliveries/${encodeURIComponent(id)}/assign`, { rider_phone }),
  cancel: (id: string) => request<Delivery>('POST', `/api/deliveries/${encodeURIComponent(id)}/cancel`),
  unlockCode: (id: string) => request<Delivery>('POST', `/api/deliveries/${encodeURIComponent(id)}/unlock-code`),
};
