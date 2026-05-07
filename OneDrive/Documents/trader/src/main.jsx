import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// ── window.storage polyfill (replaces claude.ai's built-in storage) ──────────
// The app uses window.storage.get/set/delete with an async API that returns
// { value: string } on get. We implement it over localStorage.
window.storage = {
  get: async (key) => {
    const value = localStorage.getItem(key);
    return value !== null ? { value } : null;
  },
  set: async (key, value) => {
    localStorage.setItem(key, value);
  },
  delete: async (key) => {
    localStorage.removeItem(key);
  },
};

// ── Anthropic API key injection ───────────────────────────────────────────────
// The app calls api.anthropic.com directly without an Authorization header
// (works inside claude.ai artifacts which inject it automatically).
// Here we intercept those requests and add the key from the .env file.
const _fetch = window.fetch.bind(window);
window.fetch = (url, options = {}) => {
  if (typeof url === "string" && url.includes("api.anthropic.com")) {
    const key = import.meta.env.VITE_ANTHROPIC_API_KEY;
    if (key) {
      options = {
        ...options,
        headers: {
          ...options.headers,
          Authorization: `Bearer ${key}`,
          "anthropic-dangerous-direct-browser-access": "true",
        },
      };
    }
  }
  return _fetch(url, options);
};

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
