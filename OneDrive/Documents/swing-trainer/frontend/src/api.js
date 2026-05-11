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
  return res.json()
}

export const api = {
  users: {
    list: () => request('GET', '/users/'),
    create: (body) => request('POST', '/users/', body),
    get: (id) => request('GET', `/users/${id}`),
    update: (id, body) => request('PUT', `/users/${id}`, body),
    skills: (id) => request('GET', `/users/${id}/skills`),
  },
}
