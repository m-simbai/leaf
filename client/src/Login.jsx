import { useState, useEffect } from 'react'
import { Sun, Moon, Eye, EyeOff, Users, UserCog, ArrowRight, Calendar, Clock, CheckCircle, Shield } from 'lucide-react'
import './Login.css'

function Login({ onLogin }) {
  const [isDarkMode, setIsDarkMode] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('staff')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    document.body.classList.toggle('light-mode', !isDarkMode)
    document.body.classList.toggle('dark-mode', isDarkMode)
  }, [isDarkMode])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!username || !password) {
      setError('Please fill in all fields')
      return
    }

    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Login failed')
      }
      
      if (data.success && data.user) {
        if (onLogin) {
          onLogin(data.user)
        }
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className={`login-page ${isDarkMode ? 'dark' : 'light'}`}>
      {/* Theme Toggle - Top Right */}
      <button 
        className="theme-toggle"
        onClick={() => setIsDarkMode(!isDarkMode)}
        aria-label="Toggle theme"
      >
        {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
      </button>

      {/* Left Panel - Branding (Desktop Only) */}
      <div className="branding-panel">
        <div className="branding-content">
          {/* Animated Background Elements */}
          <div className="bg-shapes">
            <div className="shape shape-1"></div>
            <div className="shape shape-2"></div>
            <div className="shape shape-3"></div>
          </div>

          {/* Logo Header */}
          <div className="brand-header-flex">
            <div className="brand-logo">
              <img src={isDarkMode ? "/logo-dark.png" : "/logo-light.png"} alt="Leaf Tracker" className="brand-logo-img" />
            </div>
            <h1 className="brand-title">Leaf Tracker</h1>
          </div>
          <p className="brand-tagline">Streamline your leave management with ease</p>

          {/* Feature List */}
          <div className="feature-list">
            <div className="feature-item">
              <div className="feature-icon">
                <Calendar size={20} />
              </div>
              <div className="feature-text">
                <strong>Easy scheduling</strong>
                <span>Track leaves with intuitive calendar</span>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <CheckCircle size={20} />
              </div>
              <div className="feature-text">
                <strong>Quick approvals</strong>
                <span>Managers approve with one click</span>
              </div>
            </div>
            <div className="feature-item">
              <div className="feature-icon">
                <Shield size={20} />
              </div>
              <div className="feature-text">
                <strong>Secure & reliable</strong>
                <span>Enterprise-grade security</span>
              </div>
            </div>
          </div>

          {/* Floating Leaves */}
          <div className="floating-leaves">
            <span className="leaf l1">🍃</span>
            <span className="leaf l2">🍂</span>
            <span className="leaf l3">🌿</span>
            <span className="leaf l4">🍃</span>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="form-panel">
        <div className="form-container">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="mobile-logo">
            <img src={isDarkMode ? "/logo-dark.png" : "/logo-light.png"} alt="Leaf Tracker" className="mobile-logo-img" />
            <h2>Leaf Tracker</h2>
          </div>

          <div className="form-header">
            <h2>Welcome back</h2>
            <p>Sign in to continue to your dashboard</p>
          </div>

          {/* Portal Selection */}
          <div className="role-selector">
            <button
              type="button"
              className={`role-btn ${role === 'staff' ? 'active' : ''}`}
              onClick={() => setRole('staff')}
              title="Submit leave requests"
            >
              <Users size={20} />
              <span>Request Portal</span>
            </button>
            <button
              type="button"
              className={`role-btn ${role === 'manager' ? 'active' : ''}`}
              onClick={() => setRole('manager')}
              title="Manage team leave requests"
            >
              <UserCog size={20} />
              <span>Manage Portal</span>
            </button>
          </div>

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="error-message">{error}</div>}
            
            <div className="input-group">
              <label htmlFor="username">Username</label>
              <input
                type="text"
                id="username"
                placeholder="Enter your username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
              />
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <div className="password-wrapper">
                <input
                  type={showPassword ? 'text' : 'password'}
                  id="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="password-toggle"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <div className="form-footer">
              <label className="remember-me">
                <input type="checkbox" />
                <span>Remember me</span>
              </label>
              <a href="#" className="forgot-link">Forgot password?</a>
            </div>

            <button type="submit" className="submit-btn" disabled={isLoading}>
              {isLoading ? (
                <span className="loader"></span>
              ) : (
                <>
                  Enter {role === 'manager' ? 'Manage' : 'Request'} Portal
                  <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>

          <p className="signup-text">
            Don't have an account? <a href="#">Contact Administrator</a>
          </p>

          <p className="footer-text">© 2026 Leaf Tracker. All rights reserved.</p>
        </div>
      </div>
    </div>
  )
}

export default Login
