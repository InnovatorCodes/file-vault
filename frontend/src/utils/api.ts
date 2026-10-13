// Session storage and an authenticated fetch wrapper shared by every page.

const SESSION_KEYS = ["token", "user_id", "username", "email", "first_name", "last_name", "is_admin"];

export interface LoginResponse {
  token: string;
  user_id: string;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  is_admin: boolean;
}

export const saveSession = (data: LoginResponse) => {
  localStorage.setItem("token", data.token);
  localStorage.setItem("user_id", data.user_id);
  localStorage.setItem("username", data.username);
  localStorage.setItem("email", data.email);
  localStorage.setItem("first_name", data.first_name ?? "");
  localStorage.setItem("last_name", data.last_name ?? "");
  localStorage.setItem("is_admin", String(data.is_admin));
};

export const clearSession = () => {
  SESSION_KEYS.forEach((key) => localStorage.removeItem(key));
};

export const isLoggedIn = () => !!localStorage.getItem("token");

// fetch() with the login token attached. The server reads the user from the token, so
// pages never send a user ID themselves. A 401 means the session expired or is invalid.
export const apiFetch = async (path: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  const token = localStorage.getItem("token");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && token) {
    clearSession();
    window.location.assign("/login");
  }
  return response;
};

// Pages listen for this to reload their data after an upload or delete,
// instead of reloading the whole browser tab.
export const FILES_CHANGED_EVENT = "files:changed";
export const notifyFilesChanged = () => window.dispatchEvent(new Event(FILES_CHANGED_EVENT));

// Saves a fetched file to the user's computer.
export const saveBlob = (blob: Blob, filename: string) => {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
};
