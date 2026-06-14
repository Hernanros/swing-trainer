import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { UserProvider, useUser } from './context/UserContext'
import Sidebar from './components/Sidebar'
import BottomNav from './components/BottomNav'
import Onboarding from './components/Onboarding'
import Login from './components/Login'
import Pending from './components/Pending'
import Rejected from './components/Rejected'
import Home from './pages/Home'
import Train from './pages/Train'
import Journal from './pages/Journal'
import Playbook from './pages/Playbook'
import Watchlist from './pages/Watchlist'
import Progress from './pages/Progress'
import Tips from './pages/Tips'
import Curriculum from './pages/Curriculum'
import Admin from './pages/Admin'
import Account from './pages/Account'
import Bull from './pages/Bull'

function AppShell() {
  const { user, status, loading } = useUser()

  React.useEffect(() => {
    const saved = localStorage.getItem("theme") || "dark";
    document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
  }, []);

  if (loading)                  return <div className="loading">Loading…</div>
  if (status === null)          return <Login />
  if (status === "pending")     return <Pending />
  if (status === "rejected")    return <Rejected />
  if (!user)                    return <Onboarding />

  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"          element={<Home />} />
          <Route path="/train"     element={<Train />} />
          <Route path="/journal/*" element={<Journal />} />
          <Route path="/playbook"  element={<Playbook />} />
          <Route path="/watchlist" element={<Watchlist />} />
          <Route path="/progress"  element={<Progress />} />
          <Route path="/bull"      element={<Bull />} />
          <Route path="/tips"       element={<Tips />} />
          <Route path="/curriculum" element={<Curriculum />} />
          <Route path="/admin"      element={status === "admin" ? <Admin /> : <Navigate to="/" replace />} />
          <Route path="/account"   element={<Account />} />
          <Route path="*"          element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </div>
  )
}

export default function App() {
  return (
    <UserProvider>
      <AppShell />
    </UserProvider>
  )
}
