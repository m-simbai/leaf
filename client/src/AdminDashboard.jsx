import { useState, useEffect, useMemo } from 'react'
import { Users, UserPlus, Key, Trash2, Edit2, X, Check, Search, Shield, Filter, AlertTriangle, Circle, Link2 } from 'lucide-react'
import './AdminDashboard.css'

function AdminDashboard({ user }) {
  const [users, setUsers] = useState([])
  const [managers, setManagers] = useState([])
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [activeAdminTab, setActiveAdminTab] = useState('users') // 'users' or 'assignments'
  
  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  
  const [selectedUser, setSelectedUser] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/admin/users')
      const data = await response.json()
      if (data.success) {
        setUsers(data.users)
      }
    } catch (err) {
      console.error('Error fetching users:', err)
    } finally {
      setLoading(false)
    }
  }

  // Fetch leaves for duty status
  const fetchLeaves = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/leaves')
      const data = await response.json()
      if (data.success) {
        setLeaves(data.leaves || [])
      }
    } catch (err) {
      console.error('Error fetching leaves:', err)
    }
  }

  // Fetch managers for assignment dropdown
  const fetchManagers = async () => {
    try {
      const response = await fetch('http://localhost:3000/api/managers')
      const data = await response.json()
      if (data.success) {
        setManagers(data.managers || [])
      }
    } catch (err) {
      console.error('Error fetching managers:', err)
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchLeaves()
    fetchManagers()
  }, [])

  // Check if user is on leave today
  const isUserOnLeave = (employeeId) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    return leaves.some(leave => {
      const attrs = leave.attributes || leave
      if (attrs.EmployeeID !== employeeId) return false
      if (attrs.Status !== 'approved') return false
      
      const startDate = new Date(attrs.StartDate)
      const endDate = new Date(attrs.EndDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      
      return today >= startDate && today <= endDate
    })
  }

  // Get current leave type for user (if on leave)
  const getUserLeaveType = (employeeId) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const activeLeave = leaves.find(leave => {
      const attrs = leave.attributes || leave
      if (attrs.EmployeeID !== employeeId) return false
      if (attrs.Status !== 'approved') return false
      
      const startDate = new Date(attrs.StartDate)
      const endDate = new Date(attrs.EndDate)
      startDate.setHours(0, 0, 0, 0)
      endDate.setHours(23, 59, 59, 999)
      
      return today >= startDate && today <= endDate
    })
    
    return activeLeave ? (activeLeave.attributes || activeLeave).LeaveType : null
  }

  // Filter users by search AND exclude current admin
  const filteredUsers = users
    .filter(u => {
      // Exclude current admin by multiple identifiers for robustness
      if (u.id === user?.id) return false;
      if (u.username === user?.username) return false;
      if (u.employeeId === user?.employeeId) return false;
      return true;
    })
    .filter(u => showInactive || u.isActive) // Filter inactive unless toggle is on
    .filter(u => 
      u.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )

  // Get initials
  const getInitials = (first, last) => {
    return `${first?.[0] || ''}${last?.[0] || ''}`.toUpperCase()
  }

  // Handle delete
  const handleDelete = async () => {
    if (!selectedUser) return
    
    try {
      const response = await fetch(`http://localhost:3000/api/admin/users/${selectedUser.id}`, {
        method: 'DELETE'
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('User deactivated successfully')
        fetchUsers()
        setShowDeleteModal(false)
        setSelectedUser(null)
      } else {
        setError(data.error)
      }
    } catch (err) {
      setError('Failed to deactivate user')
    }
  }

  // Handle reactivate
  const handleReactivate = async (userId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('User reactivated successfully')
        fetchUsers()
      }
    } catch (err) {
      setError('Failed to reactivate user')
    }
  }

  // Handle manager assignment
  const handleAssignManager = async (userId, managerId) => {
    try {
      const response = await fetch(`http://localhost:3000/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ managerId: managerId || null })
      })
      const data = await response.json()
      if (data.success) {
        setSuccess('Manager assignment updated')
        fetchUsers()
      } else {
        throw new Error(data.error || 'Failed to update assignment')
      }
    } catch (err) {
      setError(err.message || 'Failed to update manager assignment')
    }
  }

  // Get staff members only (for assignments view)
  const staffUsers = useMemo(() => {
    return users.filter(u => 
      u.isActive && 
      u.role?.toLowerCase() === 'staff'
    ).sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''))
  }, [users])

  // Get manager name by ID
  const getManagerName = (managerId) => {
    if (!managerId) return 'Unassigned'
    const manager = managers.find(m => m.employeeId === managerId)
    return manager ? `${manager.firstName} ${manager.lastName}` : 'Unknown'
  }

  // Clear messages after 3 seconds
  useEffect(() => {
    if (error || success) {
      const timer = setTimeout(() => {
        setError('')
        setSuccess('')
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [error, success])

  return (
    <div className="admin-dashboard">
      {/* Tab Navigation */}
      <div className="admin-tabs">
        <button 
          className={`admin-tab ${activeAdminTab === 'users' ? 'active' : ''}`}
          onClick={() => setActiveAdminTab('users')}
        >
          <Users size={18} />
          User Management
        </button>
        <button 
          className={`admin-tab ${activeAdminTab === 'assignments' ? 'active' : ''}`}
          onClick={() => setActiveAdminTab('assignments')}
        >
          <Link2 size={18} />
          Staff Assignments
        </button>
      </div>

      {/* Header - changes based on tab */}
      <div className="admin-header">
        <div className="header-left">
          {activeAdminTab === 'users' ? (
            <>
              <Shield size={28} className="header-icon" />
              <div>
                <h1>User Management</h1>
                <p>Manage accounts, roles, and permissions</p>
              </div>
            </>
          ) : (
            <>
              <Link2 size={28} className="header-icon assignments" />
              <div>
                <h1>Staff Assignments</h1>
                <p>Assign staff members to their line managers</p>
              </div>
            </>
          )}
        </div>
        {activeAdminTab === 'users' && (
          <button className="btn-primary" onClick={() => setShowAddModal(true)}>
            <UserPlus size={18} />
            Add User
          </button>
        )}
      </div>

      {/* Messages */}
      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      {/* USER MANAGEMENT TAB */}
      {activeAdminTab === 'users' && (
        <>
          {/* Stats */}
          <div className="admin-stats">
            <div className="stat-card">
              <div className="stat-icon users"><Users size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{users.length}</span>
                <span className="stat-label">Total Users</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon active"><Check size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{users.filter(u => u.isActive).length}</span>
                <span className="stat-label">Active</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon managers"><Shield size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{users.filter(u => u.role?.toLowerCase() === 'manager').length}</span>
                <span className="stat-label">Managers</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon staff"><Users size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{users.filter(u => u.role?.toLowerCase() === 'staff').length}</span>
                <span className="stat-label">Staff</span>
              </div>
            </div>
          </div>

      {/* Toolbar: Search + Filter */}
      <div className="toolbar">
        <div className="search-bar">
          <Search size={20} />
          <input 
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>
        
        <label className="filter-toggle">
          <input 
            type="checkbox" 
            checked={showInactive} 
            onChange={e => setShowInactive(e.target.checked)} 
          />
          <span className="toggle-slider"></span>
          <span className="toggle-label">Show Inactive</span>
        </label>
      </div>

      {/* Users Table */}
      <div className="users-table-container">
        {loading ? (
          <div className="loading">Loading users...</div>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Username</th>
                <th className="align-center">Role</th>
                <th>Department</th>
                <th className="align-center">Status</th>
                <th className="align-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan="7" className="empty-state">No users found</td>
                </tr>
              ) : (
                filteredUsers.map(u => (
                  <tr key={u.id} className={!u.isActive ? 'inactive' : ''}>
                    <td>
                      <div className="user-cell">
                        <div className={`user-avatar ${u.role?.toLowerCase()}`}>
                          {getInitials(u.firstName, u.lastName)}
                        </div>
                        <span className="user-name">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="user-email">{u.email}</td>
                    <td className="username">{u.username}</td>
                    <td className="align-center">
                      <span className={`role-badge ${u.role?.toLowerCase()}`}>
                        {u.role}
                      </span>
                    </td>
                    <td>{u.department || '-'}</td>
                    <td className="align-center">
                      {u.isActive ? (
                        isUserOnLeave(u.employeeId) ? (
                          <span className="status-badge on-leave" title={`On ${getUserLeaveType(u.employeeId)}`}>
                            On Leave
                          </span>
                        ) : (
                          <span className="status-badge on-duty">
                            On Duty
                          </span>
                        )
                      ) : (
                        <span className="status-badge inactive">
                          Inactive
                        </span>
                      )}
                    </td>
                    <td className="align-center">
                      <div className="action-buttons">
                        <button 
                          className="btn-icon edit"
                          title="Edit User"
                          onClick={() => {
                            setSelectedUser(u)
                            setShowEditModal(true)
                          }}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          className="btn-icon key"
                          title="Reset Password"
                          onClick={() => {
                            setSelectedUser(u)
                            setShowResetModal(true)
                          }}
                        >
                          <Key size={16} />
                        </button>
                        {u.isActive ? (
                          <button 
                            className="btn-icon delete"
                            title="Deactivate User"
                            onClick={() => {
                              setSelectedUser(u)
                              setShowDeleteModal(true)
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          <button 
                            className="btn-icon reactivate"
                            title="Reactivate User"
                            onClick={() => handleReactivate(u.id)}
                          >
                            <Check size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
        </>
      )}

      {/* STAFF ASSIGNMENTS TAB */}
      {activeAdminTab === 'assignments' && (
        <div className="assignments-container">
          <div className="assignments-stats">
            <div className="stat-card">
              <div className="stat-icon staff"><Users size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{staffUsers.length}</span>
                <span className="stat-label">Staff Members</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon managers"><Shield size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{managers.length}</span>
                <span className="stat-label">Available Managers</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon active"><Check size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{staffUsers.filter(u => u.managerId).length}</span>
                <span className="stat-label">Assigned</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon warning"><AlertTriangle size={24} /></div>
              <div className="stat-info">
                <span className="stat-value">{staffUsers.filter(u => !u.managerId).length}</span>
                <span className="stat-label">Unassigned</span>
              </div>
            </div>
          </div>

          <div className="assignments-table-container">
            {loading ? (
              <div className="loading">Loading staff...</div>
            ) : (
              <table className="assignments-table">
                <thead>
                  <tr>
                    <th>Staff Member</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Assigned Manager</th>
                  </tr>
                </thead>
                <tbody>
                  {staffUsers.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="empty-state">No staff members found</td>
                    </tr>
                  ) : (
                    staffUsers.map(staff => (
                      <tr key={staff.id} className={!staff.managerId ? 'unassigned' : ''}>
                        <td>
                          <div className="user-cell">
                            <div className="user-avatar staff">
                              {getInitials(staff.firstName, staff.lastName)}
                            </div>
                            <span className="user-name">{staff.firstName} {staff.lastName}</span>
                          </div>
                        </td>
                        <td className="user-email">{staff.email}</td>
                        <td>{staff.department || '-'}</td>
                        <td>
                          <select
                            className="manager-select"
                            value={staff.managerId || ''}
                            onChange={(e) => handleAssignManager(staff.id, e.target.value)}
                          >
                            <option value="">None (Unassigned)</option>
                            {managers.map(mgr => (
                              <option key={mgr.employeeId} value={mgr.employeeId}>
                                {mgr.firstName} {mgr.lastName}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}


      {showAddModal && (
        <AddUserModal 
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false)
            setSuccess('User created successfully')
            fetchUsers()
          }}
        />
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <EditUserModal 
          user={selectedUser}
          onClose={() => {
            setShowEditModal(false)
            setSelectedUser(null)
          }}
          onSuccess={() => {
            setShowEditModal(false)
            setSelectedUser(null)
            setSuccess('User updated successfully')
            fetchUsers()
          }}
        />
      )}

      {/* Reset Password Modal */}
      {showResetModal && selectedUser && (
        <ResetPasswordModal 
          user={selectedUser}
          onClose={() => {
            setShowResetModal(false)
            setSelectedUser(null)
          }}
          onSuccess={() => {
            setShowResetModal(false)
            setSelectedUser(null)
            setSuccess('Password reset successfully')
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && selectedUser && (
        <DeleteConfirmModal 
          user={selectedUser}
          onClose={() => {
            setShowDeleteModal(false)
            setSelectedUser(null)
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}

// Add User Modal Component
function AddUserModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    username: '',
    password: '',
    role: 'staff',
    department: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch('http://localhost:3000/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || 'Failed to create user')
      }
    } catch (err) {
      setError('Failed to create user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}><X size={24} /></button>
        <div className="modal-header">
          <UserPlus size={24} className="modal-icon" />
          <h2>Add New User</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-row">
            <div className="form-group">
              <label>First Name *</label>
              <input 
                type="text"
                className="form-control"
                value={form.firstName}
                onChange={e => setForm({...form, firstName: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Last Name *</label>
              <input 
                type="text"
                className="form-control"
                value={form.lastName}
                onChange={e => setForm({...form, lastName: e.target.value})}
                required
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email *</label>
            <input 
              type="email"
              className="form-control"
              value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Username *</label>
              <input 
                type="text"
                className="form-control"
                value={form.username}
                onChange={e => setForm({...form, username: e.target.value})}
                required
              />
            </div>
            <div className="form-group">
              <label>Password *</label>
              <input 
                type="password"
                className="form-control"
                value={form.password}
                onChange={e => setForm({...form, password: e.target.value})}
                required
                minLength={4}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Role *</label>
              <select 
                className="form-control"
                value={form.role}
                onChange={e => setForm({...form, role: e.target.value})}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>Department</label>
              <input 
                type="text"
                className="form-control"
                value={form.department}
                onChange={e => setForm({...form, department: e.target.value})}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Edit User Modal Component
function EditUserModal({ user, onClose, onSuccess }) {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    role: user.role || 'staff',
    department: user.department || ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const response = await fetch(`http://localhost:3000/api/admin/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      })
      const data = await response.json()
      
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || 'Failed to update user')
      }
    } catch (err) {
      setError('Failed to update user')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}><X size={24} /></button>
        <div className="modal-header">
          <Edit2 size={24} className="modal-icon" />
          <h2>Edit User</h2>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-row">
            <div className="form-group">
              <label>First Name</label>
              <input 
                type="text"
                className="form-control"
                value={form.firstName}
                onChange={e => setForm({...form, firstName: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Last Name</label>
              <input 
                type="text"
                className="form-control"
                value={form.lastName}
                onChange={e => setForm({...form, lastName: e.target.value})}
              />
            </div>
          </div>

          <div className="form-group">
            <label>Email</label>
            <input 
              type="email"
              className="form-control"
              value={form.email}
              onChange={e => setForm({...form, email: e.target.value})}
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Role</label>
              <select 
                className="form-control"
                value={form.role}
                onChange={e => setForm({...form, role: e.target.value})}
              >
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div className="form-group">
              <label>Department</label>
              <input 
                type="text"
                className="form-control"
                value={form.department}
                onChange={e => setForm({...form, department: e.target.value})}
              />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Reset Password Modal Component
function ResetPasswordModal({ user, onClose, onSuccess }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (newPassword.length < 4) {
      setError('Password must be at least 4 characters')
      return
    }

    setLoading(true)
    setError('')

    try {
      const response = await fetch(`http://localhost:3000/api/admin/users/${user.id}/reset-password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword })
      })
      const data = await response.json()
      
      if (data.success) {
        onSuccess()
      } else {
        setError(data.error || 'Failed to reset password')
      }
    } catch (err) {
      setError('Failed to reset password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <button className="modal-close" onClick={onClose}><X size={24} /></button>
        <div className="modal-header">
          <Key size={24} className="modal-icon" />
          <h2>Reset Password</h2>
        </div>
        
        <p className="modal-subtitle">
          Resetting password for <strong>{user.firstName} {user.lastName}</strong>
        </p>

        <form onSubmit={handleSubmit} className="modal-body">
          {error && <div className="error-message">{error}</div>}
          
          <div className="form-group">
            <label>New Password</label>
            <input 
              type="password"
              className="form-control"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              required
              minLength={4}
            />
          </div>

          <div className="form-group">
            <label>Confirm Password</label>
            <input 
              type="password"
              className="form-control"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Delete Confirmation Modal
function DeleteConfirmModal({ user, onClose, onConfirm }) {
  const [confirmName, setConfirmName] = useState('')
  const [error, setError] = useState('')

  const handleSubmit = (e) => {
    e.preventDefault()
    if (confirmName !== user.username) {
      setError('Username does not match')
      return
    }
    onConfirm()
  }

  return (
    <div className="modal-overlay">
      <div className="modal-content danger">
        <button className="modal-close" onClick={onClose}><X size={24} /></button>
        <div className="modal-header">
          <AlertTriangle size={24} className="modal-icon danger" />
          <h2>Deactivate User</h2>
        </div>
        
        <p className="modal-subtitle">
          Are you sure you want to deactivate <strong>{user.firstName} {user.lastName}</strong>?
          This will remove their access to the system.
        </p>

        <form onSubmit={handleSubmit} className="modal-body">
          <div className="form-group">
            <label>Type <strong>{user.username}</strong> to confirm</label>
            <input 
              type="text"
              className="form-control"
              value={confirmName}
              onChange={e => {
                setConfirmName(e.target.value)
                setError('')
              }}
              placeholder="Enter username"
              autoFocus
            />
            {error && <div className="error-message small">{error}</div>}
          </div>

          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button 
              type="submit" 
              className="btn-danger" 
              disabled={confirmName !== user.username}
            >
              Deactivate User
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdminDashboard
