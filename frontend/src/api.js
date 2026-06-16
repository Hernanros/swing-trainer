const BASE = '/api'

export class AuthError extends Error {
  constructor() {
    super('Not authenticated')
    this.name = 'AuthError'
  }
}

export class NotFoundError extends Error {
  constructor(message) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export async function getMe() {
  const res = await fetch('/api/me', { credentials: 'include' })
  if (res.status === 401) return null
  if (!res.ok) throw new Error(`/api/me failed: ${res.status}`)
  return res.json() // { email, status, name }
}

export async function getCurrentUser() {
  const res = await fetch('/api/users/me', { credentials: 'include' })
  if (res.status === 404) throw new NotFoundError('No user profile yet')
  if (!res.ok) throw new Error(`/api/users/me failed: ${res.status}`)
  return res.json() // User row
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
    list:    ()         => request('GET',    '/trades/'),
    open:    (body)     => request('POST',   '/trades/', body),
    close:   (id, body) => request('PUT',    `/trades/${id}/close`, body),
    update:  (id, body) => request('PATCH',  `/trades/${id}`, body),
    delete:  (id)       => request('DELETE', `/trades/${id}`),
    debrief: (id)       => request('POST',   `/trades/${id}/ai-debrief`),
    spreadAdvisory: (body) => request('POST', '/trades/spread-advisory', body),
  },
  playbook: {
    setups:     ()         => request('GET',    '/playbook/setups'),
    rules:      (setup)    => request('GET',    `/playbook/rules${setup ? `?setup_type=${encodeURIComponent(setup)}` : ''}`),
    createRule: (body)     => request('POST',   '/playbook/rules', body),
    updateRule: (id, body) => request('PUT',    `/playbook/rules/${id}`, body),
    deleteRule: (id)       => request('DELETE', `/playbook/rules/${id}`),
  },
  progress: {
    stats:    () => request('GET', '/progress/stats'),
    patterns: () => request('GET', '/progress/patterns'),
    analyze:  () => request('POST', '/progress/analyze-patterns'),
    setups:   () => request('GET', '/progress/setups'),
  },
  watchlist: {
    list:        ()         => request('GET',    '/watchlist/'),
    add:         (body)     => request('POST',   '/watchlist/', body),
    updateNotes: (id, notes) => request('PUT',    `/watchlist/${id}/notes`, { notes }),
    updateTags:  (id, tags) => request('PUT',    `/watchlist/${id}/tags`, { tags }),
    remove:      (id)       => request('DELETE', `/watchlist/${id}`),
  },
  market: {
    quote:   (symbol, days) => request('GET', `/market/quote/${encodeURIComponent(symbol)}`),
    candles: (symbol, days = 60, date = null) =>
      request('GET', `/market/candles/${encodeURIComponent(symbol)}?days=${days}${date ? `&date=${date}` : ''}`),
    earnings: (symbol) => request('GET', `/market/earnings/${encodeURIComponent(symbol)}`),
  },
  curriculum: {
    list:    ()       => request('GET',    '/curriculum/'),
    check:   (item_id) => request('POST',  '/curriculum/check', { item_id }),
    uncheck: (item_id) => request('DELETE', `/curriculum/check/${encodeURIComponent(item_id)}`),
  },
  train: {
    today:           ()         => request('GET',  '/train/today'),
    generateRisk:    ()         => request('GET',  '/train/risk-calc/generate'),
    submitRisk:      (body)     => request('POST', '/train/risk-calc/submit', body),
    submitQuiz:      (body)     => request('POST', '/train/quiz/submit', body),
    aiDrill:         (body)     => request('POST', '/train/ai-drill', body),
    getMastery:      (drillKey) => request('GET',  `/train/mastery/${encodeURIComponent(drillKey)}`),
    getAllMastery:    ()         => request('GET',  '/train/mastery/all'),
  },
  tips: {
    daily:   ()     => request('GET',  '/tips/daily'),
    library: ()     => request('GET',  '/tips/library'),
    ask:     (body) => request('POST', '/tips/ask', body),
  },
  bull: {
    getProfile:         ()     => request('GET',  '/bull/profile'),
    putProfile:         (body) => request('PUT',  '/bull/profile', body),
    latestScan:         ()     => request('GET',  '/bull/scan/latest'),
    runScan:            ()     => request('POST', '/bull/scan/run', {}),
    chat:               (body) => request('POST', '/bull/chat', body),
    assistantPlaybook:  ()     => request('GET',  '/bull/assistant-playbook'),
    seedPlaybook:       ()     => request('POST', '/bull/seed-playbook', {}),
  },
  paperAccount: {
    get:        ()     => request('GET', '/paper-account'),
    setBalance: (body) => request('PUT', '/paper-account/balance', body),
  },
  me: () => request('GET', '/me'),
}
