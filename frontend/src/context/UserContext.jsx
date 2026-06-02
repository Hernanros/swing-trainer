import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getMe, getCurrentUser, NotFoundError } from '../api'

const UserContext = createContext(null)

export function UserProvider({ children }) {
  const [user, setUser]       = useState(null)
  const [status, setStatus]   = useState(null)
  const [email, setEmail]     = useState(null)
  const [loading, setLoading] = useState(true)

  const fetchSession = useCallback(async () => {
    setLoading(true)
    try {
      const meData = await getMe()
      if (!meData) {
        setStatus(null)
        setEmail(null)
        setUser(null)
        return
      }

      setEmail(meData.email)
      setStatus(meData.status)

      if (meData.status === 'active' || meData.status === 'admin') {
        try {
          const userRow = await getCurrentUser()
          setUser(userRow)
        } catch (err) {
          if (err instanceof NotFoundError) {
            setUser(null) // onboarding screen will show
          } else {
            throw err
          }
        }
      } else {
        setUser(null)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  return (
    <UserContext.Provider value={{ user, status, email, loading, refreshUser: fetchSession }}>
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  const ctx = useContext(UserContext)
  if (ctx === null) throw new Error('useUser must be used within a UserProvider')
  return ctx
}
