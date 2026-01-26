import { useState, useMemo, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Circle, User } from 'lucide-react'
import './Calendar.css'

function Calendar({ leaves = [], user }) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [hoveredPerson, setHoveredPerson] = useState(null)
  const [projectedSchedule, setProjectedSchedule] = useState([])
  const [cycleStatus, setCycleStatus] = useState(null)
  const [employees, setEmployees] = useState([])

  // Fetch employees for live name lookups
  useEffect(() => {
    fetch('/api/employees')
      .then(res => res.json())
      .then(data => {
        if (data.features) {
          const empMap = data.features.map(f => ({
            employeeId: f.attributes.EmployeeID,
            firstName: f.attributes.FirstName,
            lastName: f.attributes.LastName,
            fullName: `${f.attributes.FirstName} ${f.attributes.LastName}`,
            managerId: f.attributes.ManagerID,
            role: f.attributes.Role
          }))
          setEmployees(empMap)
        }
      })
      .catch(console.error)
  }, [])

  // ... (keep existing useEffect for projected schedule) ...

  // Get days in month
  const getDaysInMonth = (year, month) => {
    return new Date(year, month + 1, 0).getDate()
  }

  // Get first day of month (0 = Sunday)
  const getFirstDayOfMonth = (year, month) => {
    return new Date(year, month, 1).getDay()
  }

  // Navigate months
  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Get initials from name
  const getInitials = (firstName, lastName) => {
    const first = firstName?.charAt(0)?.toUpperCase() || ''
    const last = lastName?.charAt(0)?.toUpperCase() || ''
    return first + last || '?'
  }

  // Process leave data to determine who is in/out on each day
  const processedLeaves = useMemo(() => {
    // Privacy Filter: 
    // If user is staff, only show their own leaves.
    // If manager, show everyone.
    let visibleLeaves = leaves;
    const userRole = user?.role?.toLowerCase();
    
    if (userRole === 'staff') {
      visibleLeaves = leaves.filter(l => 
        l.attributes.EmployeeID === user.employeeId || 
        l.attributes.EmployeeID === user.username
      );
    }

    return visibleLeaves.map(feature => {
      const attrs = feature.attributes
      const startDate = new Date(attrs.StartDate)
      const endDate = new Date(attrs.EndDate)
      
      // Look up live employee name from employees state
      const liveEmployee = employees.find(e => e.employeeId === attrs.EmployeeID)
      
      // Strict Filter: If employee is not found in active list, do not show this leave
      if (!liveEmployee) return null

      const fullName = liveEmployee.fullName
      const firstName = liveEmployee.firstName
      const lastName = liveEmployee.lastName
      
      return {
        id: attrs.OBJECTID,
        employeeId: attrs.EmployeeID,
        fullName,
        firstName,
        lastName,
        startDate,
        endDate,
        status: 'out',
        type: (attrs.LeaveType === 'Annual' || attrs.LeaveType === 'Annual Leave' ? 'Time-Off' : 
               attrs.LeaveType === 'Other' || attrs.LeaveType === 'Other Leave' ? 'Compassionate' : 
               attrs.LeaveType || 'Time-Off'),
        requestStatus: attrs.Status
      }
    })
    .filter(leave => leave !== null) // Remove nulls (inactive users)
    .filter(leave => leave.requestStatus === 'approved') // Only show approved leaves on calendar
  }, [leaves, user, employees])

  // Helper to get relevant team members based on role
  const getMyTeam = () => {
    if (!employees.length) return []
    const role = user?.role?.toLowerCase()
    
    if (role === 'manager') {
      return employees.filter(e => e.managerId === user.employeeId)
    }
    if (role === 'director') {
      return employees.filter(e => e.role?.toLowerCase() === 'manager')
    }
    if (role === 'staff') {
      // Staff see their own team members? Or just themselves?
      // For now, let's show their team members (peers)
      return employees.filter(e => e.managerId === user.managerId)
    }
    return [] // Admin or unknown
  }

  // Check if a person is out on a specific date
  const isPersonOutOnDate = (person, date) => {
    const checkDate = new Date(date)
    checkDate.setHours(0, 0, 0, 0)
    
    // Safely parse dates
    const start = new Date(person.startDate)
    start.setHours(0, 0, 0, 0)
    
    const end = new Date(person.endDate)
    end.setHours(0, 0, 0, 0)
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return false
    
    return checkDate >= start && checkDate <= end
  }

  // Get people status for a specific day (Grouped by employee)
  const getPeopleForDay = (day) => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const checkDate = new Date(year, month, day)
    checkDate.setHours(0, 0, 0, 0)
    
    // Find all leaves active on this day
    const activeLeaves = processedLeaves.filter(person => {
      // Safely check dates
      const start = new Date(person.startDate)
      start.setHours(0, 0, 0, 0)
      
      const end = new Date(person.endDate)
      end.setHours(0, 0, 0, 0)
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return false
      
      return checkDate >= start && checkDate <= end
    })

    // Group by employee to avoid duplicates
    const uniquePeople = new Map()
    const peopleOutIds = new Set()
    
    // 1. Add Approved Leaves (Priority)
    activeLeaves.forEach(leave => {
      // If employee already exists for this day, prioritize special leave types
      if (uniquePeople.has(leave.employeeId)) {
        const existing = uniquePeople.get(leave.employeeId)
        if (leave.type === 'sick' || leave.type === 'compassionate') {
          uniquePeople.set(leave.employeeId, { ...leave, isOut: true })
        }
      } else {
        uniquePeople.set(leave.employeeId, { ...leave, isOut: true })
      }
      peopleOutIds.add(leave.employeeId)
    })

    // 2. Add Projected Off Days (If Staff View & Not already covered)
    if (user?.role?.toLowerCase() === 'staff') {
      const dateKey = checkDate.toISOString().split('T')[0]
      const projected = projectedSchedule.find(s => s.date === dateKey && s.type === 'projected-off')
      
      if (projected && !uniquePeople.has(user.employeeId)) {
        uniquePeople.set(user.employeeId, {
          id: `proj-${dateKey}`,
          employeeId: user.employeeId,
          firstName: user.firstName,
          lastName: user.lastName,
          fullName: `${user.firstName} ${user.lastName}`,
          startDate: checkDate,
          endDate: checkDate,
          status: 'projected-out',
          type: 'annual', // Projected time-off is annual
          isOut: true,
          isProjected: true
        })
        peopleOutIds.add(user.employeeId)
      }
    }

    // 3. Add 'On Duty' indicators (Green Dots)
    // Show 'On Duty' for all days including weekends to avoid blank spaces
    const myTeam = getMyTeam()
    myTeam.forEach(member => {
      if (!peopleOutIds.has(member.employeeId)) {
        // This person is ON DUTY
        uniquePeople.set(member.employeeId, {
          id: `duty-${member.employeeId}-${day}`,
          employeeId: member.employeeId,
          firstName: member.firstName,
          lastName: member.lastName,
          fullName: member.fullName,
          type: 'duty',
          status: 'in',
          isOut: false
        })
      }
    })

    return Array.from(uniquePeople.values())
  }

  // Build calendar grid
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)
  const today = new Date()
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  // Create calendar days array
  const calendarDays = []
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null) // Empty cells before first day
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  // Get current status for sidebar (Team Status) with grouping
  const getPeopleOnLeaveToday = () => {
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    
    // Find all active approved leaves for today
    const activeLeaves = processedLeaves.filter(leave => {
      const start = new Date(leave.startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(leave.endDate)
      end.setHours(0, 0, 0, 0)
      return todayDate >= start && todayDate <= end
    })

    // Group by employee to avoid duplicates
    const uniquePeople = new Map()
    activeLeaves.forEach(leave => {
      if (uniquePeople.has(leave.employeeId)) {
        const existing = uniquePeople.get(leave.employeeId)
        if (leave.type === 'sick' || leave.type === 'compassionate') {
          uniquePeople.set(leave.employeeId, { ...leave, isCurrentlyOut: true })
        }
      } else {
        uniquePeople.set(leave.employeeId, { ...leave, isCurrentlyOut: true })
      }
    })

    return Array.from(uniquePeople.values())
  }

  const peopleOnLeaveToday = getPeopleOnLeaveToday()

  const isStaffView = user?.role?.toLowerCase() === 'staff'

  // Helper for dot colors
  const getDotColor = (type) => {
    const t = (type || '').toLowerCase();
    if (t === 'duty') return 'bg-green-500'; // Green for duty
    if (t.includes('sick')) return 'bg-blue-500';
    if (t.includes('compassionate') || t.includes('other')) return 'bg-yellow-500';
    return 'bg-red-500'; // Default to Red (Time-Off/Annual)
  }

  return (
    <div className="calendar-container">
      {/* Calendar Main Area */}
      <div className="calendar-main">
        {/* Calendar Header */}
        <div className="calendar-header">
          <button className="nav-btn" onClick={prevMonth}>
            <ChevronLeft size={20} />
          </button>
          <div className="month-year">
            <h2>{monthNames[month]} {year}</h2>
            {!isCurrentMonth && (
              <button className="today-btn" onClick={goToToday}>Today</button>
            )}
          </div>
          <button className="nav-btn" onClick={nextMonth}>
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Day Names */}
        <div className="calendar-grid day-names">
          {dayNames.map(day => (
            <div key={day} className="day-name">{day}</div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="calendar-grid">
          {calendarDays.map((day, index) => {
            if (day === null) {
              return <div key={`empty-${index}`} className="calendar-day empty"></div>
            }

            const isToday = isCurrentMonth && day === today.getDate()
            const dayPeople = getPeopleForDay(day)
            
            // Only consider it "has events" if there are people OUT (for red border)
            // Or maybe just if there's any activity?
            // Existing logic: const hasEvents = peopleOut.length > 0
            // If green dots are present, does that count as an event?
            // Usually 'has-events' adds a border. Maybe only for leaves?
            const hasLeaves = dayPeople.some(p => p.isOut)

            return (
              <div 
                key={day} 
                className={`calendar-day ${isToday ? 'today' : ''} ${hasLeaves ? 'has-events' : ''}`}
              >
                <span className="day-number">{day}</span>
                <div className="day-people">
                  {dayPeople.map((person, idx) => (
                    <div
                      key={person.id || idx}
                      className={`person-dot ${person.status === 'in' ? 'in' : 'out'} ${getDotColor(person.type)} ${person.isProjected ? 'opacity-60' : ''}`}
                      onMouseEnter={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        setHoveredPerson({ 
                          ...person, 
                          day,
                          x: rect.left + rect.width / 2, // Center of the dot
                          y: rect.top - 10 // Slightly above the dot
                        })
                      }}
                      onMouseLeave={() => setHoveredPerson(null)}
                      title="" // Clear native tooltip to show custom one
                    >
                      {getInitials(person.firstName, person.lastName)}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Hover Tooltip */}
        {hoveredPerson && (
          <div 
            className="person-tooltip"
            style={{ 
              position: 'fixed',
              top: `${hoveredPerson.y}px`, 
              left: `${hoveredPerson.x}px`,
              transform: 'translate(-50%, -100%)', // Centered and above
              bottom: 'auto'
            }}
          >
            <strong>{hoveredPerson.firstName} {hoveredPerson.lastName}</strong>
            {hoveredPerson.type === 'duty' ? (
              <span className="status in">On Duty</span>
            ) : (
              <>
                <span className="status out">On Leave</span>
                <span className="leave-type">{hoveredPerson.type}</span>
              </>
            )}
          </div>
        )}

        {/* Legend */}
        <div className="calendar-legend">
          <div className="legend-item">
            <div className="legend-dot in bg-green-500"></div>
            <span>On Duty</span>
          </div>
          <div className="legend-item">
            <div className="legend-dot out"></div>
            <span>On leave</span>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Logic based on Role */}
      <div className="calendar-sidebar">
        
        {/* Staff Countdown */}
        {isStaffView && cycleStatus && (
          <div className="sidebar-section">
            <h3>My Status</h3>
            <div className={`countdown-card ${cycleStatus.isWorkDay ? 'work' : 'off'}`}>
              <div className="countdown-label">
                {cycleStatus.isWorkDay ? 'Days to Next Break' : 'Days to Return'}
              </div>
              <div className="countdown-number">
                {cycleStatus.daysRemaining}
              </div>
              <div className="countdown-bar">
                <div 
                  className="countdown-progress" 
                  style={{ width: `${Math.min(((30 - cycleStatus.daysRemaining)/30)*100, 100)}%` }} 
                />
              </div>
              <div className="countdown-subtitle">
                {cycleStatus.isWorkDay ? 'Keep pushing!' : 'Enjoy your time off!'}
              </div>
            </div>
          </div>
        )}

        {/* Team Status List */}
        <div className="sidebar-section">
          <h3>Team Status</h3>
          <div className="status-list">
          <div className="status-list">
            {getMyTeam().map((member, idx) => {
              // Check if this member is on leave TODAY
              const leave = peopleOnLeaveToday.find(p => p.employeeId === member.employeeId)
              const isOnLeave = !!leave
              const statusType = isOnLeave ? leave.type : 'duty'
              
              return (
                <div key={member.employeeId || idx} className="status-item">
                  <div className={`status-avatar ${getDotColor(statusType)}`}>
                    {getInitials(member.firstName, member.lastName)}
                  </div>
                  <div className="status-info">
                    <h4>{member.fullName}</h4>
                    <div>
                      {isOnLeave ? (
                        <>
                          <span className="leave-type-label">{leave.type}</span>
                          <span className="return-date">
                            Until {leave.endDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        </>
                      ) : (
                        <span className="status-text text-green-500 text-sm font-medium">On Duty</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            
            {getMyTeam().length === 0 && (
              <div className="status-empty">
                No team members found.
              </div>
            )}
          </div>
          </div>
        </div>

        {/* Legend */}
        <div className="sidebar-section">
          <h3>Legend</h3>
          <div className="legend-section">
            <div className="legend-item">
              <Circle size={10} className="text-green-500" fill="currentColor" />
              <span>On Duty</span>
            </div>
            <div className="legend-item">
              <Circle size={10} className="text-red-500" fill="currentColor" />
              <span>Time-Off</span>
            </div>
            <div className="legend-item">
              <Circle size={10} className="text-blue-500" fill="currentColor" />
              <span>Sick Leave</span>
            </div>
            <div className="legend-item">
              <Circle size={10} className="text-yellow-500" fill="currentColor" />
              <span>Compassionate</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}

export default Calendar
