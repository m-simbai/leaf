import { useState } from 'react'
import { X, Calendar, AlertCircle } from 'lucide-react'
import './Modal.css' // Reusing existing modal styles

function ManagerExtensionModal({ request, onClose, onSubmit }) {
  const [newEndDate, setNewEndDate] = useState('')
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newEndDate) return

    setIsSubmitting(true)
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${request.id}/manager-extend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newEndDate,
          reason
        }),
      })

      const data = await response.json()
      if (data.success) {
        onSubmit()
        onClose()
      } else {
        alert(data.error || 'Failed to extend leave')
      }
    } catch (error) {
      console.error('Extension error:', error)
      alert('Failed to submit extension')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Calculate days difference
  const getAdditionalDays = () => {
    if (!newEndDate) return 0
    const original = new Date(request.endDate)
    const newEnd = new Date(newEndDate)
    const diffTime = Math.abs(newEnd - original)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) 
    return newEnd > original ? diffDays : 0
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}>
          <X size={24} />
        </button>
        
        <div className="modal-header">
          <Calendar size={24} className="modal-icon" />
          <h2>Extend Leave</h2>
        </div>

        <p className="modal-subtitle">
          Extending leave for <strong>{request.fullName}</strong>
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Current End Date</label>
            <div className="date-display">
              {new Date(request.endDate).toLocaleDateString()}
            </div>
          </div>

          <div className="form-group">
            <label>New End Date</label>
            <input 
              type="date" 
              className="form-control"
              value={newEndDate}
              min={(() => {
                const nextDay = new Date(request.endDate);
                nextDay.setDate(nextDay.getDate() + 1);
                return nextDay.toISOString().split('T')[0];
              })()}
              onChange={(e) => setNewEndDate(e.target.value)}
              required
            />
          </div>

          {newEndDate && (
             <div className="info-box blue">
               <AlertCircle size={16} />
               <span>Adding <strong>{getAdditionalDays()} days</strong> to this leave.</span>
             </div>
          )}

          <div className="form-group">
            <label>Reason for Extension (Optional)</label>
            <textarea 
              className="form-control"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Project timeline shifted"
              rows="3"
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={isSubmitting || !newEndDate}>
              {isSubmitting ? 'Extending...' : 'Confirm Extension'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default ManagerExtensionModal
