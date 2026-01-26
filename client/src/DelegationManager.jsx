import { useState, useEffect } from 'react'
import { Users, Calendar, ArrowRightLeft, X, Plus, AlertTriangle, Check, Clock } from 'lucide-react'
import './DelegationManager.css'

function DelegationManager({ user }) {
  const [delegations, setDelegations] = useState({ outgoing: [], incoming: [] })
  const [otherManagers, setOtherManagers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form state
  const [newDelegation, setNewDelegation] = useState({
    toManagerId: '',
    startDate: '',
    endDate: '',
    reason: ''
  })

  // Fetch delegations
  const fetchDelegations = async () => {
    try {
      const response = await fetch(`/api/delegations/${user.employeeId}`)
      const data = await response.json()
      if (data.success) {
        setDelegations({ outgoing: data.outgoing || [], incoming: data.incoming || [] })
      }
    } catch (err) {
      console.error('Error fetching delegations:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch other managers for dropdown
  const fetchOtherManagers = async () => {
    try {
      const response = await fetch(`/api/managers/except/${user.employeeId}`)
      const data = await response.json()
      if (data.success) {
        setOtherManagers(data.managers || [])
      }
    } catch (err) {
      console.error('Error fetching managers:', err)
    }
  }

  useEffect(() => {
    fetchDelegations()
    fetchOtherManagers()
  }, [user.employeeId])

  // Create delegation
  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    
    if (!newDelegation.toManagerId || !newDelegation.startDate || !newDelegation.endDate) {
      setError('Please fill in all required fields')
      return
    }

    try {
      const response = await fetch('/api/delegations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fromManagerId: user.employeeId,
          ...newDelegation
        })
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess('Delegation created successfully')
        setShowCreateModal(false)
        setNewDelegation({ toManagerId: '', startDate: '', endDate: '', reason: '' })
        fetchDelegations()
      } else {
        setError(data.error || 'Failed to create delegation')
      }
    } catch (err) {
      setError('Failed to create delegation')
    }
  }

  // Cancel delegation
  const handleCancel = async (delegationId) => {
    try {
      const response = await fetch(`/api/delegations/${delegationId}/cancel`, {
        method: 'PUT'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setSuccess('Delegation cancelled')
        fetchDelegations()
      }
    } catch (err) {
      setError('Failed to cancel delegation')
    }
  }

  // Clear messages
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('')
        setSuccess('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  // Format date for display
  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-GB', { 
      day: 'numeric', month: 'short', year: 'numeric' 
    })
  }

  // Check if delegation is active
  const isActive = (d) => {
    const now = new Date()
    return d.status === 'active' && 
      new Date(d.startDate) <= now && 
      new Date(d.endDate) >= now
  }

  // Check if delegation is upcoming
  const isUpcoming = (d) => {
    const now = new Date()
    return d.status === 'active' && new Date(d.startDate) > now
  }

  if (loading) {
    return <div className="delegation-loading">Loading delegations...</div>
  }

  return (
    <div className="delegation-manager">
      {/* Messages */}
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      {/* Header */}
      <div className="delegation-header">
        <div>
          <h2><ArrowRightLeft size={24} /> Delegation Management</h2>
          <p>Temporarily assign your staff to another manager during your absence</p>
        </div>
        <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} />
          New Delegation
        </button>
      </div>

      {/* Stats */}
      <div className="delegation-stats">
        <div className="stat-card">
          <div className="stat-icon outgoing"><ArrowRightLeft size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{delegations.outgoing.filter(d => d.status === 'active').length}</span>
            <span className="stat-label">My Delegations</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon incoming"><Users size={24} /></div>
          <div className="stat-info">
            <span className="stat-value">{delegations.incoming.length}</span>
            <span className="stat-label">Covering For</span>
          </div>
        </div>
      </div>

      {/* Outgoing Delegations */}
      <div className="delegation-section">
        <h3>My Delegations (Staff I'm delegating)</h3>
        {delegations.outgoing.length === 0 ? (
          <div className="empty-state">
            <Clock size={32} />
            <p>No outgoing delegations</p>
          </div>
        ) : (
          <div className="delegation-cards">
            {delegations.outgoing.map(d => (
              <div key={d.id} className={`delegation-card ${isActive(d) ? 'active' : ''} ${isUpcoming(d) ? 'upcoming' : ''} ${d.status === 'cancelled' ? 'cancelled' : ''}`}>
                <div className="delegation-card-header">
                  <span className={`status-badge ${isActive(d) ? 'active' : ''} ${isUpcoming(d) ? 'upcoming' : ''} ${d.status === 'cancelled' ? 'cancelled' : ''}`}>
                    {isActive(d) ? 'Active' : isUpcoming(d) ? 'Upcoming' : d.status}
                  </span>
                  {d.status === 'active' && (
                    <button className="btn-icon cancel" onClick={() => handleCancel(d.id)} title="Cancel Delegation">
                      <X size={16} />
                    </button>
                  )}
                </div>
                <div className="delegation-card-body">
                  <div className="delegation-to">
                    <span className="label">Covering Manager:</span>
                    <span className="value">{d.toManagerName}</span>
                  </div>
                  <div className="delegation-dates">
                    <Calendar size={16} />
                    <span>{formatDate(d.startDate)} - {formatDate(d.endDate)}</span>
                  </div>
                  {d.reason && <p className="delegation-reason">{d.reason}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Incoming Delegations */}
      <div className="delegation-section">
        <h3>Staff I'm Covering</h3>
        {delegations.incoming.length === 0 ? (
          <div className="empty-state">
            <Users size={32} />
            <p>Not covering any delegated staff</p>
          </div>
        ) : (
          <div className="delegation-cards">
            {delegations.incoming.map(d => (
              <div key={d.id} className="delegation-card incoming active">
                <div className="delegation-card-header">
                  <span className="status-badge active">Active Coverage</span>
                </div>
                <div className="delegation-card-body">
                  <div className="delegation-from">
                    <span className="label">Covering for:</span>
                    <span className="value">{d.fromManagerName}</span>
                  </div>
                  <div className="delegation-dates">
                    <Calendar size={16} />
                    <span>{formatDate(d.startDate)} - {formatDate(d.endDate)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Create Delegation</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate} className="modal-body">
              <div className="form-group">
                <label>Delegate To *</label>
                <select
                  value={newDelegation.toManagerId}
                  onChange={e => setNewDelegation({...newDelegation, toManagerId: e.target.value})}
                  required
                >
                  <option value="">Select a manager...</option>
                  {otherManagers.map(m => (
                    <option key={m.employeeId} value={m.employeeId}>
                      {m.firstName} {m.lastName}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Start Date *</label>
                  <input
                    type="date"
                    value={newDelegation.startDate}
                    onChange={e => setNewDelegation({...newDelegation, startDate: e.target.value})}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>End Date *</label>
                  <input
                    type="date"
                    value={newDelegation.endDate}
                    onChange={e => setNewDelegation({...newDelegation, endDate: e.target.value})}
                    min={newDelegation.startDate}
                    required
                  />
                </div>
              </div>
              <div className="form-group">
                <label>Reason (Optional)</label>
                <textarea
                  value={newDelegation.reason}
                  onChange={e => setNewDelegation({...newDelegation, reason: e.target.value})}
                  placeholder="e.g., Annual leave, Conference attendance..."
                  rows={3}
                />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary">
                  Create Delegation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default DelegationManager
