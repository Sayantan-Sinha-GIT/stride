export interface Env {
  DATABASE_URL: string;
  JWT_SECRET: string;
  SESSION_SECRET?: string;
  APP_ORIGIN?: string;
  API_ORIGIN?: string;
  CORS_ORIGINS?: string;
  OLA_MAPS_API_KEY?: string;
  BREVO_API_KEY?: string;
  BREVO_SENDER_EMAIL?: string;
  BREVO_SENDER_NAME?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GOOGLE_MOBILE_CLIENT_ID?: string;
  FCM_PROJECT_ID?: string;
  FCM_CLIENT_EMAIL?: string;
  FCM_PRIVATE_KEY?: string;
  STRIDE_KV?: KVNamespace;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
  handle: string;
  displayName: string;
  role: 'user' | 'admin';
  language: 'en' | 'hi';
  units: 'metric' | 'imperial';
  theme: 'light' | 'dark' | 'system';
  weightKg: number;
  sessionId?: string;
}

export type AppVariables = {
  user: AuthUser | null;
  requestId: string;
};
