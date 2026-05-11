import React, { createContext, useContext, useState, useEffect } from 'react'
import { api, AuthError } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [authRequired, setAuthRequired] = useState(false)

  useEffect(() => {
    const savedId = localStorage.getItem('activeUserId')
    api.users.list()
      .then(list => {
        setUsers(list)
        if (savedId) {
          const found = list.find(u => u.id === parseInt(savedId, 10))
          if (found) setUser(found)
        }
      })
      .catch(err => {
        if (err instanceof AuthError) setAuthRequired(true)
        // other errors: backend unreachable — stays at empty state, onboarding renders
      })
      .finally(() => setLoading(false))
  }, [])

  function switchUser(u) {
    setUser(u)
    localStorage.setItem('activeUserId', String(u.id))
  }

  function addUser(u) {
    setUsers(prev => [...prev, u])
    switchUser(u)
  }

  return (
    <UserContext.Provider value={{ user, users, loading, authRequired, switchUser, addUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (ctx === null) throw new Error('useUser must be used within a UserProvider')
  return ctx
}
