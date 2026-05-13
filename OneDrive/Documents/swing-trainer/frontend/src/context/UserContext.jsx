import React, { createContext, useContext, useState, useEffect } from 'react'
import { api, AuthError } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser]                 = useState(null)
  const [users, setUsers]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [authRequired, setAuthRequired] = useState(false)
  const [sessionEmail, setSessionEmail] = useState(null)

  useEffect(() => {
    const savedId = localStorage.getItem('activeUserId')
    Promise.all([api.users.list(), api.me().catch(() => ({ email: null }))])
      .then(([list, meData]) => {
        setUsers(list)
        setSessionEmail(meData.email)
        if (savedId) {
          const found = list.find(u => u.id === parseInt(savedId, 10))
          if (found) setUser(found)
        }
      })
      .catch(err => {
        if (err instanceof AuthError) setAuthRequired(true)
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
    <UserContext.Provider value={{ user, users, loading, authRequired, sessionEmail, switchUser, addUser }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (ctx === null) throw new Error('useUser must be used within a UserProvider')
  return ctx
}
