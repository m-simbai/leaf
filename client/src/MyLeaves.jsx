import { useState } from 'react'
import { Calendar, Clock, CheckCircle, XCircle, AlertCircle, FileText, Eye, LogIn, Plus } from 'lucide-react'
import './MyLeaves.css'
import EarlyCheckinModal from './EarlyCheckinModal'
import ExtensionRequestModal from './ExtensionRequestModal'

function MyLeaves({ leaves = [], user, leaveBalance }) {
  const [filter, setFilter] = useState('all') // all, pending, approved, rejected
  const [showCheckinModal, setShowCheckinModal] = useState(false)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [selectedLeave, setSelectedLeave] = useState(null)

  // Filter leaves for current user only
  const currentUserLeaves = leaves.filter(l => 
    l.attributes.EmployeeID === user?.employeeId || 
    l.attributes.EmployeeID === user?.username // Fallback
  )

  const myLeaves = currentUserLeaves.map(feature => {
    const attrs = feature.attributes
    // DEBUG: Log attributes to check status
    console.log('MyLeaves processing leave:', attrs.OBJECTID, attrs.Status, attrs);

    // Use fields from our new schema
    const startDate = new Date(attrs.StartDate)
    const endDate = new Date(attrs.EndDate)
    const submittedDate = new Date(attrs.SubmittedDate || attrs.CreatedDate)
    
    // Display name mapping
    let displayType = attrs.LeaveType || 'Time-Off';
    if (['Annual Leave', 'annual', 'Time-Off', 'time-off'].includes(displayType)) displayType = 'Time-Off';
    if (['Other', 'other', 'Compassionate', 'compassionate'].includes(displayType)) displayType = 'Compassionate';
    if (['Sick', 'sick', 'Sick Leave'].includes(displayType)) displayType = 'Sick Leave';
    
    // Fallback for duration if not calculated
    // Fallback for duration if not calculated
    const leaveDuration = attrs.DaysRequested || attrs.Days || (startDate && endDate ? Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1 : 0);

    return {
      id: attrs.OBJECTID,
      leaveType: displayType,
      startDate,
      endDate,
      EndDate: attrs.EndDate, // Keep original for API calls
      leaveDuration,
      submittedDate,
      // Try multiple casings for Status
      status: (attrs.Status || attrs.status || attrs.STATUS || 'unknown').toLowerCase(),
      rejectionReason: attrs.RejectionReason || attrs.rejectionRequest,
      modificationType: attrs.ModificationType,
      modificationStatus: attrs.ModificationStatus
    }
  })

  // Filter leaves
  const filteredLeaves = myLeaves.filter(leave => {
    if (filter === 'all') return true
    return leave.status === filter
  })

  // Count by status
  const counts = {
    all: myLeaves.length,
    pending: myLeaves.filter(l => l.status === 'pending').length,
    approved: myLeaves.filter(l => l.status === 'approved').length,
    rejected: myLeaves.filter(l => l.status === 'rejected').length
  }

  // Helper for header colors
  const getHeaderStyle = (type) => {
    const t = (type || '').toLowerCase();
    if (t.includes('sick')) return 'header-blue';
    if (t.includes('compassionate') || t.includes('other')) return 'header-yellow';
    return 'header-red'; // Time-off/Annual
  }

  // Format date safely
  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return 'Invalid Date'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // Format relative time safely
  const formatRelativeTime = (date) => {
    if (!date || isNaN(date.getTime())) return 'Unknown date'
    const now = new Date()
    const diffMs = now - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    return `${diffDays} days ago`
  }

  // Check if leave is currently active or upcoming
  const isLeaveActive = (leave) => {
    const now = new Date()
    const end = new Date(leave.endDate)
    return leave.status === 'approved' && end > now
  }

  // Handle early check-in
  const handleEarlyCheckin = async (data) => {
    try {
      const response = await fetch(`/api/leaves/${selectedLeave.id}/early-checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await response.json()
      if (result.success) {
        alert(`Early check-in recorded! ${result.daysRefunded} days refunded to your balance.`)
        window.location.reload()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      throw error
    }
  }

  // Handle extension request
  const handleExtensionRequest = async (data) => {
    try {
      const response = await fetch(`/api/leaves/${selectedLeave.id}/request-extension`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      const result = await response.json()
      if (result.success) {
        alert(`Extension requested for ${result.additionalDays} additional days. Awaiting manager approval.`)
        window.location.reload()
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      throw error
    }
  }

  // Get status icon and color
  const getStatusInfo = (status) => {
    switch (status) {
      case 'approved':
        return { icon: CheckCircle, color: 'green', label: 'Approved' }
      case 'rejected':
        return { icon: XCircle, color: 'red', label: 'Rejected' }
      case 'pending':
      default:
        return { icon: Clock, color: 'yellow', label: 'Pending' }
    }
  }

  return (
    <div className="my-leaves-container">
      {/* Leave Balance Summary */}
      <div className="leave-balance">
        <h3>Leave Balance</h3>
        <div className="balance-cards">
          <div className="balance-card">
            <div className="balance-icon annual">
              <Calendar size={20} />
            </div>
            <div className="balance-info">
              <span className="balance-value">{leaveBalance?.annual || 0}</span>
              <span className="balance-label">Time-Off</span>
            </div>
            <span className="balance-unit">days left</span>
          </div>
          <div className="balance-card">
            <div className="balance-icon sick">
              <AlertCircle size={20} />
            </div>
            <div className="balance-info">
              <span className="balance-value">{leaveBalance?.sick || 0}</span>
              <span className="balance-label">Sick Leave</span>
            </div>
            <span className="balance-unit">days left</span>
          </div>
          <div className="balance-card">
            <div className="balance-icon other">
              <FileText size={20} />
            </div>
            <div className="balance-info">
              <span className="balance-value">{leaveBalance?.other || 0}</span>
              <span className="balance-label">Compassionate</span>
            </div>
            <span className="balance-unit">days left</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-section">
        <h3>My Leave Requests</h3>
        <div className="filter-tabs">
          <button 
            className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({counts.all})
          </button>
          <button 
            className={`filter-tab ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => setFilter('pending')}
          >
            <Clock size={14} />
            Pending ({counts.pending})
          </button>
          <button 
            className={`filter-tab ${filter === 'approved' ? 'active' : ''}`}
            onClick={() => setFilter('approved')}
          >
            <CheckCircle size={14} />
            Approved ({counts.approved})
          </button>
          <button 
            className={`filter-tab ${filter === 'rejected' ? 'active' : ''}`}
            onClick={() => setFilter('rejected')}
          >
            <XCircle size={14} />
            Rejected ({counts.rejected})
          </button>
        </div>
      </div>

      {/* Leave Requests List */}
      <div className="leaves-list">
        {filteredLeaves.length === 0 ? (
          <div className="no-leaves">
            <FileText size={48} />
            <h3>No leave requests</h3>
            <p>You haven't submitted any leave requests yet.</p>
          </div>
        ) : (
          filteredLeaves.map((leave, idx) => {
            const statusInfo = getStatusInfo(leave.status)
            const StatusIcon = statusInfo.icon

            return (
              <div key={leave.id || idx} className={`leave-card ${leave.status}`}>
                <div className={`leave-card-header ${getHeaderStyle(leave.leaveType)}`}>
                  <div className="leave-type-badge">
                    <Calendar size={16} />
                    {leave.leaveType}
                  </div>
                  <div className={`status-badge ${statusInfo.color}`}>
                    <StatusIcon size={14} />
                    {statusInfo.label}
                  </div>
                </div>

                <div className="leave-card-body">
                  <div className="leave-dates">
                    <div className="date-block">
                      <span className="date-label">From</span>
                      <span className="date-value">{formatDate(leave.startDate)}</span>
                    </div>
                    <div className="date-arrow">→</div>
                    <div className="date-block">
                      <span className="date-label">To</span>
                      <span className="date-value">{formatDate(leave.endDate)}</span>
                    </div>
                    <div className="duration-badge">
                      {leave.leaveDuration} {leave.leaveDuration === 1 ? 'day' : 'days'}
                    </div>
                  </div>

                  {leave.status === 'rejected' && leave.rejectionReason && (
                    <div className="rejection-reason">
                      <XCircle size={16} />
                      <span>{leave.rejectionReason}</span>
                    </div>
                  )}
                </div>

                <div className="leave-card-footer">
                  <span className="submitted-date">Submitted {formatRelativeTime(leave.submittedDate)}</span>
                  <div className="leave-actions">
                    {isLeaveActive(leave) && !leave.modificationType && (
                      <>
                        <button 
                          className="action-btn checkin-btn"
                          onClick={() => {
                            setSelectedLeave(leave)
                            setShowCheckinModal(true)
                          }}
                          title="Check in early"
                        >
                          <LogIn size={14} />
                          Early Check-In
                        </button>
                        <button 
                          className="action-btn extension-btn"
                          onClick={() => {
                            setSelectedLeave(leave)
                            setShowExtensionModal(true)
                          }}
                          title="Request extension"
                        >
                          <Plus size={14} />
                          Request Extension
                        </button>
                      </>
                    )}
                    {leave.modificationStatus === 'pending' && (
                      <span className="modification-status">
                        ⏳ {leave.modificationType === 'early_checkin' ? 'Check-in' : 'Extension'} pending
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Modals */}
      {showCheckinModal && selectedLeave && (
        <EarlyCheckinModal 
          leave={selectedLeave}
          onClose={() => {
            setShowCheckinModal(false)
            setSelectedLeave(null)
          }}
          onSubmit={handleEarlyCheckin}
        />
      )}

      {showExtensionModal && selectedLeave && (
        <ExtensionRequestModal 
          leave={selectedLeave}
          onClose={() => {
            setShowExtensionModal(false)
            setSelectedLeave(null)
          }}
          onSubmit={handleExtensionRequest}
        />
      )}
    </div>
  )
}

export default MyLeaves
