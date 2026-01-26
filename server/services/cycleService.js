/**
 * Work Cycle Service
 * 
 * Handles the 22-on/8-off work cycle calculation and projections.
 * 
 * Leave Types:
 * - time-off (annual): Red - 8 days after 22 work days
 * - compassionate: Yellow - 10 days/year
 * - sick: Blue - 90 days/year
 * 
 * Extension Rules:
 * - Staff-requested extension: Owe 2 work days for each extension day (penalty)
 * - Manager-initiated extension: Just shifts cycle forward (no penalty)
 * 
 * Cycles start January 1st each year.
 */

const WORK_DAYS_PER_CYCLE = 22;
const OFF_DAYS_PER_CYCLE = 8;
const CYCLE_LENGTH = WORK_DAYS_PER_CYCLE + OFF_DAYS_PER_CYCLE; // 30 days

const YEARLY_SICK_DAYS = 90;
const YEARLY_COMPASSIONATE_DAYS = 10;

// Staff extensions incur a 2:1 penalty (owe 2 work days per extended day)
const STAFF_EXTENSION_PENALTY_RATIO = 2;

/**
 * Get the cycle start date for a given year
 */
function getCycleStartDate(year) {
    return new Date(year, 0, 1); // January 1st
}

/**
 * Calculate projected work/off schedule for an employee
 * Takes into account approved leaves that interrupt the cycle
 * 
 * @param {Array} approvedLeaves - Array of approved leave records
 * @param {Date} startDate - Start of projection range
 * @param {Date} endDate - End of projection range
 * @param {number} daysOwed - Extra work days owed from extensions
 * @returns {Array} Array of { date, type, leaveType? }
 */
function calculateProjectedSchedule(approvedLeaves = [], startDate, endDate, daysOwed = 0) {
    const schedule = [];
    const cycleStart = getCycleStartDate(startDate.getFullYear());
    
    // Create a map of dates with approved leaves
    const leaveMap = new Map();
    approvedLeaves.forEach(leave => {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const leaveType = (leave.leaveType || 'annual').toLowerCase();
        
        // Map each day of the leave
        for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            leaveMap.set(dateKey, {
                type: 'leave',
                leaveType: leaveType
            });
        }
    });
    
    // Calculate effective work days needed (22 + any owed days)
    const effectiveWorkDays = WORK_DAYS_PER_CYCLE + daysOwed;
    
    // Track cycle progress
    let cycleDay = 0;
    let workDaysCounted = 0;
    let currentCycleStart = new Date(cycleStart);
    
    // Calculate days from cycle start to start of projection
    const daysSinceCycleStart = Math.floor((startDate - cycleStart) / (1000 * 60 * 60 * 24));
    
    // Process each day from cycle start to end of projection
    for (let d = new Date(cycleStart); d <= endDate; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        const dayDate = new Date(d);
        
        // Check if this day has an approved leave
        if (leaveMap.has(dateKey)) {
            const leaveInfo = leaveMap.get(dateKey);
            
            // Only add to schedule if within projection range
            if (dayDate >= startDate) {
                schedule.push({
                    date: dateKey,
                    type: 'leave',
                    leaveType: leaveInfo.leaveType
                });
            }
            
            // Special leaves (sick, compassionate) don't count toward cycle
            // Time-off/annual uses the off days
            if (leaveInfo.leaveType === 'sick' || leaveInfo.leaveType === 'compassionate') {
                // Pause cycle - don't increment work days
                continue;
            } else {
                // This is time-off being used
                cycleDay++;
            }
        } else {
            // No approved leave - determine if work or projected off day
            if (workDaysCounted < effectiveWorkDays) {
                // Working day
                workDaysCounted++;
                cycleDay++;
                
                if (dayDate >= startDate) {
                    schedule.push({
                        date: dateKey,
                        type: 'work'
                    });
                }
            } else if (cycleDay < CYCLE_LENGTH) {
                // Off day (time-off)
                cycleDay++;
                
                if (dayDate >= startDate) {
                    schedule.push({
                        date: dateKey,
                        type: 'projected-off',
                        leaveType: 'annual' // Projected time-off
                    });
                }
            }
            
            // Check if cycle completed
            if (cycleDay >= CYCLE_LENGTH) {
                // Reset for new cycle
                cycleDay = 0;
                workDaysCounted = 0;
                currentCycleStart = new Date(d);
                currentCycleStart.setDate(currentCycleStart.getDate() + 1);
            }
        }
    }
    
    return schedule;
}

/**
 * Calculate current cycle status for an employee
 * 
 * @param {Array} approvedLeaves - Array of approved leave records
 * @param {number} daysOwed - Extra work days owed from extensions
 * @returns {Object} Cycle status info
 */
function getCycleStatus(approvedLeaves = [], daysOwed = 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const cycleStart = getCycleStartDate(today.getFullYear());
    const effectiveWorkDays = WORK_DAYS_PER_CYCLE + daysOwed;
    
    // Create leave map
    const leaveMap = new Map();
    approvedLeaves.forEach(leave => {
        const leaveStart = new Date(leave.startDate);
        const leaveEnd = new Date(leave.endDate);
        const leaveType = (leave.leaveType || 'annual').toLowerCase();
        
        for (let d = new Date(leaveStart); d <= leaveEnd; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            leaveMap.set(dateKey, leaveType);
        }
    });
    
    // Count work days and determine current status
    let workDaysCounted = 0;
    let offDaysTaken = 0;
    let sickDaysTaken = 0;
    let compassionateDaysTaken = 0;
    let cycleNumber = 1;
    let currentPhase = 'work'; // 'work' or 'off'
    let daysInCurrentPhase = 0;
    
    for (let d = new Date(cycleStart); d <= today; d.setDate(d.getDate() + 1)) {
        const dateKey = d.toISOString().split('T')[0];
        
        if (leaveMap.has(dateKey)) {
            const leaveType = leaveMap.get(dateKey);
            
            if (leaveType === 'sick') {
                sickDaysTaken++;
            } else if (leaveType === 'compassionate') {
                compassionateDaysTaken++;
            } else {
                // Time-off/annual
                offDaysTaken++;
                if (currentPhase === 'off') {
                    daysInCurrentPhase++;
                }
            }
        } else {
            // Work day
            if (workDaysCounted < effectiveWorkDays) {
                workDaysCounted++;
                if (currentPhase === 'work') {
                    daysInCurrentPhase = workDaysCounted;
                }
            } else {
                // Auto off day
                if (currentPhase !== 'off') {
                    currentPhase = 'off';
                    daysInCurrentPhase = 0;
                }
                daysInCurrentPhase++;
            }
            
            // Check cycle completion
            if (workDaysCounted >= effectiveWorkDays && daysInCurrentPhase >= OFF_DAYS_PER_CYCLE) {
                cycleNumber++;
                workDaysCounted = 0;
                daysInCurrentPhase = 0;
                currentPhase = 'work';
            }
        }
    }
    
    // Determine if currently on leave
    const todayKey = today.toISOString().split('T')[0];
    const isOnLeave = leaveMap.has(todayKey);
    const currentLeaveType = isOnLeave ? leaveMap.get(todayKey) : null;
    
    return {
        cycleNumber,
        currentPhase,
        workDaysCompleted: workDaysCounted,
        workDaysRequired: effectiveWorkDays,
        workDaysRemaining: Math.max(0, effectiveWorkDays - workDaysCounted),
        offDaysTaken,
        offDaysRemaining: currentPhase === 'off' ? Math.max(0, OFF_DAYS_PER_CYCLE - daysInCurrentPhase) : OFF_DAYS_PER_CYCLE,
        isOnLeave,
        currentLeaveType,
        sickDaysTaken,
        sickDaysRemaining: YEARLY_SICK_DAYS - sickDaysTaken,
        compassionateDaysTaken,
        compassionateDaysRemaining: YEARLY_COMPASSIONATE_DAYS - compassionateDaysTaken,
        daysOwed,
        nextOffStartsIn: currentPhase === 'work' ? effectiveWorkDays - workDaysCounted : 0
    };
}

/**
 * Get leave type color for calendar display
 */
function getLeaveTypeColor(leaveType) {
    const type = (leaveType || 'annual').toLowerCase();
    switch (type) {
        case 'annual':
        case 'time-off':
            return '#ef4444'; // Red
        case 'compassionate':
            return '#f59e0b'; // Yellow
        case 'sick':
            return '#3b82f6'; // Blue
        default:
            return '#ef4444'; // Default to red
    }
}

module.exports = {
    WORK_DAYS_PER_CYCLE,
    OFF_DAYS_PER_CYCLE,
    CYCLE_LENGTH,
    YEARLY_SICK_DAYS,
    YEARLY_COMPASSIONATE_DAYS,
    getCycleStartDate,
    calculateProjectedSchedule,
    getCycleStatus,
    getLeaveTypeColor
};
