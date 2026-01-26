import { useState, useEffect, useRef } from 'react'
import { X, Lock, ShieldCheck, AlertCircle } from 'lucide-react'
import './Modal.css'

function PasswordPromptModal({ isOpen, onClose, onSuccess, user }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen) {
      setPassword('')
      setError('')
      // Focus input when modal opens
      setTimeout(() => {
        inputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!password) {
      setError('Password is required')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch('http://localhost:3000/api/auth/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          employeeId: user?.employeeId,
          password: password
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || 'Incorrect password')
        setPassword('')
        inputRef.current?.focus()
      }
    } catch (err) {
      setError('Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="modal-header" style={{ justifyContent: 'center', paddingTop: '32px', paddingBottom: '0' }}>
          <div style={{ 
            width: '64px', 
            height: '64px', 
            borderRadius: '50%', 
            background: 'rgba(59, 130, 246, 0.1)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            color: '#3b82f6',
            marginBottom: '16px'
          }}>
            <ShieldCheck size={32} />
          </div>
        </div>

        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <h2 style={{ margin: '0 0 8px 0', fontSize: '1.25rem' }}>Security Check</h2>
          <p style={{ margin: '0', color: '#6b7280' }}>
            Please enter your password to switch to the Manage Portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && (
            <div className="error-message" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          <div className="form-group">
            <label>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} style={{ position: 'absolute', left: '12px', top: '12px', color: '#9ca3af' }} />
              <input
                ref={inputRef}
                type="password"
                className="form-control"
                style={{ paddingLeft: '36px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                disabled={loading}
              />
            </div>
          </div>

          <div className="modal-actions" style={{ marginTop: '0' }}>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Verifying...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default PasswordPromptModal
