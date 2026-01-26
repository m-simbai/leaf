import { useState, useEffect } from 'react'
import Login from './Login'
import AdminLogin from './AdminLogin'
import Dashboard from './Dashboard'

function App() {
  const [user, setUser] = useState(null)
  const [isAdminRoute, setIsAdminRoute] = useState(false)

  // Check if we're on the admin route
  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname
      setIsAdminRoute(path === '/admin' || path === '/admin/')
    }
    
    checkRoute()
    window.addEventListener('popstate', checkRoute)
    return () => window.removeEventListener('popstate', checkRoute)
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
  }

  const handleLogout = () => {
    setUser(null)
    // If admin, go back to admin login, otherwise main login
    if (isAdminRoute) {
      window.history.pushState({}, '', '/admin')
    } else {
      window.history.pushState({}, '', '/')
    }
  }

  // Show appropriate login if not authenticated
  if (!user) {
    if (isAdminRoute) {
      return <AdminLogin onLogin={handleLogin} />
    }
    return <Login onLogin={handleLogin} />
  }

  // Show Dashboard if authenticated
  return <Dashboard user={user} onLogout={handleLogout} />
}

export default App
