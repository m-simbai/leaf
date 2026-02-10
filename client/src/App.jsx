import { useState, useEffect } from 'react'
import Login from './Login'
import AdminLogin from './AdminLogin'
import Dashboard from './Dashboard'
import SetupPassword from './SetupPassword'
import ResetPassword from './ResetPassword'
import AssignmentResult from './AssignmentResult'

function App() {
  const [user, setUser] = useState(null)
  const [currentRoute, setCurrentRoute] = useState('login')

  // Check current route
  useEffect(() => {
    const checkRoute = () => {
      const path = window.location.pathname
      const search = window.location.search
      
      if (path === '/admin' || path === '/admin/') {
        setCurrentRoute('admin')
      } else if (path === '/setup-password' || path === '/setup-password/') {
        setCurrentRoute('setup-password')
      } else if (path === '/reset-password' || path === '/reset-password/') {
        setCurrentRoute('reset-password')
      } else if (path === '/assignment-result' || path === '/assignment-result/') {
        setCurrentRoute('assignment-result')
      } else {
        setCurrentRoute('login')
      }
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
    if (currentRoute === 'admin') {
      window.history.pushState({}, '', '/admin')
    } else {
      window.history.pushState({}, '', '/')
    }
  }

  // Password setup/reset pages are public (no auth required)
  if (currentRoute === 'setup-password') {
    return <SetupPassword />
  }
  
  if (currentRoute === 'reset-password') {
    return <ResetPassword />
  }
  
  if (currentRoute === 'assignment-result') {
    return <AssignmentResult />
  }

  // Show appropriate login if not authenticated
  if (!user) {
    if (currentRoute === 'admin') {
      return <AdminLogin onLogin={handleLogin} />
    }
    return <Login onLogin={handleLogin} />
  }

  // Show Dashboard if authenticated
  return <Dashboard user={user} onLogout={handleLogout} />
}

export default App

