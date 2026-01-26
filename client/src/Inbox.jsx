import { useState } from 'react'
import { Check, X, Clock, MessageSquare, ChevronDown, ChevronUp, AlertCircle, LogIn, Plus, Calendar } from 'lucide-react'
import './Inbox.css'
import ManagerExtensionModal from './ManagerExtensionModal'

function Inbox({ leaves = [], user, onRefresh }) {
  const [expandedId, setExpandedId] = useState(null)
  const [rejectionReason, setRejectionReason] = useState('')
  const [extensionDate, setExtensionDate] = useState('')
  const [processingId, setProcessingId] = useState(null)
  const [actionError, setActionError] = useState(null)
  const [showExtensionModal, setShowExtensionModal] = useState(false)
  const [selectedRequest, setSelectedRequest] = useState(null)
  const [activeTab, setActiveTab] = useState('pending') // pending, checkins, extensions

  // Helper to process leave data
  const processLeaveData = (feature) => {
    const attrs = feature.attributes
    const employeeName = attrs.EmployeeName || 'Unknown'
    const nameParts = employeeName.split(' ')
    
    return {
      id: attrs.OBJECTID,
      firstName: nameParts[0] || 'Unknown',
      lastName: nameParts.slice(1).join(' ') || '',
      fullName: employeeName,
      startDate: new Date(attrs.StartDate),
      endDate: new Date(attrs.EndDate),
      originalEndDate: attrs.OriginalEndDate ? new Date(attrs.OriginalEndDate) : null,
      actualEndDate: attrs.ActualEndDate ? new Date(attrs.ActualEndDate) : null,
      leaveDuration: attrs.DaysRequested || 0,
      daysTaken: attrs.DaysTaken,
      submittedDate: new Date(attrs.SubmittedDate),
      leaveType: (attrs.LeaveType === 'Annual' || attrs.LeaveType === 'Annual Leave') ? 'Time-Off' : 
                 (attrs.LeaveType === 'Other' || attrs.LeaveType === 'Other Leave') ? 'Compassionate' : 
                 (attrs.LeaveType || 'Time-Off'),
      status: attrs.Status,
      reason: attrs.Reason,
      modificationType: attrs.ModificationType,
      modificationReason: attrs.ModificationReason,
      modificationStatus: attrs.ModificationStatus,
      modificationRequestedDate: attrs.ModificationRequestedDate ? new Date(attrs.ModificationRequestedDate) : null,
      isDelegated: attrs.IsDelegated,
      delegatedFrom: attrs.DelegatedFrom
    }
  }

  // Filter pending leave requests (regular)
  const pendingRequests = leaves
    .filter(f => f.attributes.Status === 'pending' && !f.attributes.ModificationType)
    .map(processLeaveData)

  // Filter approved leave requests
  const approvedRequests = leaves
    .filter(f => f.attributes.Status === 'approved')
    .map(processLeaveData)

  // Filter rejected leave requests
  const rejectedRequests = leaves
    .filter(f => f.attributes.Status === 'rejected')
    .map(processLeaveData)

  // Filter pending early check-ins
  const pendingCheckins = leaves
    .filter(f => f.attributes.ModificationType === 'early_checkin' && f.attributes.ModificationStatus === 'pending')
    .map(processLeaveData)

  // Filter pending extension requests
  const pendingExtensions = leaves
    .filter(f => f.attributes.ModificationType === 'extension' && f.attributes.ModificationStatus === 'pending')
    .map(processLeaveData)

  // All requests combined
  const allRequests = leaves.map(processLeaveData)

  const getInitials = (firstName, lastName) => {
    const first = firstName?.charAt(0)?.toUpperCase() || ''
    const last = lastName?.charAt(0)?.toUpperCase() || ''
    return first + last || '?'
  }

  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return 'Invalid Date'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const formatRelativeTime = (date) => {
    if (!date || isNaN(date.getTime())) return 'Unknown'
    const diffMs = new Date() - date
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
    if (diffHours > 1) return `${diffHours} hours ago`
    if (diffHours === 1) return `${diffHours} hour ago`
    if (diffMins > 0) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`
    return 'Just now'
  }

  // Regular approve/reject handlers
  const handleApprove = async (objectId) => {
    setProcessingId(objectId)
    setActionError(null)
    
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${objectId}/approve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: user?.employeeId })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to approve')
      
      if (onRefresh) onRefresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReject = async (objectId) => {
    setProcessingId(objectId)
    setActionError(null)
    
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${objectId}/reject`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reviewedBy: user?.employeeId,
          rejectionReason: rejectionReason 
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to reject')
      
      setRejectionReason('')
      setExpandedId(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Early check-in acknowledge handler
  const handleAcknowledgeCheckin = async (objectId) => {
    setProcessingId(objectId)
    setActionError(null)
    
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${objectId}/acknowledge-checkin`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewedBy: user?.employeeId })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to acknowledge')
      
      if (onRefresh) onRefresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Extension approve handler
  const handleApproveExtension = async (objectId) => {
    if (!extensionDate) {
      setActionError('Please select new end date')
      return
    }

    setProcessingId(objectId)
    setActionError(null)
    
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${objectId}/approve-extension`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reviewedBy: user?.employeeId,
          newEndDate: extensionDate
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to approve extension')
      
      setExtensionDate('')
      setExpandedId(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  // Extension reject handler  
  const handleRejectExtension = async (objectId) => {
    setProcessingId(objectId)
    setActionError(null)
    
    try {
      const response = await fetch(`http://localhost:3000/api/leaves/${objectId}/reject-extension`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          reviewedBy: user?.employeeId,
          rejectionReason: rejectionReason
        })
      })
      
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Failed to reject extension')
      
      setRejectionReason('')
      setExpandedId(null)
      if (onRefresh) onRefresh()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setProcessingId(null)
    }
  }

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      setRejectionReason('')
      setExtensionDate('')
    } else {
      setExpandedId(id)
      setRejectionReason('')
      setExtensionDate('')
    }
    setActionError(null)
  }

  return (
    <div className="inbox-container">
      {/* Tabs */}
      <div className="inbox-tabs">
        <button 
          className={`inbox-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <Clock size={16} />
          Pending ({pendingRequests.length})
        </button>
        <button 
          className={`inbox-tab ${activeTab === 'approved' ? 'active' : ''}`}
          onClick={() => setActiveTab('approved')}
        >
          <Check size={16} />
          Approved ({approvedRequests.length})
        </button>
        <button 
          className={`inbox-tab ${activeTab === 'rejected' ? 'active' : ''}`}
          onClick={() => setActiveTab('rejected')}
        >
          <X size={16} />
          Rejected ({rejectedRequests.length})
        </button>
        <button 
          className={`inbox-tab ${activeTab === 'checkins' ? 'active' : ''}`}
          onClick={() => setActiveTab('checkins')}
        >
          <LogIn size={16} />
          Check-Ins ({pendingCheckins.length})
        </button>
        <button 
          className={`inbox-tab ${activeTab === 'extensions' ? 'active' : ''}`}
          onClick={() => setActiveTab('extensions')}
        >
          <Plus size={16} />
          Extensions ({pendingExtensions.length})
        </button>
        <button 
          className={`inbox-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <Calendar size={16} />
          All ({allRequests.length})
        </button>
      </div>

      {/* Pending Requests Tab */}
      {activeTab === 'pending' && (
        <div className="requests-list">
          {pendingRequests.length === 0 ? (
            <div className="no-requests">
              <Clock size={48} />
              <h3>No pending requests</h3>
              <p>All leave requests have been reviewed</p>
            </div>
          ) : (
            pendingRequests.map(request => {
              const isExpanded = expandedId === request.id
              const isProcessing = processingId === request.id

              return (
                <div key={request.id} className="request-card">
                  <div className="request-header">
                    <div className="request-avatar">
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="request-info">
                      <div className="request-name-row">
                        <h4>{request.fullName}</h4>
                        {request.isDelegated && (
                          <span className="delegated-badge" title="Delegated Request">
                             Delegated
                          </span>
                        )}
                      </div>
                      <span className="request-time">{formatRelativeTime(request.submittedDate)}</span>
                    </div>
                    <span className={`leave-badge ${request.leaveType}`}>
                      {request.leaveType}
                    </span>
                  </div>

                  <div className="request-details">
                    <div className="detail-item">
                      <Calendar size={16} />
                      <span>{formatDate(request.startDate)} → {formatDate(request.endDate)}</span>
                      <span className="duration-pill">{request.leaveDuration} days</span>
                    </div>
                    {request.reason && (
                      <div className="detail-item reason">
                        <MessageSquare size={16} />
                        <span>{request.reason}</span>
                      </div>
                    )}
                  </div>

                  {actionError && processingId === request.id && (
                    <div className="error-banner">
                      <AlertCircle size={16} />
                      {actionError}
                    </div>
                  )}

                  <div className="request-actions">
                    <button 
                      className="action-btn approve"
                      onClick={() => handleApprove(request.id)}
                      disabled={isProcessing}
                    >
                      <Check size={16} />
                      {isProcessing ? 'Approving...' : 'Approve'}
                    </button>
                    <button 
                      className="action-btn reject"
                      onClick={() => toggleExpand(request.id)}
                      disabled={isProcessing}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <X size={16} />}
                      {isExpanded ? 'Cancel' : 'Reject'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="rejection-form">
                      <label>Rejection Reason</label>
                      <textarea 
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Please provide a reason for rejection..."
                        rows="3"
                      />
                      <button 
                        className="submit-reject-btn"
                        onClick={() => handleReject(request.id)}
                        disabled={!rejectionReason.trim() || isProcessing}
                      >
                        {isProcessing ? 'Rejecting...' : 'Submit Rejection'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Early Check-Ins Tab */}
      {activeTab === 'checkins' && (
        <div className="requests-list">
          {pendingCheckins.length === 0 ? (
            <div className="no-requests">
              <LogIn size={48} />
              <h3>No pending check-ins</h3>
              <p>No early check-ins to acknowledge</p>
            </div>
          ) : (
            pendingCheckins.map(request => {
              const isProcessing = processingId === request.id
              const daysRefunded = request.daysTaken ? request.leaveDuration - request.daysTaken : 0

              return (
                <div key={request.id} className="request-card checkin">
                  <div className="request-header">
                    <div className="request-avatar">
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="request-info">
                      <h4>{request.fullName}</h4>
                      <span className="request-time">{formatRelativeTime(request.modificationRequestedDate)}</span>
                    </div>
                    <span className="modification-badge">Early Check-In</span>
                  </div>

                  <div className="request-details">
                    <div className="detail-item">
                      <strong>Original End:</strong> {formatDate(request.originalEndDate || request.endDate)}
                    </div>
                    <div className="detail-item">
                      <strong>Actual Return:</strong> {formatDate(request.actualEndDate)}
                    </div>
                    <div className="detail-item refund">
                      <strong>Days Refunded:</strong> {daysRefunded} days
                    </div>
                    {request.modificationReason && (
                      <div className="detail-item reason">
                        <MessageSquare size={16} />
                        <span>{request.modificationReason}</span>
                      </div>
                    )}
                  </div>

                  {actionError && processingId === request.id && (
                    <div className="error-banner">
                      <AlertCircle size={16} />
                      {actionError}
                    </div>
                  )}

                  <div className="request-actions">
                    <button 
                      className="action-btn acknowledge"
                      onClick={() => handleAcknowledgeCheckin(request.id)}
                      disabled={isProcessing}
                    >
                      <Check size={16} />
                      {isProcessing ? 'Acknowledging...' : 'Acknowledge'}
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Extensions Tab */}
      {activeTab === 'extensions' && (
        <div className="requests-list">
          {pendingExtensions.length === 0 ? (
            <div className="no-requests">
              <Plus size={48} />
              <h3>No pending extensions</h3>
              <p>No extension requests to review</p>
            </div>
          ) : (
            pendingExtensions.map(request => {
              const isExpanded = expandedId === request.id
              const isProcessing = processingId === request.id

              return (
                <div key={request.id} className="request-card extension">
                  <div className="request-header">
                    <div className="request-avatar">
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="request-info">
                      <h4>{request.fullName}</h4>
                      <span className="request-time">{formatRelativeTime(request.modificationRequestedDate)}</span>
                    </div>
                    <span className="modification-badge extension">Extension Request</span>
                  </div>

                  <div className="request-details">
                    <div className="detail-item">
                      <strong>Current End Date:</strong> {formatDate(request.originalEndDate || request.endDate)}
                    </div>
                    <div className="detail-item">
                      <strong>Leave Type:</strong> {request.leaveType}
                    </div>
                    {request.modificationReason && (
                      <div className="detail-item reason">
                        <MessageSquare size={16} />
                        <span>{request.modificationReason}</span>
                      </div>
                    )}
                  </div>

                  {actionError && processingId === request.id && (
                    <div className="error-banner">
                      <AlertCircle size={16} />
                      {actionError}
                    </div>
                  )}

                  <div className="request-actions">
                    <button 
                      className="action-btn approve"
                      onClick={() => toggleExpand(request.id)}
                      disabled={isProcessing}
                    >
                      {isExpanded ? <ChevronUp size={16} /> : <Check size={16} />}
                      {isExpanded ? 'Cancel' : 'Approve'}
                    </button>
                    <button 
                      className="action-btn reject"
                      onClick={() => {
                        if (expandedId === request.id && expandedId !== 'reject-' + request.id) {
                          setExpandedId('reject-' + request.id)
                        } else {
                          toggleExpand('reject-' + request.id)
                        }
                      }}
                      disabled={isProcessing}
                    >
                      <X size={16} />
                      Reject
                    </button>
                  </div>

                  {/* Approve form */}
                  {isExpanded && !expandedId.startsWith('reject-') && (
                    <div className="extension-form">
                      <label>New End Date</label>
                      <input 
                        type="date"
                        value={extensionDate}
                        onChange={(e) => setExtensionDate(e.target.value)}
                        min={new Date(request.originalEndDate || request.endDate).toISOString().split('T')[0]}
                      />
                      <button 
                        className="submit-approve-btn"
                        onClick={() => handleApproveExtension(request.id)}
                        disabled={!extensionDate || isProcessing}
                      >
                        {isProcessing ? 'Approving...' : 'Approve Extension'}
                      </button>
                    </div>
                  )}

                  {/* Reject form */}
                  {expandedId === 'reject-' + request.id && (
                    <div className="rejection-form">
                      <label>Rejection Reason</label>
                      <textarea 
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Please provide a reason for rejection..."
                        rows="3"
                      />
                      <button 
                        className="submit-reject-btn"
                        onClick={() => handleRejectExtension(request.id)}
                        disabled={!rejectionReason.trim() || isProcessing}
                      >
                        {isProcessing ? 'Rejecting...' : 'Submit Rejection'}
                      </button>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Approved Requests Tab */}
      {activeTab === 'approved' && (
        <div className="requests-list">
          {approvedRequests.length === 0 ? (
            <div className="no-requests">
              <Check size={48} />
              <h3>No approved requests</h3>
              <p>Approved leave requests will appear here</p>
            </div>
          ) : (
            approvedRequests.map(request => (
              <div key={request.id} className="request-card approved-card">
                <div className="request-main">
                  <div className="employee-info">
                    <div className="employee-avatar">
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="employee-details">
                      <h4>{request.fullName}</h4>
                      <span className="leave-type">{request.leaveType} Leave</span>
                    </div>
                  </div>
                  <div className="request-details">
                    <div className="date-range">
                      <Calendar size={14} />
                      {formatDate(request.startDate)} — {formatDate(request.endDate)}
                    </div>
                    <div className="duration">{request.leaveDuration} days</div>
                  </div>
                  <div className="card-actions">
                    <div className="status-badge approved">
                      <Check size={14} />
                      Approved
                    </div>
                    <button 
                      className="btn-text-action"
                      onClick={() => {
                        setSelectedRequest(request)
                        setShowExtensionModal(true)
                      }}
                    >
                      Extend
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {showExtensionModal && selectedRequest && (
        <ManagerExtensionModal 
          request={selectedRequest}
          onClose={() => {
            setShowExtensionModal(false)
            setSelectedRequest(null)
          }}
          onSubmit={() => {
            onRefresh() // Refresh list
          }}
        />
      )}

      {/* Rejected Requests Tab */}
      {activeTab === 'rejected' && (
        <div className="requests-list">
          {rejectedRequests.length === 0 ? (
            <div className="no-requests">
              <X size={48} />
              <h3>No rejected requests</h3>
              <p>Rejected leave requests will appear here</p>
            </div>
          ) : (
            rejectedRequests.map(request => (
              <div key={request.id} className="request-card rejected-card">
                <div className="request-main">
                  <div className="employee-info">
                    <div className="employee-avatar rejected-avatar">
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="employee-details">
                      <h4>{request.fullName}</h4>
                      <span className="leave-type">{request.leaveType} Leave</span>
                    </div>
                  </div>
                  <div className="request-details">
                    <div className="date-range">
                      <Calendar size={14} />
                      {formatDate(request.startDate)} — {formatDate(request.endDate)}
                    </div>
                    <div className="duration">{request.leaveDuration} days</div>
                  </div>
                  <div className="status-badge rejected">
                    <X size={14} />
                    Rejected
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* All Requests Tab */}
      {activeTab === 'all' && (
        <div className="requests-list">
          {allRequests.length === 0 ? (
            <div className="no-requests">
              <Calendar size={48} />
              <h3>No requests</h3>
              <p>Leave requests will appear here</p>
            </div>
          ) : (
            allRequests.map(request => (
              <div key={request.id} className={`request-card ${request.status}-card`}>
                <div className="request-main">
                  <div className="employee-info">
                    <div className={`employee-avatar ${request.status === 'rejected' ? 'rejected-avatar' : ''}`}>
                      {getInitials(request.firstName, request.lastName)}
                    </div>
                    <div className="employee-details">
                      <h4>{request.fullName}</h4>
                      <span className="leave-type">{request.leaveType} Leave</span>
                    </div>
                  </div>
                  <div className="request-details">
                    <div className="date-range">
                      <Calendar size={14} />
                      {formatDate(request.startDate)} — {formatDate(request.endDate)}
                    </div>
                    <div className="duration">{request.leaveDuration} days</div>
                  </div>
                  <div className={`status-badge ${request.status}`}>
                    {request.status === 'approved' && <Check size={14} />}
                    {request.status === 'rejected' && <X size={14} />}
                    {request.status === 'pending' && <Clock size={14} />}
                    {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export default Inbox
