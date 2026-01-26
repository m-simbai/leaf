require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { queryFeatures, addFeatures, updateFeatures } = require('@esri/arcgis-rest-feature-layer');
const crypto = require('crypto');
const { notifyNewRequest, notifyApproved, notifyRejected, notifyEarlyCheckin, notifyExtensionRequest, notifyExtensionApproved, notifyExtensionRejected, notifyManagerExtension } = require('./services/webhookService');
const { calculateProjectedSchedule, getCycleStatus, getLeaveTypeColor, YEARLY_SICK_DAYS, YEARLY_COMPASSIONATE_DAYS } = require('./services/cycleService');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Table URLs from environment
const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
const DEPARTMENTS_URL = process.env.DEPARTMENTS_TABLE_URL;

// ApplicationSession for OAuth 2.0 Client Credentials Flow
let session = null;

function getSession() {
    if (!session) {
        session = new ApplicationSession({
            clientId: process.env.ARCGIS_CLIENT_ID,
            clientSecret: process.env.ARCGIS_CLIENT_SECRET
        });
        console.log('ArcGIS ApplicationSession initialized');
    }
    return session;
}

// Simple password hashing (in production use bcrypt)
function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper: Get employee email by EmployeeID
async function getEmployeeEmail(employeeId) {
    try {
        const authentication = getSession();
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: 'Email',
            returnGeometry: false,
            authentication
        });
        return response.features?.[0]?.attributes?.Email || '';
    } catch (error) {
        console.error('Error fetching employee email:', error);
        return '';
    }
}

// Helper: Get manager email (finds first manager in the system)
async function getManagerEmail() {
    try {
        const authentication = getSession();
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'manager'`,
            outFields: 'Email',
            returnGeometry: false,
            authentication
        });
        return response.features?.[0]?.attributes?.Email || process.env.ADMIN_EMAIL || '';
    } catch (error) {
        console.error('Error fetching manager email:', error);
        return process.env.ADMIN_EMAIL || '';
    }
}

// Helper: Get the assigned manager for an employee
async function getManagerForEmployee(employeeId) {
    try {
        const authentication = getSession();
        // First get the employee's ManagerID
        const empResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: 'ManagerID',
            returnGeometry: false,
            authentication
        });
        const managerId = empResponse.features?.[0]?.attributes?.ManagerID;
        if (!managerId) return null;
        
        // Get the manager's details
        const mgrResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${managerId}'`,
            outFields: 'Email,FirstName,LastName,EmployeeID',
            returnGeometry: false,
            authentication
        });
        return mgrResponse.features?.[0]?.attributes || null;
    } catch (error) {
        console.error('Error fetching manager for employee:', error);
        return null;
    }
}

// Helper: Get all staff assigned to a manager (including delegated staff)
async function getStaffForManager(managerId, includeDelegated = false) {
    try {
        const authentication = getSession();
        let whereClause = `ManagerID = '${managerId}' AND IsActive = 1`;
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: whereClause,
            outFields: 'EmployeeID,FirstName,LastName,Email,Role',
            returnGeometry: false,
            authentication
        });
        
        return response.features?.map(f => f.attributes) || [];
    } catch (error) {
        console.error('Error fetching staff for manager:', error);
        return [];
    }
}

// Helper: Get Project Director email (for manager leave notifications)
async function getDirectorEmail() {
    try {
        const authentication = getSession();
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'director' AND IsActive = 1`,
            outFields: 'Email,FirstName,LastName',
            returnGeometry: false,
            authentication
        });
        return response.features?.[0]?.attributes?.Email || process.env.ADMIN_EMAIL || '';
    } catch (error) {
        console.error('Error fetching director email:', error);
        return process.env.ADMIN_EMAIL || '';
    }
}

// Helper: Check if an approver can approve a given leave request
async function canApproveLeave(approverId, leaveEmployeeId) {
    try {
        const authentication = getSession();
        
        // Get approver details
        const approverQuery = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${approverId}'`,
            outFields: 'Role,EmployeeID',
            returnGeometry: false,
            authentication
        });
        const approver = approverQuery.features?.[0]?.attributes;
        if (!approver) return { authorized: false, reason: 'Approver not found' };
        
        // Get leave requester details
        const requesterQuery = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${leaveEmployeeId}'`,
            outFields: 'Role,ManagerID',
            returnGeometry: false,
            authentication
        });
        const requester = requesterQuery.features?.[0]?.attributes;
        if (!requester) return { authorized: false, reason: 'Requester not found' };
        
        const approverRole = (approver.Role || '').toLowerCase();
        const requesterRole = (requester.Role || '').toLowerCase();
        
        // Director can approve managers
        if (approverRole === 'director' && requesterRole === 'manager') {
            return { authorized: true };
        }
        
        // Manager can approve their assigned staff
        if (approverRole === 'manager' && requesterRole === 'staff') {
            if (requester.ManagerID === approverId) {
                return { authorized: true };
            }
            // Check for delegations - is this staff delegated to the approver?
            const delegatedStaff = await getDelegatedStaffForManager(approverId);
            if (delegatedStaff.some(s => s.EmployeeID === leaveEmployeeId)) {
                return { authorized: true, delegated: true };
            }
            return { authorized: false, reason: 'Staff not assigned to this manager' };
        }
        
        return { authorized: false, reason: 'Role mismatch - cannot approve' };
    } catch (error) {
        console.error('Error checking approval authorization:', error);
        return { authorized: false, reason: 'Authorization check failed' };
    }
}

// ==================== DELEGATION SYSTEM ====================

// In-memory delegation storage (in production, use database)
let delegations = [];
let delegationIdCounter = 1;

// Helper: Get active delegations TO a manager (staff they're covering)
async function getDelegatedStaffForManager(managerId) {
    const now = new Date();
    const activeDelegations = delegations.filter(d => 
        d.toManagerId === managerId && 
        d.status === 'active' &&
        new Date(d.startDate) <= now &&
        new Date(d.endDate) >= now
    );
    
    if (activeDelegations.length === 0) return [];
    
    // Get staff for each delegating manager
    const allStaff = [];
    for (const delegation of activeDelegations) {
        const staff = await getStaffForManager(delegation.fromManagerId);
        staff.forEach(s => {
            s.delegatedFrom = delegation.fromManagerId;
            s.delegationId = delegation.id;
        });
        allStaff.push(...staff);
    }
    return allStaff;
}

// Helper: Get delegations FROM a manager (their outgoing delegations)
function getDelegationsFromManager(managerId) {
    return delegations.filter(d => d.fromManagerId === managerId);
}

// Helper: Get delegations TO a manager (what they're covering)
function getDelegationsToManager(managerId) {
    return delegations.filter(d => d.toManagerId === managerId && d.status === 'active');
}

// ==================== AUTH ENDPOINTS ====================

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password, role } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password required' });
        }

        const authentication = getSession();
        
        // Query employees table for the user
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Username = '${username}'`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const employee = response.features[0].attributes;
        
        // For demo: accept any password, but check role matches
        // In production: compare hashed passwords
        // const hashedInput = hashPassword(password);
        // if (employee.PasswordHash !== hashedInput) {
        //     return res.status(401).json({ error: 'Invalid username or password' });
        // }

        // Check if role matches (if specified)
        if (role) {
            const requestedRole = role.toLowerCase();
            const userRole = (employee.Role || '').toLowerCase();
            
            if (userRole !== requestedRole) {
                // Use generic error for security
                return res.status(401).json({ error: 'Invalid username or password' });
            }
        }

        // Check if account is active
        if (employee.IsActive === 0) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        // Return user info (exclude password hash)
        res.json({
            success: true,
            user: {
                employeeId: employee.EmployeeID,
                username: employee.Username,
                firstName: employee.FirstName,
                lastName: employee.LastName,
                email: employee.Email,
                department: employee.Department,
                role: employee.Role,
                managerId: employee.ManagerID,
                leaveBalance: {
                    annual: employee.AnnualLeaveBalance || 0,
                    sick: employee.SickLeaveBalance || 0,
                    other: employee.OtherLeaveBalance || 0
                }
            }
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed', details: error.message });
    }
});

// Verify password endpoint (for re-authentication)
app.post('/api/auth/verify-password', async (req, res) => {
    try {
        const { employeeId, password } = req.body;
        
        if (!employeeId || !password) {
            return res.status(400).json({ error: 'Employee ID and password required' });
        }

        const authentication = getSession();
        
        // Query employees table to verify user exists
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        // const employee = response.features[0].attributes;
        
        // In production: compare hashed passwords
        // For demo: we accept the password if the user exists (matching login behavior)
        // If we wanted to enforce specific demo passwords:
        // if (employee.Username === 'tagwireyi' && password !== 'password123') return res.status(401).json({ error: 'Invalid password' });
        // if (employee.Username === 'admin_simba' && password !== 'admin123') return res.status(401).json({ error: 'Invalid password' });

        res.json({ success: true });

    } catch (error) {
        console.error('Password verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Get current user's leave balance
app.get('/api/auth/balance/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: 'AnnualLeaveBalance,SickLeaveBalance,OtherLeaveBalance',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        const employee = response.features[0].attributes;
        res.json({
            annual: employee.AnnualLeaveBalance || 0,
            sick: employee.SickLeaveBalance || 0,
            other: employee.OtherLeaveBalance || 0
        });

    } catch (error) {
        console.error('Balance fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// ==================== LEAVE REQUEST ENDPOINTS ====================

// Get all leave requests (for calendar/team view)
app.get('/api/leaves', async (req, res) => {
    try {
        const authentication = getSession();
        const whereClause = req.query.where || '1=1';
        
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: whereClause,
            outFields: '*',
            returnGeometry: false,
            orderByFields: 'SubmittedDate DESC',
            authentication
        });

        console.log('Leave requests fetched:', response.features?.length || 0);
        res.json(response);

    } catch (error) {
        console.error('Error fetching leaves:', error);
        res.status(500).json({ error: 'Failed to fetch leaves', details: error.message });
    }
});

// Get leave requests for specific employee
app.get('/api/leaves/employee/:employeeId', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: '*',
            returnGeometry: false,
            orderByFields: 'SubmittedDate DESC',
            authentication
        });

        res.json(response);

    } catch (error) {
        console.error('Error fetching employee leaves:', error);
        res.status(500).json({ error: 'Failed to fetch leaves' });
    }
});

// Get pending leave requests (for manager inbox - filtered by role hierarchy)
app.get('/api/leaves/pending', async (req, res) => {
    try {
        const { managerId } = req.query; // The logged-in manager/director's EmployeeID
        const authentication = getSession();
        
        // Get all pending requests first
        const response = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `Status = 'pending'`,
            outFields: '*',
            returnGeometry: false,
            orderByFields: 'SubmittedDate ASC',
            authentication
        });
        
        // If no managerId provided, return all (backward compatibility)
        if (!managerId) {
            return res.json(response);
        }
        
        // Get the approver's role
        const approverQuery = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${managerId}'`,
            outFields: 'Role',
            returnGeometry: false,
            authentication
        });
        const approverRole = (approverQuery.features?.[0]?.attributes?.Role || '').toLowerCase();
        
        // Filter based on role
        let filteredFeatures = [];
        
        if (approverRole === 'director') {
            // Director sees pending leaves from managers only
            for (const feature of response.features || []) {
                const empId = feature.attributes.EmployeeID;
                const empQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${empId}'`,
                    outFields: 'Role',
                    returnGeometry: false,
                    authentication
                });
                const empRole = (empQuery.features?.[0]?.attributes?.Role || '').toLowerCase();
                if (empRole === 'manager') {
                    filteredFeatures.push(feature);
                }
            }
        } else if (approverRole === 'manager') {
            // Manager sees pending leaves from their assigned staff AND delegated staff
            const assignedStaff = await getStaffForManager(managerId);
            const delegatedStaff = await getDelegatedStaffForManager(managerId);
            const allStaff = [...assignedStaff, ...delegatedStaff];
            const staffIds = allStaff.map(s => s.EmployeeID);
            
            filteredFeatures = (response.features || []).filter(feature => 
                staffIds.includes(feature.attributes.EmployeeID)
            );
            
            // Mark delegated leaves
            filteredFeatures.forEach(feature => {
                const delegated = delegatedStaff.find(s => s.EmployeeID === feature.attributes.EmployeeID);
                if (delegated) {
                    feature.attributes.IsDelegated = true;
                    feature.attributes.DelegatedFrom = delegated.delegatedFrom;
                }
            });
        }
        // Staff cannot see pending requests (filteredFeatures remains empty)
        
        res.json({ ...response, features: filteredFeatures });

    } catch (error) {
        console.error('Error fetching pending leaves:', error);
        res.status(500).json({ error: 'Failed to fetch pending requests' });
    }
});

// Get projected schedule for an employee
app.get('/api/employees/:employeeId/schedule', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const { startDate, endDate } = req.query;
        const authentication = getSession();
        
        // Get approved leaves for this employee
        const leaveResponse = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `EmployeeID = '${employeeId}' AND Status = 'approved'`,
            outFields: 'StartDate,EndDate,LeaveType',
            returnGeometry: false,
            authentication
        });
        
        const approvedLeaves = (leaveResponse.features || []).map(f => ({
            startDate: f.attributes.StartDate,
            endDate: f.attributes.EndDate,
            leaveType: f.attributes.LeaveType
        }));
        
        // Get employee's owed days (could be stored in DB, using 0 for now)
        // TODO: Add DaysOwed field to Employees table
        const daysOwed = 0;
        
        const projectionStart = startDate ? new Date(startDate) : new Date();
        const projectionEnd = endDate ? new Date(endDate) : new Date(projectionStart.getTime() + 90 * 24 * 60 * 60 * 1000); // 3 months default
        
        const schedule = calculateProjectedSchedule(approvedLeaves, projectionStart, projectionEnd, daysOwed);
        
        res.json({
            employeeId,
            startDate: projectionStart.toISOString().split('T')[0],
            endDate: projectionEnd.toISOString().split('T')[0],
            schedule
        });
        
    } catch (error) {
        console.error('Error calculating schedule:', error);
        res.status(500).json({ error: 'Failed to calculate schedule' });
    }
});

// Get cycle status for an employee
app.get('/api/employees/:employeeId/cycle-status', async (req, res) => {
    try {
        const { employeeId } = req.params;
        const authentication = getSession();
        
        // Get approved leaves for this employee
        const leaveResponse = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `EmployeeID = '${employeeId}' AND Status = 'approved'`,
            outFields: 'StartDate,EndDate,LeaveType',
            returnGeometry: false,
            authentication
        });
        
        const approvedLeaves = (leaveResponse.features || []).map(f => ({
            startDate: f.attributes.StartDate,
            endDate: f.attributes.EndDate,
            leaveType: f.attributes.LeaveType
        }));
        
        // Get employee's owed days (TODO: store in DB)
        const daysOwed = 0;
        
        const status = getCycleStatus(approvedLeaves, daysOwed);
        
        res.json({
            employeeId,
            ...status
        });
        
    } catch (error) {
        console.error('Error getting cycle status:', error);
        res.status(500).json({ error: 'Failed to get cycle status' });
    }
});

// Submit new leave request
app.post('/api/leaves', async (req, res) => {
    try {
        const { employeeId, employeeName, leaveType, startDate, endDate, daysRequested, reason } = req.body;
        
        if (!employeeId || !leaveType || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const authentication = getSession();
        
        // Check if the requester is a director - directors cannot request leave
        const requesterQuery = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: 'Role',
            returnGeometry: false,
            authentication
        });
        const requesterRole = (requesterQuery.features?.[0]?.attributes?.Role || '').toLowerCase();
        
        if (requesterRole === 'director') {
            return res.status(403).json({ 
                error: 'Project Directors cannot submit leave requests as there is no approver above this role.' 
            });
        }
        
        // Parse dates for comparison
        const newStartDate = new Date(startDate).getTime();
        const newEndDate = new Date(endDate).getTime();
        
        // Check for overlapping leaves (pending or approved)
        const existingLeaves = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `EmployeeID = '${employeeId}' AND Status IN ('pending', 'approved')`,
            outFields: 'StartDate,EndDate,Status',
            returnGeometry: false,
            authentication
        });
        
        if (existingLeaves.features && existingLeaves.features.length > 0) {
            for (const leave of existingLeaves.features) {
                const existingStart = leave.attributes.StartDate;
                const existingEnd = leave.attributes.EndDate;
                
                // Check for overlap: new dates overlap with existing dates
                // Overlap occurs if: newStart <= existingEnd AND newEnd >= existingStart
                if (newStartDate <= existingEnd && newEndDate >= existingStart) {
                    const conflictStart = new Date(existingStart).toLocaleDateString('en-GB');
                    const conflictEnd = new Date(existingEnd).toLocaleDateString('en-GB');
                    const status = leave.attributes.Status;
                    
                    return res.status(400).json({ 
                        error: `You already have a ${status} leave from ${conflictStart} to ${conflictEnd}. Please choose different dates.`
                    });
                }
            }
        }
        
        // Generate unique request ID
        const requestId = `REQ${Date.now()}`;
        
        const newRequest = {
            attributes: {
                RequestID: requestId,
                EmployeeID: employeeId,
                EmployeeName: employeeName || '',
                LeaveType: leaveType,
                StartDate: newStartDate,
                EndDate: newEndDate,
                DaysRequested: daysRequested || 1,
                Reason: reason || '',
                Status: 'pending',
                SubmittedDate: Date.now()
            }
        };

        const response = await addFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [newRequest],
            authentication
        });

        if (response.addResults && response.addResults[0].success) {
            console.log('Leave request created:', requestId);
            
            // Fetch emails for notification (async, don't block response)
            (async () => {
                try {
                    const [employeeEmail, managerEmail] = await Promise.all([
                        getEmployeeEmail(employeeId),
                        getManagerEmail()
                    ]);
                    
                    await notifyNewRequest({
                        employeeName: employeeName || 'Unknown',
                        employeeEmail: employeeEmail,
                        managerEmail: managerEmail,
                        leaveType,
                        startDate: new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        endDate: new Date(endDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        daysRequested: daysRequested || 1,
                        reason: reason || 'No reason provided'
                    });
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ 
                success: true, 
                requestId,
                objectId: response.addResults[0].objectId 
            });
        } else {
            throw new Error('Failed to create leave request');
        }

    } catch (error) {
        console.error('Error creating leave request:', error);
        res.status(500).json({ error: 'Failed to create leave request', details: error.message });
    }
});

// Approve leave request
app.put('/api/leaves/:objectId/approve', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { reviewedBy } = req.body;
        
        const authentication = getSession();
        
        // First, fetch the original request to get details for notification
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                Status: 'approved',
                ReviewedBy: reviewedBy || '',
                ReviewedDate: Date.now()
            }
        };

        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });

        if (response.updateResults && response.updateResults[0].success) {
            console.log('Leave request approved:', objectId);
            
            // Send notification to employee via Power Automate
            if (originalRequest) {
                (async () => {
                    try {
                        const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
                        await notifyApproved({
                            employeeName: originalRequest.EmployeeName || 'Unknown',
                            employeeEmail: employeeEmail,
                            leaveType: originalRequest.LeaveType,
                            startDate: new Date(originalRequest.StartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            endDate: new Date(originalRequest.EndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            daysRequested: originalRequest.DaysRequested
                        });
                    } catch (err) {
                        console.error('Webhook notification failed:', err);
                    }
                })();
            }
            
            // TODO: Deduct from employee's leave balance
            
            res.json({ success: true, message: 'Request approved' });
        } else {
            throw new Error('Failed to update request');
        }

    } catch (error) {
        console.error('Error approving request:', error);
        res.status(500).json({ error: 'Failed to approve request' });
    }
});

// Reject leave request
app.put('/api/leaves/:objectId/reject', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { reviewedBy, rejectionReason } = req.body;
        
        const authentication = getSession();
        
        // First, fetch the original request to get details for notification
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                Status: 'rejected',
                ReviewedBy: reviewedBy || '',
                ReviewedDate: Date.now(),
                RejectionReason: rejectionReason || ''
            }
        };

        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });

        if (response.updateResults && response.updateResults[0].success) {
            console.log('Leave request rejected:', objectId);
            
            // Send notification to employee via Power Automate
            if (originalRequest) {
                (async () => {
                    try {
                        const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
                        await notifyRejected({
                            employeeName: originalRequest.EmployeeName || 'Unknown',
                            employeeEmail: employeeEmail,
                            leaveType: originalRequest.LeaveType,
                            startDate: new Date(originalRequest.StartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            endDate: new Date(originalRequest.EndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            daysRequested: originalRequest.DaysRequested,
                            rejectionReason: rejectionReason || 'No reason provided'
                        });
                    } catch (err) {
                        console.error('Webhook notification failed:', err);
                    }
                })();
            }
            
            res.json({ success: true, message: 'Request rejected' });
        } else {
            throw new Error('Failed to update request');
        }

    } catch (error) {
        console.error('Error rejecting request:', error);
        res.status(500).json({ error: 'Failed to reject request' });
    }
});

// ==================== LEAVE MODIFICATION ENDPOINTS ====================

// Manager extend leave (direct update)
app.post('/api/leaves/:objectId/manager-extend', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { newEndDate, reason } = req.body;
        
        if (!newEndDate) {
            return res.status(400).json({ error: 'New end date required' });
        }

        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        if (!originalRequest) return res.status(404).json({ error: 'Request not found' });

        const originalEnd = new Date(originalRequest.EndDate);
        const newEnd = new Date(newEndDate);
        
        if (newEnd <= originalEnd) {
            return res.status(400).json({ error: 'New end date must be after original end date' });
        }

        // Calculate additional days
        const additionalDays = Math.ceil((newEnd - originalEnd) / (1000 * 60 * 60 * 24));

        // Update leave request
        const updateResult = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [{
                attributes: {
                    OBJECTID: objectId,
                    EndDate: newEndDate,
                    DaysRequested: originalRequest.DaysRequested + additionalDays
                }
            }],
            authentication
        });

        if (updateResult.updateResults?.[0]?.success) {
            // Notify staff
            (async () => {
                try {
                    // Fetch employee email
                    const empResponse = await queryFeatures({
                        url: EMPLOYEES_URL,
                        where: `EmployeeID = '${originalRequest.EmployeeID}'`,
                        outFields: 'Email',
                        returnGeometry: false,
                        authentication
                    });
                    const employeeEmail = empResponse.features?.[0]?.attributes?.Email;

                    await notifyManagerExtension({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        leaveType: originalRequest.LeaveType,
                        originalEndDate: originalEnd.toLocaleDateString(),
                        newEndDate: newEnd.toLocaleDateString(),
                        reason: reason || 'Manager extended leave'
                    });
                } catch (e) {
                    console.error('Notification error:', e);
                }
            })();

            res.json({ success: true, message: 'Leave extended successfully' });
        } else {
            throw new Error('Failed to update leave record');
        }

    } catch (error) {
        console.error('Error extending leave:', error);
        res.status(500).json({ error: 'Failed to extend leave' });
    }
});

// Early check-in (staff returns early)
app.post('/api/leaves/:objectId/early-checkin', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { actualEndDate, reason } = req.body;
        
        if (!actualEndDate || !reason || reason.split(' ').length < 3) {
            return res.status(400).json({ error: 'Actual end date and reason (min 3 words) required' });
        }
        
        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        if (!originalRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }
        
        // Calculate days refunded
        const originalEnd = new Date(originalRequest.EndDate);
        const actualEnd = new Date(actualEndDate);
        const daysRefunded = Math.ceil((originalEnd - actualEnd) / (1000 * 60 * 60 * 24));
        const daysTaken = originalRequest.DaysRequested - daysRefunded;
        
        // Update leave request
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                OriginalEndDate: originalRequest.EndDate,
                ActualEndDate: actualEnd.getTime(),
                DaysTaken: daysTaken,
                ModificationType: 'early_checkin',
                ModificationReason: reason,
                ModificationStatus: 'pending',
                ModificationRequestedDate: Date.now()
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Early check-in recorded:', objectId);
            
            // Refund unused days to balance
            const leaveTypeMap = { annual: 'AnnualLeaveBalance', sick: 'SickLeaveBalance', other: 'OtherLeaveBalance' };
            const balanceField = leaveTypeMap[originalRequest.LeaveType];
            
            if (balanceField && daysRefunded > 0) {
                const employeeQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${originalRequest.EmployeeID}'`,
                    outFields: `OBJECTID,${balanceField}`,
                    returnGeometry: false,
                    authentication
                });
                
                const employee = employeeQuery.features?.[0]?.attributes;
                if (employee) {
                    const newBalance = (employee[balanceField] || 0) + daysRefunded;
                    await updateFeatures({
                        url: EMPLOYEES_URL,
                        features: [{
                            attributes: {
                                OBJECTID: employee.OBJECTID,
                                [balanceField]: newBalance
                            }
                        }],
                        authentication
                    });
                    console.log(`Refunded ${daysRefunded} days to ${balanceField}`);
                }
            }
            
            // Send notification to manager
            const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
            (async () => {
                try {
                    const managerEmail = await getManagerEmail();
                    await notifyEarlyCheckin({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        managerEmail: managerEmail,
                        leaveType: originalRequest.LeaveType,
                        originalEndDate: new Date(originalRequest.EndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        actualEndDate: actualEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        daysRefunded: daysRefunded,
                        reason: reason
                    });
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ success: true, message: 'Early check-in recorded', daysRefunded });
        } else {
            throw new Error('Failed to record early check-in');
        }
    } catch (error) {
        console.error('Error recording early check-in:', error);
        res.status(500).json({ error: 'Failed to record early check-in' });
    }
});

// Acknowledge early check-in (manager)
app.put('/api/leaves/:objectId/acknowledge-checkin', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { reviewedBy } = req.body;
        
        const authentication = getSession();
        
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                ModificationStatus: 'acknowledged',
                ModificationReviewedBy: reviewedBy,
                ModificationReviewedDate: Date.now()
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Early check-in acknowledged:', objectId);
            res.json({ success: true, message: 'Early check-in acknowledged' });
        } else {
            throw new Error('Failed to acknowledge');
        }
    } catch (error) {
        console.error('Error acknowledging check-in:', error);
        res.status(500).json({ error: 'Failed to acknowledge check-in' });
    }
});

// Request extension (staff)
app.post('/api/leaves/:objectId/request-extension', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { newEndDate, reason } = req.body;
        
        if (!newEndDate || !reason || reason.split(' ').length < 3) {
            return res.status(400).json({ error: 'New end date and reason (min 3 words) required' });
        }
        
        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        if (!originalRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }
        
        // Calculate additional days
        const originalEnd = new Date(originalRequest.EndDate);
        const requestedEnd = new Date(newEndDate);
        const additionalDays = Math.ceil((requestedEnd - originalEnd) / (1000 * 60 * 60 * 24));
        
        if (additionalDays <= 0) {
            return res.status(400).json({ error: 'New end date must be after original end date' });
        }
        
        // Update leave request
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                OriginalEndDate: originalRequest.EndDate,
                ModificationType: 'extension',
                ModificationReason: reason,
                ModificationStatus: 'pending',
                ModificationRequestedDate: Date.now()
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Extension requested:', objectId);
            
            // Send notification to manager
            const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
            (async () => {
                try {
                    const managerEmail = await getManagerEmail();
                    await notifyExtensionRequest({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        managerEmail: managerEmail,
                        leaveType: originalRequest.LeaveType,
                        originalEndDate: originalEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        requestedEndDate: requestedEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        additionalDays: additionalDays,
                        reason: reason
                    });
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ success: true, message: 'Extension requested', additionalDays });
        } else {
            throw new Error('Failed to request extension');
        }
    } catch (error) {
        console.error('Error requesting extension:', error);
        res.status(500).json({ error: 'Failed to request extension' });
    }
});

// Approve extension (manager)
app.put('/api/leaves/:objectId/approve-extension', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { reviewedBy, newEndDate } = req.body;
        
        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        if (!originalRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }
        
        const originalEnd = new Date(originalRequest.OriginalEndDate || originalRequest.EndDate);
        const requestedEnd = new Date(newEndDate);
        const additionalDays = Math.ceil((requestedEnd - originalEnd) / (1000 * 60 * 60 * 24));
        
        // Update leave request
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                EndDate: requestedEnd.getTime(),
                DaysRequested: originalRequest.DaysRequested + additionalDays,
                ModificationStatus: 'approved',
                ModificationReviewedBy: reviewedBy,
                ModificationReviewedDate: Date.now()
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Extension approved:', objectId);
            
            // Deduct additional days from balance
            const leaveTypeMap = { annual: 'AnnualLeaveBalance', sick: 'SickLeaveBalance', other: 'OtherLeaveBalance' };
            const balanceField = leaveTypeMap[originalRequest.LeaveType];
            
            if (balanceField && additionalDays > 0) {
                const employeeQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${originalRequest.EmployeeID}'`,
                    outFields: `OBJECTID,${balanceField}`,
                    returnGeometry: false,
                    authentication
                });
                
                const employee = employeeQuery.features?.[0]?.attributes;
                if (employee) {
                    const newBalance = Math.max(0, (employee[balanceField] || 0) - additionalDays);
                    await updateFeatures({
                        url: EMPLOYEES_URL,
                        features: [{
                            attributes: {
                                OBJECTID: employee.OBJECTID,
                                [balanceField]: newBalance
                            }
                        }],
                        authentication
                    });
                    console.log(`Deducted ${additionalDays} days from ${balanceField}`);
                }
            }
            
            // Send notification to staff
            const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
            (async () => {
                try {
                    await notifyExtensionApproved({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        leaveType: originalRequest.LeaveType,
                        originalEndDate: originalEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        newEndDate: requestedEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        additionalDays: additionalDays
                    });
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ success: true, message: 'Extension approved' });
        } else {
            throw new Error('Failed to approve extension');
        }
    } catch (error) {
        console.error('Error approving extension:', error);
        res.status(500).json({ error: 'Failed to approve extension' });
    }
});

// Reject extension (manager)
app.put('/api/leaves/:objectId/reject-extension', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { reviewedBy, rejectionReason } = req.body;
        
        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                ModificationStatus: 'rejected',
                ModificationReviewedBy: reviewedBy,
                ModificationReviewedDate: Date.now(),
                ModificationReason: (originalRequest?.ModificationReason || '') + ' | REJECTED: ' + (rejectionReason || '')
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Extension rejected:', objectId);
            
            // Send notification to staff
            if (originalRequest) {
                const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
                (async () => {
                    try {
                        await notifyExtensionRejected({
                            employeeName: originalRequest.EmployeeName,
                            employeeEmail: employeeEmail,
                            leaveType: originalRequest.LeaveType,
                            requestedEndDate: 'Requested extension',
                            rejectionReason: rejectionReason || 'No reason provided'
                        });
                    } catch (err) {
                        console.error('Webhook notification failed:', err);
                    }
                })();
            }
            
            res.json({ success: true, message: 'Extension rejected' });
        } else {
            throw new Error('Failed to reject extension');
        }
    } catch (error) {
        console.error('Error rejecting extension:', error);
        res.status(500).json({ error: 'Failed to reject extension' });
    }
});

// Manager-initiated extension
app.post('/api/leaves/:objectId/manager-extend', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { newEndDate, reason, reviewedBy } = req.body;
        
        if (!newEndDate || !reason) {
            return res.status(400).json({ error: 'New end date and reason required' });
        }
        
        const authentication = getSession();
        
        // Fetch original request
        const requestQuery = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `OBJECTID = ${objectId}`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const originalRequest = requestQuery.features?.[0]?.attributes;
        if (!originalRequest) {
            return res.status(404).json({ error: 'Leave request not found' });
        }
        
        const originalEnd = new Date(originalRequest.EndDate);
        const requestedEnd = new Date(newEndDate);
        const additionalDays = Math.ceil((requestedEnd - originalEnd) / (1000 * 60 * 60 * 24));
        
        if (additionalDays <= 0) {
            return res.status(400).json({ error: 'New end date must be after current end date' });
        }
        
        // Update leave request
        const updateData = {
            attributes: {
                OBJECTID: parseInt(objectId),
                OriginalEndDate: originalRequest.EndDate,
                EndDate: requestedEnd.getTime(),
                DaysRequested: originalRequest.DaysRequested + additionalDays,
                ModificationType: 'manager_extension',
                ModificationReason: reason,
                ModificationStatus: 'approved',
                ModificationReviewedBy: reviewedBy,
                ModificationRequestedDate: Date.now(),
                ModificationReviewedDate: Date.now()
            }
        };
        
        const response = await updateFeatures({
            url: LEAVE_REQUESTS_URL,
            features: [updateData],
            authentication
        });
        
        if (response.updateResults && response.updateResults[0].success) {
            console.log('Manager extension applied:', objectId);
            
            // Deduct additional days from balance
            const leaveTypeMap = { annual: 'AnnualLeaveBalance', sick: 'SickLeaveBalance', other: 'OtherLeaveBalance' };
            const balanceField = leaveTypeMap[originalRequest.LeaveType];
            
            if (balanceField && additionalDays > 0) {
                const employeeQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${originalRequest.EmployeeID}'`,
                    outFields: `OBJECTID,${balanceField}`,
                    returnGeometry: false,
                    authentication
                });
                
                const employee = employeeQuery.features?.[0]?.attributes;
                if (employee) {
                    const newBalance = Math.max(0, (employee[balanceField] || 0) - additionalDays);
                    await updateFeatures({
                        url: EMPLOYEES_URL,
                        features: [{
                            attributes: {
                                OBJECTID: employee.OBJECTID,
                                [balanceField]: newBalance
                            }
                        }],
                        authentication
                    });
                    console.log(`Deducted ${additionalDays} days from ${balanceField}`);
                }
            }
            
            // Send notification to staff
            const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
            (async () => {
                try {
                    await notifyManagerExtension({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        leaveType: originalRequest.LeaveType,
                        originalEndDate: originalEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        newEndDate: requestedEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        additionalDays: additionalDays,
                        reason: reason
                    });
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ success: true, message: 'Leave extended', additionalDays });
        } else {
            throw new Error('Failed to extend leave');
        }
    } catch (error) {
        console.error('Error extending leave:', error);
        res.status(500).json({ error: 'Failed to extend leave' });
    }
});

// ==================== EMPLOYEE ENDPOINTS ====================

// Get all employees (for team view)
app.get('/api/employees', async (req, res) => {
    try {
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: 'IsActive = 1',
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        res.json(response);

    } catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
});

// Get all managers (for staff assignment dropdowns)
app.get('/api/managers', async (req, res) => {
    try {
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'manager' AND IsActive = 1`,
            outFields: 'EmployeeID,FirstName,LastName,Email,Department',
            returnGeometry: false,
            orderByFields: 'LastName ASC',
            authentication
        });

        const managers = response.features?.map(f => ({
            employeeId: f.attributes.EmployeeID,
            firstName: f.attributes.FirstName,
            lastName: f.attributes.LastName,
            email: f.attributes.Email,
            department: f.attributes.Department
        })) || [];

        res.json({ success: true, managers });

    } catch (error) {
        console.error('Error fetching managers:', error);
        res.status(500).json({ error: 'Failed to fetch managers' });
    }
});

// Get staff assigned to a specific manager
app.get('/api/managers/:managerId/staff', async (req, res) => {
    try {
        const { managerId } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ManagerID = '${managerId}' AND IsActive = 1`,
            outFields: 'OBJECTID,EmployeeID,FirstName,LastName,Email,Department,Role',
            returnGeometry: false,
            orderByFields: 'LastName ASC',
            authentication
        });

        const staff = response.features?.map(f => ({
            id: f.attributes.OBJECTID,
            employeeId: f.attributes.EmployeeID,
            firstName: f.attributes.FirstName,
            lastName: f.attributes.LastName,
            email: f.attributes.Email,
            department: f.attributes.Department,
            role: f.attributes.Role
        })) || [];

        res.json({ success: true, staff });

    } catch (error) {
        console.error('Error fetching staff for manager:', error);
        res.status(500).json({ error: 'Failed to fetch staff' });
    }
});

// Get the Project Director
app.get('/api/director', async (req, res) => {
    try {
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'director' AND IsActive = 1`,
            outFields: 'EmployeeID,FirstName,LastName,Email',
            returnGeometry: false,
            authentication
        });

        if (response.features?.length > 0) {
            const director = response.features[0].attributes;
            res.json({ 
                success: true, 
                director: {
                    employeeId: director.EmployeeID,
                    firstName: director.FirstName,
                    lastName: director.LastName,
                    email: director.Email
                }
            });
        } else {
            res.json({ success: true, director: null });
        }

    } catch (error) {
        console.error('Error fetching director:', error);
        res.status(500).json({ error: 'Failed to fetch director' });
    }
});

// ==================== DELEGATION ENDPOINTS ====================

// Create a new delegation
app.post('/api/delegations', async (req, res) => {
    try {
        const { fromManagerId, toManagerId, startDate, endDate, reason } = req.body;
        
        if (!fromManagerId || !toManagerId || !startDate || !endDate) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (fromManagerId === toManagerId) {
            return res.status(400).json({ error: 'Cannot delegate to yourself' });
        }
        
        // Check for overlapping delegations
        const existing = delegations.find(d => 
            d.fromManagerId === fromManagerId &&
            d.status === 'active' &&
            new Date(d.startDate) <= new Date(endDate) &&
            new Date(d.endDate) >= new Date(startDate)
        );
        
        if (existing) {
            return res.status(400).json({ error: 'Overlapping delegation already exists' });
        }
        
        const delegation = {
            id: delegationIdCounter++,
            fromManagerId,
            toManagerId,
            startDate,
            endDate,
            reason: reason || '',
            status: 'active',
            createdAt: new Date().toISOString()
        };
        
        delegations.push(delegation);
        
        res.json({ 
            success: true, 
            message: 'Delegation created successfully',
            delegation 
        });
        
    } catch (error) {
        console.error('Error creating delegation:', error);
        res.status(500).json({ error: 'Failed to create delegation' });
    }
});

// Get delegations for a manager (both outgoing and incoming)
app.get('/api/delegations/:managerId', async (req, res) => {
    try {
        const { managerId } = req.params;
        
        const outgoing = getDelegationsFromManager(managerId);
        const incoming = getDelegationsToManager(managerId);
        
        // Get names for the managers
        const authentication = getSession();
        const enhancedOutgoing = await Promise.all(outgoing.map(async d => {
            const toMgr = await queryFeatures({
                url: EMPLOYEES_URL,
                where: `EmployeeID = '${d.toManagerId}'`,
                outFields: 'FirstName,LastName',
                returnGeometry: false,
                authentication
            });
            return {
                ...d,
                toManagerName: toMgr.features?.[0]?.attributes 
                    ? `${toMgr.features[0].attributes.FirstName} ${toMgr.features[0].attributes.LastName}`
                    : 'Unknown'
            };
        }));
        
        const enhancedIncoming = await Promise.all(incoming.map(async d => {
            const fromMgr = await queryFeatures({
                url: EMPLOYEES_URL,
                where: `EmployeeID = '${d.fromManagerId}'`,
                outFields: 'FirstName,LastName',
                returnGeometry: false,
                authentication
            });
            return {
                ...d,
                fromManagerName: fromMgr.features?.[0]?.attributes 
                    ? `${fromMgr.features[0].attributes.FirstName} ${fromMgr.features[0].attributes.LastName}`
                    : 'Unknown'
            };
        }));
        
        res.json({ 
            success: true, 
            outgoing: enhancedOutgoing,
            incoming: enhancedIncoming
        });
        
    } catch (error) {
        console.error('Error fetching delegations:', error);
        res.status(500).json({ error: 'Failed to fetch delegations' });
    }
});

// Cancel a delegation
app.put('/api/delegations/:delegationId/cancel', async (req, res) => {
    try {
        const { delegationId } = req.params;
        
        const delegation = delegations.find(d => d.id === parseInt(delegationId));
        
        if (!delegation) {
            return res.status(404).json({ error: 'Delegation not found' });
        }
        
        delegation.status = 'cancelled';
        delegation.cancelledAt = new Date().toISOString();
        
        res.json({ 
            success: true, 
            message: 'Delegation cancelled successfully' 
        });
        
    } catch (error) {
        console.error('Error cancelling delegation:', error);
        res.status(500).json({ error: 'Failed to cancel delegation' });
    }
});

// Get other managers (for delegation dropdown)
app.get('/api/managers/except/:managerId', async (req, res) => {
    try {
        const { managerId } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'manager' AND IsActive = 1 AND EmployeeID <> '${managerId}'`,
            outFields: 'EmployeeID,FirstName,LastName,Email',
            returnGeometry: false,
            orderByFields: 'LastName ASC',
            authentication
        });

        const managers = response.features?.map(f => ({
            employeeId: f.attributes.EmployeeID,
            firstName: f.attributes.FirstName,
            lastName: f.attributes.LastName,
            email: f.attributes.Email
        })) || [];

        res.json({ success: true, managers });

    } catch (error) {
        console.error('Error fetching other managers:', error);
        res.status(500).json({ error: 'Failed to fetch managers' });
    }
});

// ==================== DEPARTMENT ENDPOINTS ====================

// Get all departments
app.get('/api/departments', async (req, res) => {
    try {
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: DEPARTMENTS_URL,
            where: '1=1',
            outFields: '*',
            returnGeometry: false,
            authentication
        });

        res.json(response);

    } catch (error) {
        console.error('Error fetching departments:', error);
        res.status(500).json({ error: 'Failed to fetch departments' });
    }
});

// ==================== ADMIN ENDPOINTS ====================

// Get all users (for admin)
app.get('/api/admin/users', async (req, res) => {
    try {
        const authentication = getSession();
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: '1=1',
            outFields: 'OBJECTID,EmployeeID,Username,FirstName,LastName,Email,Role,Department,IsActive,ManagerID',
            orderByFields: 'LastName ASC',
            returnGeometry: false,
            authentication
        });

        const users = response.features?.map(f => ({
            id: f.attributes.OBJECTID,
            employeeId: f.attributes.EmployeeID,
            username: f.attributes.Username,
            firstName: f.attributes.FirstName,
            lastName: f.attributes.LastName,
            email: f.attributes.Email,
            role: f.attributes.Role,
            department: f.attributes.Department,
            isActive: f.attributes.IsActive === 1,
            managerId: f.attributes.ManagerID
        })) || [];

        res.json({ success: true, users });
    } catch (error) {
        console.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

// Create new user
app.post('/api/admin/users', async (req, res) => {
    try {
        const { firstName, lastName, email, username, password, role, department, managerId } = req.body;

        if (!firstName || !lastName || !email || !username || !password || !role) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        const authentication = getSession();

        // Check if username already exists
        const existing = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Username = '${username}'`,
            outFields: 'OBJECTID',
            returnGeometry: false,
            authentication
        });

        if (existing.features?.length > 0) {
            return res.status(400).json({ error: 'Username already exists' });
        }

        // Generate EmployeeID
        const employeeId = `EMP${Date.now()}`;

        // Create user
        const result = await addFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    EmployeeID: employeeId,
                    Username: username,
                    PasswordHash: hashPassword(password),
                    FirstName: firstName,
                    LastName: lastName,
                    Email: email,
                    Role: role,
                    Department: department || null,
                    ManagerID: managerId || null,
                    IsActive: 1,
                    AnnualLeaveBalance: 0,
                    SickLeaveBalance: 90,
                    OtherLeaveBalance: 10
                }
            }],
            authentication
        });

        if (result.addResults?.[0]?.success) {
            res.json({ 
                success: true, 
                message: 'User created successfully',
                userId: result.addResults[0].objectId,
                employeeId
            });
        } else {
            throw new Error('Failed to create user');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message || 'Failed to create user' });
    }
});

// Update user
app.put('/api/admin/users/:objectId', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { firstName, lastName, email, role, department, managerId, isActive, username } = req.body;

        const authentication = getSession();

        const updateAttrs = { OBJECTID: parseInt(objectId) };
        if (firstName !== undefined) updateAttrs.FirstName = firstName;
        if (lastName !== undefined) updateAttrs.LastName = lastName;
        if (email !== undefined) updateAttrs.Email = email;
        if (role !== undefined) updateAttrs.Role = role;
        if (department !== undefined) updateAttrs.Department = department;
        if (managerId !== undefined) updateAttrs.ManagerID = managerId;
        if (isActive !== undefined) updateAttrs.IsActive = isActive ? 1 : 0;
        if (username !== undefined) updateAttrs.Username = username;

        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{ attributes: updateAttrs }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            res.json({ success: true, message: 'User updated successfully' });
        } else {
            throw new Error('Failed to update user');
        }
    } catch (error) {
        console.error('Error updating user:', error);
        res.status(500).json({ error: error.message || 'Failed to update user' });
    }
});

// Reset password
app.put('/api/admin/users/:objectId/reset-password', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 4) {
            return res.status(400).json({ error: 'Password must be at least 4 characters' });
        }

        const authentication = getSession();

        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: parseInt(objectId),
                    PasswordHash: hashPassword(newPassword)
                }
            }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            res.json({ success: true, message: 'Password reset successfully' });
        } else {
            throw new Error('Failed to reset password');
        }
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ error: error.message || 'Failed to reset password' });
    }
});

// Delete user (soft delete - set IsActive to 0)
app.delete('/api/admin/users/:objectId', async (req, res) => {
    try {
        const { objectId } = req.params;
        const authentication = getSession();

        // Soft delete by setting IsActive to 0
        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: parseInt(objectId),
                    IsActive: 0
                }
            }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            res.json({ success: true, message: 'User deactivated successfully' });
        } else {
            throw new Error('Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message || 'Failed to delete user' });
    }
});

// ==================== HEALTH CHECK ====================

app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        tables: {
            employees: EMPLOYEES_URL ? 'configured' : 'missing',
            leaveRequests: LEAVE_REQUESTS_URL ? 'configured' : 'missing',
            departments: DEPARTMENTS_URL ? 'configured' : 'missing'
        }
    });
});


// ==================== DEPLOYMENT (Serve Client) ====================

// Serve static files from the client build directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// Handle React routing, return all requests to React app
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist', 'index.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on http://localhost:${PORT}`);
    console.log('\n📋 Table URLs:');
    console.log(`   Employees:     ${EMPLOYEES_URL || 'NOT SET'}`);
// ... rest of logging ...
    console.log(`   LeaveRequests: ${LEAVE_REQUESTS_URL || 'NOT SET'}`);
    console.log(`   Departments:   ${DEPARTMENTS_URL || 'NOT SET'}`);
    console.log('\n📡 API Endpoints:');
    console.log('   POST /api/auth/login         - User login');
    console.log('   GET  /api/auth/balance/:id   - Get leave balance');
    console.log('   GET  /api/leaves             - Get all leaves');
    console.log('   GET  /api/leaves/pending     - Get pending requests');
    console.log('   POST /api/leaves             - Submit leave request');
    console.log('   PUT  /api/leaves/:id/approve - Approve request');
    console.log('   PUT  /api/leaves/:id/reject  - Reject request');
    console.log('   GET  /api/employees          - Get all employees');
    console.log('   GET  /api/departments        - Get departments');
});
