const BASE = '/api'

export class AuthError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'AuthError'
  }
}

async function request(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 401) throw new AuthError()
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  users: {
    list:   ()         => request('GET',  '/users/'),
    create: (body)     => request('POST', '/users/', body),
    get:    (id)       => request('GET',  `/users/${id}`),
    update: (id, body) => request('PUT',  `/users/${id}`, body),
    skills: (id)       => request('GET',  `/users/${id}/skills`),
  },
  trades: {
    list:    ()         => request('GET',  '/trades/'),
    open:    (body)     => request('POST', '/trades/', body),
    close:   (id, body) => request('PUT',  `/trades/${id}/close`, body),
    debrief: (id)       => request('POST', `/trades/${id}/ai-debrief`),
  },
  playbook: {
    setups:     ()         => request('GET',    '/playbook/setups'),
    rules:      (setup)    => request('GET',    `/playbook/rules${setup ? `?setup_type=${encodeURIComponent(setup)}` : ''}`),
    createRule: (body)     => request('POST',   '/playbook/rules', body),
    updateRule: (id, body) => request('PUT',    `/playbook/rules/${id}`, body),
    deleteRule: (id)       => request('DELETE', `/playbook/rules/${id}`),
  },
  progress: {
    stats: () => request('GET', '/progress/stats'),
  },
  watchlist: {
    list:        ()         => request('GET',    '/watchlist/'),
    add:         (body)     => request('POST',   '/watchlist/', body),
    updateNotes: (id, body) => request('PUT',    `/watchlist/${id}/notes`, body),
    remove:      (id)       => request('DELETE', `/watchlist/${id}`),
  },
  market: {
    quote:   (symbol, days) => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
    candles: (symbol, days = 60) => request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}`),
  },
  curriculum: {
    list:    ()       => request('GET',    '/curriculum/'),
    check:   (item_id) => request('POST',  '/curriculum/check', { item_id }),
    uncheck: (item_id) => request('DELETE', `/curriculum/check/${encodeURIComponent(item_id)}`),
  },
  train: {
    today:       ()     => request('GET',  '/train/today'),
    generateRisk:()     => request('GET',  '/train/risk-calc/generate'),
    submitRisk:  (body) => request('POST', '/train/risk-calc/submit', body),
    submitQuiz:  (body) => request('POST', '/train/quiz/submit', body),
  },
  tips: {
    daily:   ()     => request('GET',  '/tips/daily'),
    library: ()     => request('GET',  '/tips/library'),
    ask:     (body) => request('POST', '/tips/ask', body),
  },
  me: () => request('GET', '/me'),
}
