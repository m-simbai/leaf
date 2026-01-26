import { useState, useEffect } from 'react'
import { Calendar, Clock, Send, AlertCircle, CheckCircle, X } from 'lucide-react'
import './LeaveRequest.css'

function LeaveRequest({ user, onSubmit, onCancel, leaveBalance = { annual: 15, sick: 10, other: 3 } }) {
  const [formData, setFormData] = useState({
    leaveType: 'annual',
    startDate: '',
    endDate: '',
    reason: ''
  })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [daysRequested, setDaysRequested] = useState(0)

  // Calculate business days between two dates
  const calculateDays = (start, end) => {
    if (!start || !end) return 0
    const startDate = new Date(start)
    const endDate = new Date(end)
    
    if (endDate < startDate) return 0

    let count = 0
    const current = new Date(startDate)
    
    while (current <= endDate) {
      const dayOfWeek = current.getDay()
      // Skip weekends
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        count++
      }
      current.setDate(current.getDate() + 1)
    }
    
    return count
  }

  // Update days when dates change
  useEffect(() => {
    const days = calculateDays(formData.startDate, formData.endDate)
    setDaysRequested(days)
  }, [formData.startDate, formData.endDate])

  // Get available balance for selected leave type
  const getAvailableBalance = () => {
    switch (formData.leaveType) {
      case 'annual': return leaveBalance.annual
      case 'sick': return leaveBalance.sick
      case 'other': return leaveBalance.other
      default: return 0
    }
  }

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }

  // Validate form
  const validate = () => {
    const newErrors = {}
    
    if (!formData.startDate) {
      newErrors.startDate = 'Start date is required'
    }
    
    if (!formData.endDate) {
      newErrors.endDate = 'End date is required'
    }
    
    if (formData.startDate && formData.endDate) {
      const start = new Date(formData.startDate)
      const end = new Date(formData.endDate)
      
      if (end < start) {
        newErrors.endDate = 'End date must be after start date'
      }
      
      if (daysRequested > getAvailableBalance()) {
        newErrors.days = `Insufficient balance. You have ${getAvailableBalance()} days available.`
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!validate()) return

    setSubmitting(true)
    
    try {
      // Submit to real API
      const response = await fetch('http://localhost:3000/api/leaves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: user?.employeeId || 'unknown',
          employeeName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || user?.username,
          leaveType: formData.leaveType,
          startDate: formData.startDate,
          endDate: formData.endDate,
          daysRequested,
          reason: formData.reason
        })
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit request')
      }
      
      if (onSubmit) {
        onSubmit({
          ...formData,
          daysRequested,
          requestId: data.requestId,
          submittedAt: new Date().toISOString(),
          status: 'pending'
        })
      }
      
      setSubmitted(true)
    } catch (err) {
      setErrors({ submit: err.message || 'Failed to submit request. Please try again.' })
    } finally {
      setSubmitting(false)
    }
  }

  // Get today's date in YYYY-MM-DD format for min date
  const today = new Date().toISOString().split('T')[0]

  // Leave type options
  const leaveTypes = [
    { id: 'annual', label: 'Time-Off', icon: '🏖️', balance: leaveBalance.annual },
    { id: 'sick', label: 'Sick Leave', icon: '🏥', balance: leaveBalance.sick },
    { id: 'other', label: 'Compassionate Leave', icon: '📋', balance: leaveBalance.other },
  ]

  // If submitted, show success message
  if (submitted) {
    return (
      <div className="leave-request-container">
        <div className="success-card">
          <div className="success-icon">
            <CheckCircle size={48} />
          </div>
          <h2>Request Submitted!</h2>
          <p>Your leave request has been submitted for approval.</p>
          <div className="success-details">
            <div className="detail-row">
              <span className="detail-label">Leave Type</span>
              <span className="detail-value">{leaveTypes.find(t => t.id === formData.leaveType)?.label}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Duration</span>
              <span className="detail-value">{daysRequested} business day{daysRequested !== 1 ? 's' : ''}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Dates</span>
              <span className="detail-value">
                {new Date(formData.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} — {new Date(formData.endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
          </div>
          <button className="btn-primary" onClick={() => {
            setSubmitted(false)
            setFormData({ leaveType: 'annual', startDate: '', endDate: '', reason: '' })
          }}>
            Submit Another Request
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="leave-request-container">
      <form onSubmit={handleSubmit} className="leave-request-form">
        {/* Leave Type Selection */}
        <div className="form-section">
          <label className="section-label">Leave Type</label>
          <div className="leave-type-options">
            {leaveTypes.map(type => (
              <button
                key={type.id}
                type="button"
                className={`leave-type-option ${formData.leaveType === type.id ? 'selected' : ''}`}
                onClick={() => setFormData(prev => ({ ...prev, leaveType: type.id }))}
              >
                <span className="type-icon">{type.icon}</span>
                <span className="type-label">{type.label}</span>
                <span className="type-balance">{type.balance} days left</span>
              </button>
            ))}
          </div>
        </div>

        {/* Date Selection */}
        <div className="form-section">
          <label className="section-label">Leave Dates</label>
          <div className="date-inputs">
            <div className="input-group">
              <label htmlFor="startDate">Start Date</label>
              <div className="input-wrapper">
                <Calendar size={18} />
                <input
                  type="date"
                  id="startDate"
                  name="startDate"
                  value={formData.startDate}
                  onChange={handleChange}
                  min={today}
                  className={errors.startDate ? 'error' : ''}
                />
              </div>
              {errors.startDate && <span className="error-text">{errors.startDate}</span>}
            </div>
            
            <div className="date-arrow">→</div>
            
            <div className="input-group">
              <label htmlFor="endDate">End Date</label>
              <div className="input-wrapper">
                <Calendar size={18} />
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleChange}
                  min={formData.startDate || today}
                  className={errors.endDate ? 'error' : ''}
                />
              </div>
              {errors.endDate && <span className="error-text">{errors.endDate}</span>}
            </div>
          </div>

          {/* Days Calculation */}
          {daysRequested > 0 && (
            <div className={`days-calculated ${daysRequested > getAvailableBalance() ? 'exceeds' : ''}`}>
              <Clock size={18} />
              <span>
                <strong>{daysRequested}</strong> business day{daysRequested !== 1 ? 's' : ''} requested
                {daysRequested > getAvailableBalance() && (
                  <span className="exceeds-warning"> (exceeds available balance)</span>
                )}
              </span>
            </div>
          )}
          {errors.days && <span className="error-text center">{errors.days}</span>}
        </div>

        {/* Reason */}
        <div className="form-section">
          <label className="section-label" htmlFor="reason">
            Reason <span className="optional">(optional)</span>
          </label>
          <textarea
            id="reason"
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            placeholder="Add any additional notes for your manager..."
            rows={3}
          />
        </div>

        {/* Submit Error */}
        {errors.submit && (
          <div className="submit-error">
            <AlertCircle size={18} />
            <span>{errors.submit}</span>
          </div>
        )}

        {/* Form Actions */}
        <div className="form-actions">
          {onCancel && (
            <button type="button" className="btn-secondary" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button 
            type="submit" 
            className="btn-primary"
            disabled={submitting || daysRequested === 0}
          >
            {submitting ? (
              <>
                <span className="spinner"></span>
                Submitting...
              </>
            ) : (
              <>
                <Send size={18} />
                Submit Request
              </>
            )}
          </button>
        </div>
      </form>

      {/* Info Note */}
      <div className="info-note">
        <AlertCircle size={16} />
        <span>Your manager will be notified and can approve or reject your request.</span>
      </div>
    </div>
  )
}

export default LeaveRequest
