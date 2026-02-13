import { useState, useEffect } from 'react'
import { Key, Eye, EyeOff, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import './SetupPassword.css' // Reuse same styles

const API_BASE = import.meta.env.VITE_API_URL || ''

export default function ResetPassword() {
  const token = new URLSearchParams(window.location.search).get('token')
  
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [validToken, setValidToken] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [userInfo, setUserInfo] = useState({ firstName: '', lastName: '' })
  
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  // Validate token on mount
  useEffect(() => {
    async function validateToken() {
      if (!token) {
        setError('No reset token provided')
        setLoading(false)
        return
      }
      
      try {
        const res = await fetch(`${API_BASE}/api/auth/validate-reset-token/${token}`)
        const data = await res.json()
        
        if (data.valid) {
          setValidToken(true)
          setUserInfo({ firstName: data.firstName, lastName: data.lastName })
        } else {
          setError(data.error || 'Invalid or expired reset link')
        }
      } catch (err) {
        setError('Failed to validate reset link')
      }
      setLoading(false)
    }
    
    validateToken()
  }, [token])
  
  // Password requirements validation
  const passwordRequirements = {
    minLength: password.length >= 8,
    hasUppercase: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSpecial: /[!@#$%^&*(),.?":{}|<>]/.test(password),
  }
  
  const isPasswordValid = Object.values(passwordRequirements).every(Boolean)
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!isPasswordValid) {
      setError('Password does not meet all requirements')
      return
    }
    
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    
    setSubmitting(true)
    
    try {
      const res = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      })
      
      const data = await res.json()
      
      if (data.success) {
        setSuccess(true)
        setTimeout(() => { window.location.href = '/login' }, 3000)
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch (err) {
      setError('Failed to reset password. Please try again.')
    }
    
    setSubmitting(false)
  }
  
  if (loading) {
    return (
      <div className="setup-password-page">
        <div className="setup-password-container">
          <Loader2 className="loading-spinner" size={48} />
          <p>Validating your reset link...</p>
        </div>
      </div>
    )
  }
  
  if (success) {
    return (
      <div className="setup-password-page">
        <div className="setup-password-container success">
          <CheckCircle size={64} className="success-icon" />
          <h1>Password Reset Successfully!</h1>
          <p>Redirecting to login page...</p>
        </div>
      </div>
    )
  }
  
  if (!validToken) {
    return (
      <div className="setup-password-page">
        <div className="setup-password-container error">
          <AlertCircle size={64} className="error-icon" />
          <h1>Invalid Reset Link</h1>
          <p>{error}</p>
          <button onClick={() => { window.location.href = '/login' }} className="btn-primary">
            Go to Login
          </button>
        </div>
      </div>
    )
  }
  
  return (
    <div className="setup-password-page">
      <div className="setup-password-container">
        <div className="setup-header">
          <Key size={48} className="lock-icon" />
          <h1>Reset Your Password</h1>
          <p className="welcome-text">
            Hi, <strong>{userInfo.firstName} {userInfo.lastName}</strong>!
          </p>
          <p>Enter your new password below.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="setup-form">
          {error && (
            <div className="error-message">
              <AlertCircle size={18} />
              {error}
            </div>
          )}
          
          <div className="form-group">
            <label>New Password</label>
            <div className="password-input-wrapper">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a strong password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            
            {/* Password Requirements Checklist */}
            <div className="password-requirements">
              <p className="requirements-title">Password must have:</p>
              <ul>
                <li className={passwordRequirements.minLength ? 'met' : ''}>
                  {passwordRequirements.minLength ? '✓' : '○'} At least 8 characters
                </li>
                <li className={passwordRequirements.hasUppercase ? 'met' : ''}>
                  {passwordRequirements.hasUppercase ? '✓' : '○'} One uppercase letter
                </li>
                <li className={passwordRequirements.hasNumber ? 'met' : ''}>
                  {passwordRequirements.hasNumber ? '✓' : '○'} One number
                </li>
                <li className={passwordRequirements.hasSpecial ? 'met' : ''}>
                  {passwordRequirements.hasSpecial ? '✓' : '○'} One special character (!@#$%^&* etc.)
                </li>
              </ul>
            </div>
          </div>
          
          <div className="form-group">
            <label>Confirm Password</label>
            <div className="password-input-wrapper">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your new password"
                required
              />
              <button
                type="button"
                className="toggle-password"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
          </div>
          
          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="btn-spinner" size={18} />
                Resetting Password...
              </>
            ) : (
              'Reset Password'
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
