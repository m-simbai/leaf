import { useState, useEffect } from 'react'
import { Eye, EyeOff, Users, UserCog, ArrowRight, Calendar, Clock, CheckCircle, Shield } from 'lucide-react'
import './Login.css'

function Login({ onLogin }) {
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState('staff')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const [error, setError] = useState('')
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetMessage, setResetMessage] = useState('')

  useEffect(() => {
    // Enforce light mode
    document.body.classList.remove('dark-mode')
    document.body.classList.add('light-mode')
  }, [])

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

  const handleForgotSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setResetMessage('')
    
    if (!username) {
      setError('Please enter your username')
      return
    }

    setIsLoading(true)
    
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username })
      })
      
      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch (e) {
        console.error('Server response not JSON:', text)
        // detailed error for debugging
        const preview = text.substring(0, 50).replace(/</g, '&lt;')
        throw new Error(`Server Error: ${preview}...`)
      }
      
      if (data.success) {
        setResetMessage(data.message)
      } else {
        throw new Error(data.error || 'Request failed')
      }
    } catch (err) {
      setError(err.message || 'Request failed. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="login-page light">

      {/* Animated Background Elements (Now visible on mobile too) */}
      <div className="bg-shapes">
        <div className="shape shape-1"></div>
        <div className="shape shape-2"></div>
        <div className="shape shape-3"></div>
      </div>

      <div className="floating-leaves">
        <span className="leaf l1">🍃</span>
        <span className="leaf l2">🍂</span>
        <span className="leaf l3">🌿</span>
        <span className="leaf l4">🍃</span>
      </div>

      {/* Left Panel - Branding (Desktop Only Content) */}
      <div className="branding-panel">
        <div className="branding-content">
          {/* Logo Header */}
          <div className="brand-header-flex">
            <div className="brand-logo">
              <img src="/logo.svg" alt="Leaf Tracker" className="brand-logo-img" />
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
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="form-panel">
        <div className="form-container">
          {/* Mobile Logo (hidden on desktop) */}
          <div className="mobile-logo">
            <img src="/logo.svg" alt="Leaf Tracker" className="mobile-logo-img" />
            <h2>Leaf Tracker</h2>
          </div>

          {/* Login / Forgot Password Form */}
          {!isForgotPassword ? (
            <>
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
                  <span>Staff</span>
                </button>
                <button
                  type="button"
                  className={`role-btn ${role === 'manager' ? 'active' : ''}`}
                  onClick={() => setRole('manager')}
                  title="Manage team leave requests"
                >
                  <UserCog size={20} />
                  <span>Management</span>
                </button>
              </div>

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

                <button 
                  type="button" 
                  className="forgot-link"
                  onClick={() => {
                    setIsForgotPassword(true)
                    setError('')
                    setResetMessage('')
                  }}
                >
                  Forgot password?
                </button>
              </div>

              <button type="submit" className="submit-btn" disabled={isLoading}>
                {isLoading ? (
                  <span className="loader"></span>
                ) : (
                  <>
                    Enter {role === 'manager' ? 'Management' : 'Staff'}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
              </form>
            </>
          ) : (
            <form onSubmit={handleForgotSubmit} className="login-form">
              <div className="form-header" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '8px' }}>Reset Password</h3>
                <p style={{ fontSize: '0.9rem', color: '#6b7280' }}>
                  Enter your username and we'll notify the administrator to reset your password.
                </p>
              </div>

              {error && <div className="error-message">{error}</div>}
              {resetMessage && (
                <div className="success-message" style={{ 
                  backgroundColor: '#ecfdf5', 
                  color: '#047857', 
                  padding: '12px', 
                  borderRadius: '8px',
                  fontSize: '0.9rem',
                  marginBottom: '16px',
                  border: '1px solid #a7f3d0'
                }}>
                  {resetMessage}
                </div>
              )}
              
              <div className="input-group">
                <label htmlFor="reset-username">Username</label>
                <input
                  type="text"
                  id="reset-username"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                />
              </div>

              <button type="submit" className="submit-btn" disabled={isLoading || !!resetMessage}>
                {isLoading ? (
                  <span className="loader"></span>
                ) : (
                  <>
                    Request Reset
                    <ArrowRight size={18} />
                  </>
                )}
              </button>

              <button 
                type="button" 
                className="btn-secondary" 
                style={{ width: '100%', marginTop: '12px', justifyContent: 'center' }}
                onClick={() => {
                  setIsForgotPassword(false)
                  setError('')
                  setResetMessage('')
                }}
              >
                Back to Login
              </button>
            </form>
          )}

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
