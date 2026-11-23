import { SERVER_URL } from "../config/gameConfig";
import type { CharacterSummary } from "../types";

/**
 * Thin client for the server's /auth endpoints.
 *
 * The server answers with one short-lived-ish session token; it is stored in
 * localStorage so a refresh can resume the session, and is handed to Colyseus
 * when joining the game room.
 */

export interface AuthAccount {
  id: string;
  username: string;
}

export interface AuthSession {
  token: string;
  expiresAt: number;
  account: AuthAccount;
}

const SESSION_STORAGE_KEY = "pixel-realms:session";

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.code = code;
  }
}

interface ErrorBody {
  error?: string;
  message?: string;
}

const FALLBACK_MESSAGES: Record<number, string> = {
  400: "Check your username and password.",
  401: "Wrong username or password.",
  409: "That username is already taken.",
  429: "Too many attempts. Try again in a minute.",
  503: "Accounts are unavailable right now.",
};

async function request<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${SERVER_URL}/auth${path}`, init);
  } catch {
    throw new AuthError(0, "network", "Cannot reach the server. Is it running?");
  }

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    // Non-JSON responses (proxies, gateway errors) fall back to status text.
  }

  if (!response.ok) {
    const payload = body as ErrorBody | null;
    throw new AuthError(
      response.status,
      payload?.error ?? "error",
      payload?.message ?? FALLBACK_MESSAGES[response.status] ?? "Something went wrong. Try again.",
    );
  }

  return body as T;
}

function submitCredentials(path: "/register" | "/login", username: string, password: string): Promise<AuthSession> {
  return request<AuthSession>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

export function register(username: string, password: string): Promise<AuthSession> {
  return submitCredentials("/register", username, password);
}

export function login(username: string, password: string): Promise<AuthSession> {
  return submitCredentials("/login", username, password);
}

export function devLogin(): Promise<AuthSession> {
  return request<AuthSession>("/dev-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

/** Confirms a stored token is still valid on the server. */
export async function fetchMe(token: string): Promise<AuthAccount> {
  const body = await request<{ account: AuthAccount }>("/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  return body.account;
}

export function saveSession(session: AuthSession): void {
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable (private mode); the session still works for
    // this tab because the scene keeps it in memory.
  }
}

export function clearSession(): void {
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
}

/** Returns the stored session, dropping it when malformed or expired. */
export function loadSession(): AuthSession | null {
  let raw: string | null = null;

  try {
    raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }

  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<AuthSession>;
    const token = parsed.token;
    const expiresAt = parsed.expiresAt;
    const account = parsed.account;

    if (typeof token !== "string" || token.length === 0) return null;
    if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;
    if (expiresAt <= Date.now()) return null;
    if (!account || typeof account.id !== "string" || typeof account.username !== "string") return null;

    return { token, expiresAt, account: { id: account.id, username: account.username } };
  } catch {
    clearSession();
    return null;
  }
}

export async function fetchCharacters(token: string): Promise<CharacterSummary[]> {
  const body = await request<{ characters: CharacterSummary[] }>("/characters", {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  return body.characters;
}

export async function createCharacter(token: string, name: string): Promise<CharacterSummary> {
  const body = await request<{ character: CharacterSummary }>("/characters", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  return body.character;
}

export async function deleteCharacter(token: string, id: number): Promise<void> {
  await request<{ deleted: boolean }>(`/characters/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

