import { useState, useEffect } from 'react'
import { Users, Clock, TrendingUp, TrendingDown, Calendar as CalendarIcon, AlertCircle } from 'lucide-react'
import './TeamView.css'

function TeamView({ leaves = [], user }) {
  const [filter, setFilter] = useState('all') // all, in, out
  const [employees, setEmployees] = useState([])

  // Fetch employees to validate status/existence
  useEffect(() => {
    fetch(`http://localhost:3000/api/employees?t=${Date.now()}`)
      .then(res => res.json())
      .then(data => {
        if (data.features) {
          const empMap = data.features
            .map(f => f.attributes)
            .filter(attr => attr.IsActive !== 0 && attr.IsActive !== '0') // Active only
            .map(attr => ({
              employeeId: attr.EmployeeID,
              firstName: attr.FirstName,
              lastName: attr.LastName,
              fullName: `${attr.FirstName} ${attr.LastName}`,
              managerId: attr.ManagerID,
              role: attr.Role
            }))
          setEmployees(empMap)
        }
      })
      .catch(console.error)
  }, [])

// ...

  // Group leaves by employee and get most relevant leave for each
  const getUniqueEmployeesWithCurrentLeave = () => {
    if (!employees.length) return [] // Wait for employees to load

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    // Group leaves by employee name
    const employeeMap = new Map()
    
    // 1. Process Leaves (Only for Active Employees)
    leaves
      .filter(feature => feature.attributes.Status === 'approved')
      .forEach(feature => {
        const attrs = feature.attributes
        const employeeId = attrs.EmployeeID
        
        // STRICT FILTER: Check if employee is active
        const activeEmp = employees.find(e => e.employeeId === employeeId)
        if (!activeEmp) return // Skip ghost users
        
        const employeeName = activeEmp.fullName

        const startDate = new Date(attrs.StartDate)
        const endDate = new Date(attrs.EndDate)
        
        // Skip invalid dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return
        
        startDate.setHours(0, 0, 0, 0)
        endDate.setHours(0, 0, 0, 0)
        
        const leaveData = {
          id: attrs.OBJECTID,
          startDate,
          endDate,
          leaveType: attrs.LeaveType,
          daysRequested: attrs.DaysRequested || Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1,
          isCurrentlyActive: today >= startDate && today <= endDate,
          isUpcoming: today < startDate,
          isPast: today > endDate
        }
        
        const key = employeeId // Use ID as key for reliability
        
        if (!employeeMap.has(key)) {
          employeeMap.set(key, {
            employeeName,
            employeeId,
            firstName: activeEmp.firstName,
            lastName: activeEmp.lastName,
            email: activeEmp.email, // We might not have email in employees fetch above, verify?
            leaves: []
          })
        }
        
        employeeMap.get(key).leaves.push(leaveData)
      })
    
    // Filter employees based on reporting lines (My Team Logic)
    let teamEmployees = employees;
    if (user?.role?.toLowerCase() === 'manager') {
      teamEmployees = employees.filter(e => e.managerId === user.employeeId);
    } else if (user?.role?.toLowerCase() === 'staff') {
      // Show peers (same manager)
      teamEmployees = employees.filter(e => e.managerId === user.managerId);
    }
    // Admin sees everyone (default)

    const uniqueEmployees = []
    
    teamEmployees.forEach(emp => {
      const employeeId = emp.employeeId
      const key = employeeId
      
      // Check if this employee has any relevant leaves
      const empLeaveData = employeeMap.get(key)
      let mostRelevantLeave = null
      let empLeaves = [] // ... rest of existing logic ...
      
      if (empLeaveData) {
        empLeaves = empLeaveData.leaves
        // Sort by relevance
        empLeaves.sort((a, b) => {
          if (a.isCurrentlyActive && !b.isCurrentlyActive) return -1
          if (!a.isCurrentlyActive && b.isCurrentlyActive) return 1
          if (a.isUpcoming && b.isUpcoming) return a.startDate - b.startDate
          if (a.isUpcoming && !b.isUpcoming) return -1
          if (!a.isUpcoming && b.isUpcoming) return 1
          return b.endDate - a.endDate
        })
        mostRelevantLeave = empLeaves[0]
      }
      
      let daysInfo = {}
      let isCurrentlyOut = false
      
      if (mostRelevantLeave) {
        isCurrentlyOut = mostRelevantLeave.isCurrentlyActive
        
        if (isCurrentlyOut) {
          const daysUntilBack = Math.ceil((mostRelevantLeave.endDate - today) / (1000 * 60 * 60 * 24))
          daysInfo = {
            label: 'Returns in',
            value: daysUntilBack,
            unit: daysUntilBack === 1 ? 'day' : 'days',
            type: 'returning'
          }
        } else if (mostRelevantLeave.isUpcoming) {
          const daysUntilLeave = Math.ceil((mostRelevantLeave.startDate - today) / (1000 * 60 * 60 * 24))
          daysInfo = {
            label: 'Leaves in',
            value: daysUntilLeave,
            unit: daysUntilLeave === 1 ? 'day' : 'days',
            type: 'leaving'
          }
        } else {
          // Past leave found, but currently available
          daysInfo = { label: 'Available', value: null, unit: '', type: 'available' }
        }
      } else {
        // No leaves found at all
        daysInfo = { label: 'Available', value: null, unit: '', type: 'available' }
      }
      
      uniqueEmployees.push({
        id: mostRelevantLeave ? mostRelevantLeave.id : `emp-${employeeId}`,
        firstName: emp.firstName,
        lastName: emp.lastName,
        fullName: emp.fullName,
        email: emp.email || `${(emp.firstName || 'user').toLowerCase()}@chewore.com`, // Fallback email
        employeeId,
        startDate: mostRelevantLeave ? mostRelevantLeave.startDate : null,
        endDate: mostRelevantLeave ? mostRelevantLeave.endDate : null,
        isCurrentlyOut,
        daysInfo,
        leaveDuration: mostRelevantLeave ? mostRelevantLeave.daysRequested : 0,
        leaveType: mostRelevantLeave ? mostRelevantLeave.leaveType : null,
        totalLeaves: empLeaves.length
      })
    })
    
    return uniqueEmployees
  }
  
  const processedPeople = getUniqueEmployeesWithCurrentLeave()

  // Filter people
  const filteredPeople = processedPeople.filter(person => {
    if (filter === 'in') return !person.isCurrentlyOut
    if (filter === 'out') return person.isCurrentlyOut
    return true
  })

  // Calculate statistics
  const totalPeople = processedPeople.length
  const peopleOut = processedPeople.filter(p => p.isCurrentlyOut).length
  const peopleIn = totalPeople - peopleOut
  const avgLeaveDays = totalPeople > 0 
    ? (processedPeople.reduce((sum, p) => sum + p.leaveDuration, 0) / totalPeople).toFixed(1)
    : 0

  // Get initials
  const getInitials = (firstName, lastName) => {
    const first = firstName?.charAt(0)?.toUpperCase() || ''
    const last = lastName?.charAt(0)?.toUpperCase() || ''
    return first + last || '?'
  }

  // Format date safely
  const formatDate = (date) => {
    if (!date || isNaN(date.getTime())) return 'Invalid Date'
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="team-view">
      {/* Stats Summary */}
      <div className="team-stats">
        <div className="stat-card">
          <div className="stat-icon total">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{totalPeople}</span>
            <span className="stat-label">Total team</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon in">
            <TrendingUp size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{peopleIn}</span>
            <span className="stat-label">In office</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon out">
            <TrendingDown size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{peopleOut}</span>
            <span className="stat-label">On leave</span>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon avg">
            <CalendarIcon size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{avgLeaveDays}</span>
            <span className="stat-label">Avg. leave days</span>
          </div>
        </div>
      </div>

      {/* Upcoming Alert */}
      {processedPeople.filter(p => p.daysInfo.type === 'leaving' && p.daysInfo.value <= 7).length > 0 && (
        <div className="upcoming-alert">
          <AlertCircle size={20} />
          <span>
            <strong>{processedPeople.filter(p => p.daysInfo.type === 'leaving' && p.daysInfo.value <= 7).length}</strong> team member(s) going on leave within 7 days
          </span>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button 
          className={`filter-tab ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All ({totalPeople})
        </button>
        <button 
          className={`filter-tab ${filter === 'in' ? 'active' : ''}`}
          onClick={() => setFilter('in')}
        >
          In Office ({peopleIn})
        </button>
        <button 
          className={`filter-tab ${filter === 'out' ? 'active' : ''}`}
          onClick={() => setFilter('out')}
        >
          On Leave ({peopleOut})
        </button>
      </div>

      {/* Team List */}
      <div className="team-list">
        {filteredPeople.length === 0 ? (
          <div className="no-results">
            <Users size={48} />
            <h3>No team members found</h3>
            <p>No one matches the current filter.</p>
          </div>
        ) : (
          filteredPeople.map((person, idx) => (
            <div key={person.id || idx} className={`team-card ${person.isCurrentlyOut ? 'out' : 'in'}`}>
              <div className="team-card-left">
                <div className={`team-avatar ${person.isCurrentlyOut ? 'out' : 'in'}`}>
                  {getInitials(person.firstName, person.lastName)}
                </div>
                <div className="team-info">
                  <h4>{person.fullName}</h4>
                  <span className="team-email">{person.email}</span>
                </div>
              </div>

              <div className="team-card-middle">
                {person.startDate ? (
                  <>
                    <div className="date-range">
                      <CalendarIcon size={16} />
                      <span>
                        {formatDate(person.startDate)} — {formatDate(person.endDate)}
                      </span>
                    </div>
                    <div className="duration">
                      <Clock size={14} />
                      <span>{person.leaveDuration} days leave</span>
                    </div>
                  </>
                ) : (
                  <div className="available-status">
                    <span className="text-gray-400 text-sm">Present</span>
                  </div>
                )}
              </div>

              <div className="team-card-right">
                {person.daysInfo.value !== null ? (
                  <div className={`countdown ${person.daysInfo.type}`}>
                    <span className="countdown-label">{person.daysInfo.label}</span>
                    <span className="countdown-value">{person.daysInfo.value}</span>
                    <span className="countdown-unit">{person.daysInfo.unit}</span>
                  </div>
                ) : (
                  <div className="status-badge available">
                    <span>Available</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default TeamView
