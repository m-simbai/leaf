require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { ApplicationSession } = require('@esri/arcgis-rest-auth');
const { request } = require('@esri/arcgis-rest-request');
const { queryFeatures, addFeatures, updateFeatures, deleteFeatures } = require('@esri/arcgis-rest-feature-layer');
const crypto = require('crypto');
const { notifyNewRequest, notifyApproved, notifyRejected, notifyEarlyCheckin, notifyExtensionRequest, notifyExtensionApproved, notifyExtensionRejected, notifyManagerExtension, notifyPasswordReset, notifyAccountCreated, notifyPasswordSetupLink, notifyManagerAssignment, notifyPasswordResetLink, notifyAssignmentRequest, notifyAssignmentApproved, notifyAssignmentRejected, notifyPreviousManagerReassignment } = require('./services/webhookService');
const { calculateProjectedSchedule, getCycleStatus, getLeaveTypeColor, YEARLY_SICK_DAYS, YEARLY_COMPASSIONATE_DAYS } = require('./services/cycleService');

function hashPassword(password) {
    return crypto.createHash('sha256').update(password).digest('hex');
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Log the Service URL being used
console.log('----------------------------------------------------------------');
console.log('🔌 Connected to Feature Service:');
console.log('   ' + process.env.LEAVE_TRACKER_SERVICE_URL);
console.log('----------------------------------------------------------------');

// Table URLs from environment
const EMPLOYEES_URL = process.env.EMPLOYEES_TABLE_URL;
const LEAVE_REQUESTS_URL = process.env.LEAVE_REQUESTS_TABLE_URL;
const DEPARTMENTS_URL = process.env.DEPARTMENTS_TABLE_URL;

// ApplicationSession for OAuth 2.0 Client Credentials Flow
let session = null;

// Custom UserSession to handle username/password auth directly
class CustomUserSession {
    constructor(username, password) {
        this.username = username;
        this.password = password;
        this.token = null;
        this.expires = 0;
    }

    async getToken(url) {
        // Return cached token if valid (with 1 min buffer)
        if (this.token && Date.now() < (this.expires - 60000)) {
            return this.token;
        }
        
        console.log('🔐 Requesting new ArcGIS token for user:', this.username);
        try {
            const response = await fetch('https://www.arcgis.com/sharing/rest/generateToken', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: new URLSearchParams({
                    username: this.username,
                    password: this.password,
                    client: 'referer',
                    referer: 'https://www.arcgis.com',
                    expiration: 60, // minutes
                    f: 'json'
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                console.error('❌ Token generation failed:', data.error.message);
                throw new Error(data.error.message);
            }
            
            this.token = data.token;
            this.expires = data.expires; 
            console.log('✅ Token obtained successfully');
            return this.token;
        } catch (error) {
            console.error('Network error requesting token:', error);
            throw error;
        }
    }
}

function getSession() {
    if (!session) {
        // Prioritize User Authentication if credentials are provided
        if (process.env.ARCGIS_USERNAME && process.env.ARCGIS_PASSWORD) {
            session = new CustomUserSession(
                process.env.ARCGIS_USERNAME,
                process.env.ARCGIS_PASSWORD
            );
            console.log(`Initialized CustomUserSession for ${process.env.ARCGIS_USERNAME}`);
        } else {
            // Fallback to Application Credentials
            session = new ApplicationSession({
                clientId: process.env.ARCGIS_CLIENT_ID,
                clientSecret: process.env.ARCGIS_CLIENT_SECRET
            });
            console.log('Initialized ApplicationSession (Client ID/Secret)');
        }
    }
    return session;
}



// Strong password validation: 8+ chars, uppercase, number, special char
function validateStrongPassword(password) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter';
    if (!/\d/.test(password)) return 'Password must contain at least one number';
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return 'Password must contain at least one special character';
    return null; // Valid
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



// Helper: Get specific manager for an employee
async function getManagerForEmployee(employeeId) {
    try {
        const authentication = getSession();
        
        // 1. Get employee's manager ID
        const empResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: 'ManagerID',
            returnGeometry: false,
            authentication
        });
        
        const managerId = empResponse.features?.[0]?.attributes?.ManagerID;
        
        if (!managerId) return null;
        
        // 2. Get manager's details
        const managerResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${managerId}'`,
            outFields: 'Email,FirstName,LastName',
            returnGeometry: false,
            authentication
        });
        
        return managerResponse.features?.[0]?.attributes;
    } catch (error) {
        console.error('Error fetching manager for employee:', error);
        return null;
    }
}

// Helper: Get director email
async function getDirectorEmail() {
    try {
        const authentication = getSession();
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Role = 'director'`,
            outFields: 'Email',
            returnGeometry: false,
            authentication
        });
        
        // Return first director found, or admin email
        return response.features?.[0]?.attributes?.Email || process.env.ADMIN_EMAIL || '';
    } catch (error) {
        console.error('Error fetching director email:', error);
        return process.env.ADMIN_EMAIL || '';
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
        
        // Check password
        const hashedInput = hashPassword(password);
        if (employee.PasswordHash !== hashedInput) {
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        // Check if role matches (if specified)
        if (role) {
            const requestedRole = role.toLowerCase();
            const userRole = (employee.Role || '').toLowerCase();
            
            if (userRole !== requestedRole) {
                // Maximum security: role must match exactly
                return res.status(401).json({ error: 'Invalid username or password' });
            }
        } else {
            // If no role specified (standard login), prevent ADMIN from logging in
            if ((employee.Role || '').toLowerCase() === 'admin') {
                return res.status(403).json({ error: 'Admins must use the Admin Portal for login.' });
            }
        }

        // Check if account is active
        if (employee.IsActive === 0) {
            return res.status(401).json({ error: 'Account is deactivated' });
        }

        // Check if password setup is pending
        if (employee.PasswordHash === 'PENDING_SETUP') {
           return res.status(401).json({ error: 'Account pending setup. Please check your email to set a password.' }); 
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
        
        const employee = response.features[0].attributes;
        
        // Verify password
        const hashedInput = hashPassword(password);
        if (employee.PasswordHash !== hashedInput) {
             return res.status(401).json({ error: 'Invalid password' });
        }

        res.json({ success: true });

    } catch (error) {
        console.error('Password verification error:', error);
        res.status(500).json({ error: 'Verification failed' });
    }
});

// Forgot password endpoint - now generates secure reset token
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        const { username } = req.body;
        
        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const authentication = getSession();
        
        // Sanitize username to prevent SQL injection
        const sanitizedUsername = username.replace(/'/g, "''");
        
        // Query employees table to find user
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `Username = '${sanitizedUsername}'`,
            outFields: 'OBJECTID,Username,Email,FirstName,LastName',
            returnGeometry: false,
            authentication
        });

        if (response.features && response.features.length > 0) {
            const employee = response.features[0].attributes;
            
            // Generate reset token (1 hour expiry)
            const resetToken = crypto.randomBytes(32).toString('hex');
            const resetTokenExpiry = Date.now() + (60 * 60 * 1000); // 1 hour
            
            // Store token in database
            await updateFeatures({
                url: EMPLOYEES_URL,
                features: [{
                    attributes: {
                        OBJECTID: employee.OBJECTID,
                        ResetToken: resetToken,
                        ResetTokenExpiry: resetTokenExpiry
                    }
                }],
                authentication
            });
            
            // Send reset link via webhook
            const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
            const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}`;
            
            await notifyPasswordResetLink({
                firstName: employee.FirstName,
                lastName: employee.LastName,
                email: employee.Email,
                username: employee.Username,
                resetLink
            });

            res.json({ 
                success: true, 
                message: 'If an account exists with that username, a password reset link has been sent.' 
            });
        } else {
            // User requested explicit feedback if username is not found
            return res.status(404).json({ error: 'Username not found. Please contact administrator.' });
        }

    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Request failed' });
    }
});

// Validate setup token endpoint
app.get('/api/auth/validate-setup-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const authentication = getSession();

        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `SetupToken = '${token}'`,
            outFields: 'SetupTokenExpiry,FirstName,LastName',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.json({ valid: false, error: 'Invalid setup link' });
        }

        const user = response.features[0].attributes;

        if (user.SetupTokenExpiry && user.SetupTokenExpiry < Date.now()) {
            return res.json({ valid: false, error: 'Setup link has expired' });
        }

        res.json({ 
            valid: true, 
            firstName: user.FirstName, 
            lastName: user.LastName 
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// Validate reset token endpoint
app.get('/api/auth/validate-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const authentication = getSession();

        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ResetToken = '${token}'`,
            outFields: 'ResetTokenExpiry,FirstName,LastName',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.json({ valid: false, error: 'Invalid reset link' });
        }

        const user = response.features[0].attributes;

        if (user.ResetTokenExpiry && user.ResetTokenExpiry < Date.now()) {
            return res.json({ valid: false, error: 'Reset link has expired' });
        }

        res.json({ 
            valid: true, 
            firstName: user.FirstName, 
            lastName: user.LastName 
        });

    } catch (error) {
        console.error('Token validation error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});

// Setup password (for new accounts via email link)
app.post('/api/auth/setup-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }
        
        const passwordError = validateStrongPassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const authentication = getSession();
        
        // Find user with this setup token
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `SetupToken = '${token}'`,
            outFields: 'OBJECTID,SetupTokenExpiry,Username',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired setup link' });
        }

        const user = response.features[0].attributes;
        
        // Check if token is expired
        if (user.SetupTokenExpiry && user.SetupTokenExpiry < Date.now()) {
            return res.status(400).json({ error: 'Setup link has expired. Please contact administrator.' });
        }

        // Update password and clear token
        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: user.OBJECTID,
                    PasswordHash: hashPassword(password),
                    SetupToken: null,
                    SetupTokenExpiry: null,
                    PasswordSet: 1
                }
            }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            res.json({ 
                success: true, 
                message: 'Password set successfully! You can now log in.',
                username: user.Username
            });
        } else {
            throw new Error('Failed to set password');
        }

    } catch (error) {
        console.error('Setup password error:', error);
        res.status(500).json({ error: 'Failed to set password' });
    }
});

// Reset password (via email link)
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { token, password } = req.body;
        
        if (!token || !password) {
            return res.status(400).json({ error: 'Token and password are required' });
        }
        
        const passwordError = validateStrongPassword(password);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
        }

        const authentication = getSession();
        
        // Find user with this reset token
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ResetToken = '${token}'`,
            outFields: 'OBJECTID,ResetTokenExpiry,Username',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(400).json({ error: 'Invalid or expired reset link' });
        }

        const user = response.features[0].attributes;
        
        // Check if token is expired
        if (user.ResetTokenExpiry && user.ResetTokenExpiry < Date.now()) {
            return res.status(400).json({ error: 'Reset link has expired. Please request a new one.' });
        }

        // Update password and clear token
        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: user.OBJECTID,
                    PasswordHash: hashPassword(password),
                    ResetToken: null,
                    ResetTokenExpiry: null
                }
            }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            res.json({ 
                success: true, 
                message: 'Password reset successfully! You can now log in.',
                username: user.Username
            });
        } else {
            throw new Error('Failed to reset password');
        }

    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Failed to reset password' });
    }
});

// Validate setup token (for frontend to check if token is valid before showing form)
app.get('/api/auth/validate-setup-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `SetupToken = '${token}'`,
            outFields: 'SetupTokenExpiry,FirstName,LastName',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(400).json({ valid: false, error: 'Invalid setup link' });
        }

        const user = response.features[0].attributes;
        
        if (user.SetupTokenExpiry && user.SetupTokenExpiry < Date.now()) {
            return res.status(400).json({ valid: false, error: 'Setup link has expired' });
        }

        res.json({ 
            valid: true, 
            firstName: user.FirstName,
            lastName: user.LastName
        });

    } catch (error) {
        console.error('Validate setup token error:', error);
        res.status(500).json({ valid: false, error: 'Validation failed' });
    }
});

// Validate reset token
app.get('/api/auth/validate-reset-token/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const authentication = getSession();
        
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `ResetToken = '${token}'`,
            outFields: 'ResetTokenExpiry,FirstName,LastName',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.status(400).json({ valid: false, error: 'Invalid reset link' });
        }

        const user = response.features[0].attributes;
        
        if (user.ResetTokenExpiry && user.ResetTokenExpiry < Date.now()) {
            return res.status(400).json({ valid: false, error: 'Reset link has expired' });
        }

        res.json({ 
            valid: true, 
            firstName: user.FirstName,
            lastName: user.LastName
        });

    } catch (error) {
        console.error('Validate reset token error:', error);
        res.status(500).json({ valid: false, error: 'Validation failed' });
    }
});

// ==================== ASSIGNMENT APPROVAL ENDPOINTS ====================

// Approve assignment via email token link
app.get('/api/auth/approve-assignment/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const authentication = getSession();
        const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
        
        // Find staff with this assignment token
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `AssignmentToken = '${token}'`,
            outFields: 'OBJECTID,FirstName,LastName,Email,PendingManagerID,AssignmentTokenExpiry,EmployeeID',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.redirect(`${APP_BASE_URL}/assignment-result?status=invalid`);
        }

        const staff = response.features[0].attributes;
        
        // Check token expiry
        if (staff.AssignmentTokenExpiry && staff.AssignmentTokenExpiry < Date.now()) {
            return res.redirect(`${APP_BASE_URL}/assignment-result?status=expired`);
        }

        // Get manager details
        const managerResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${staff.PendingManagerID}'`,
            outFields: 'FirstName,LastName,Email',
            returnGeometry: false,
            authentication
        });

        const manager = managerResponse.features?.[0]?.attributes || {};

        // Update: set ManagerID = PendingManagerID, clear pending fields
        await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: staff.OBJECTID,
                    ManagerID: staff.PendingManagerID,
                    PendingManagerID: null,
                    AssignmentToken: null,
                    AssignmentTokenExpiry: null,
                    AssignmentStatus: 'approved'
                }
            }],
            authentication
        });

        // Send approval notifications
        notifyAssignmentApproved({
            staffFirstName: staff.FirstName,
            staffLastName: staff.LastName,
            staffEmail: staff.Email,
            managerFirstName: manager.FirstName,
            managerLastName: manager.LastName,
            managerEmail: manager.Email
        }).catch(err => console.error('Assignment approved webhook error:', err));

        console.log(`✅ Assignment approved: ${staff.FirstName} ${staff.LastName} -> ${manager.FirstName} ${manager.LastName}`);
        res.redirect(`${APP_BASE_URL}/assignment-result?status=approved&staff=${encodeURIComponent(staff.FirstName)}`);

    } catch (error) {
        console.error('Approve assignment error:', error);
        const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
        res.redirect(`${APP_BASE_URL}/assignment-result?status=error`);
    }
});

// Reject assignment via email token link
app.get('/api/auth/reject-assignment/:token', async (req, res) => {
    try {
        const { token } = req.params;
        const reason = req.query.reason || '';
        const authentication = getSession();
        const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
        
        // Find staff with this assignment token
        const response = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `AssignmentToken = '${token}'`,
            outFields: 'OBJECTID,FirstName,LastName,Email,PendingManagerID,AssignmentTokenExpiry',
            returnGeometry: false,
            authentication
        });

        if (!response.features || response.features.length === 0) {
            return res.redirect(`${APP_BASE_URL}/assignment-result?status=invalid`);
        }

        const staff = response.features[0].attributes;
        
        // Check token expiry
        if (staff.AssignmentTokenExpiry && staff.AssignmentTokenExpiry < Date.now()) {
            return res.redirect(`${APP_BASE_URL}/assignment-result?status=expired`);
        }

        // Get manager details
        const managerResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${staff.PendingManagerID}'`,
            outFields: 'FirstName,LastName,Email',
            returnGeometry: false,
            authentication
        });

        const manager = managerResponse.features?.[0]?.attributes || {};

        // Clear pending fields, set status to rejected
        await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: staff.OBJECTID,
                    PendingManagerID: null,
                    AssignmentToken: null,
                    AssignmentTokenExpiry: null,
                    AssignmentStatus: 'rejected'
                }
            }],
            authentication
        });

        // Send rejection notifications
        notifyAssignmentRejected({
            staffFirstName: staff.FirstName,
            staffLastName: staff.LastName,
            staffEmail: staff.Email,
            managerFirstName: manager.FirstName,
            managerLastName: manager.LastName,
            managerEmail: manager.Email,
            rejectionReason: reason
        }).catch(err => console.error('Assignment rejected webhook error:', err));

        console.log(`❌ Assignment rejected: ${staff.FirstName} ${staff.LastName} by ${manager.FirstName} ${manager.LastName}`);
        res.redirect(`${APP_BASE_URL}/assignment-result?status=rejected&staff=${encodeURIComponent(staff.FirstName)}`);

    } catch (error) {
        console.error('Reject assignment error:', error);
        const APP_BASE_URL = process.env.APP_BASE_URL || 'http://localhost:5173';
        res.redirect(`${APP_BASE_URL}/assignment-result?status=error`);
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


// (cycle-status endpoint moved to after health check, before deployment section)

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
        
        // Block same-day leave requests (must start from tomorrow onwards)
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = todayStart.getTime();
        if (newStartDate <= todayEnd) {
            return res.status(400).json({ 
                error: 'Leave cannot start today or in the past. Please choose a date from tomorrow onwards.' 
            });
        }

        // Block 1-day leave requests (Start Date and End Date cannot be the same)
        // Ensure time components are stripped for comparison
        const startDateOnly = new Date(startDate);
        startDateOnly.setHours(0,0,0,0);
        const endDateOnly = new Date(endDate);
        endDateOnly.setHours(0,0,0,0);
        
        if (startDateOnly.getTime() === endDateOnly.getTime()) {
            return res.status(400).json({ 
                error: 'Leave must be at least 2 days (Start and End dates cannot be the same).' 
            });
        }
        
        // For annual/time-off leave, enforce accumulation cap
        if (leaveType && leaveType.toLowerCase() === 'annual') {
            try {
                // Get the employee's StartDate for accumulation calculation
                const empQuery = await queryFeatures({
                    url: EMPLOYEES_URL,
                    where: `EmployeeID = '${employeeId}'`,
                    outFields: 'StartDate,AnnualLeaveBalance',
                    returnGeometry: false,
                    authentication
                });
                const empData = empQuery.features?.[0]?.attributes;
                
                // Calculate accumulated days using 22/8 cycle
                const empStartDate = empData?.StartDate ? new Date(empData.StartDate) : new Date(new Date().getFullYear(), 0, 1);
                const today = new Date();
                const msPerDay = 24 * 60 * 60 * 1000;
                const totalDays = Math.floor((today - empStartDate) / msPerDay);
                let workDays = 0;
                // Estimate work days based on 22-on/8-off cycle (30 day cycle)
                // We don't use weekend logic because they work weekends.
                // We assume uniform distribution of work/off days over the period.
                workDays = Math.floor(totalDays * (22 / 30));
                const daysAccumulated = Math.floor((workDays / 22) * 8);
                
                // Count already approved/pending annual leave days
                const usedLeaves = await queryFeatures({
                    url: LEAVE_REQUESTS_URL,
                    where: `EmployeeID = '${employeeId}' AND LeaveType = 'annual' AND Status IN ('pending', 'approved')`,
                    outFields: 'Days',
                    returnGeometry: false,
                    authentication
                });
                let usedDays = 0;
                if (usedLeaves.features) {
                    usedDays = usedLeaves.features.reduce((sum, f) => sum + (f.attributes.Days || 0), 0);
                }
                
                const availableDays = daysAccumulated - usedDays;
                const requestedDays = daysRequested || 1;
                
                if (requestedDays > availableDays) {
                    return res.status(400).json({ 
                        error: `Insufficient time-off balance. You have ${Math.max(0, availableDays)} accumulated off-days available, but requested ${requestedDays}.` 
                    });
                }
            } catch (capErr) {
                console.warn('Accumulation cap check failed (non-blocking):', capErr.message);
            }
        }
        
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
                        (async () => {
                            const manager = await getManagerForEmployee(employeeId);
                            return manager?.Email || await getDirectorEmail(); 
                        })()
                    ]);
                    
                    console.log('--- NOTIFICATION DEBUG ---');
                    console.log(`Resolved Employee Email: ${employeeEmail}`);
                    console.log(`Resolved Manager Email: ${managerEmail}`);
                    console.log('--------------------------');

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
                        const manager = await getManagerForEmployee(originalRequest.EmployeeID);
                        const managerEmail = manager?.Email || await getDirectorEmail();
                        
                        console.log('--- NOTIFICATION DEBUG (APPROVE) ---');
                        console.log(`Resolved Employee Email: ${employeeEmail}`);
                        console.log(`Resolved Manager Email: ${managerEmail}`);
                        console.log('--------------------------');

                        await notifyApproved({
                            employeeName: originalRequest.EmployeeName || 'Unknown',
                            employeeEmail: employeeEmail,
                            managerEmail: managerEmail,
                            leaveType: originalRequest.LeaveType,
                            startDate: new Date(originalRequest.StartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            endDate: new Date(originalRequest.EndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            daysRequested: originalRequest.DaysRequested || originalRequest.Days || 1,
                            reason: originalRequest.Reason || 'No reason provided'
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
            console.log('Leave request rejected SUCCESS:', objectId, 'Result:', JSON.stringify(response.updateResults[0]));
            
            // Send notification to employee via Power Automate
            if (originalRequest) {
                (async () => {
                    try {
                        const employeeEmail = await getEmployeeEmail(originalRequest.EmployeeID);
                        const manager = await getManagerForEmployee(originalRequest.EmployeeID);
                        const managerEmail = manager?.Email || await getDirectorEmail();

                        console.log('--- NOTIFICATION DEBUG (REJECT) ---');
                        console.log(`Resolved Employee Email: ${employeeEmail}`);
                        console.log(`Resolved Manager Email: ${managerEmail}`);
                        console.log('--------------------------');
                        
                        await notifyRejected({
                            employeeName: originalRequest.EmployeeName || 'Unknown',
                            employeeEmail: employeeEmail,
                            managerEmail: managerEmail,
                            leaveType: originalRequest.LeaveType,
                            startDate: new Date(originalRequest.StartDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            endDate: new Date(originalRequest.EndDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                            daysRequested: originalRequest.DaysRequested || originalRequest.Days || 1,
                            reason: originalRequest.Reason || 'No reason provided',
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
                    Days: originalRequest.Days + additionalDays
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

                    console.log('--- NOTIFICATION DEBUG (MANAGER EXTEND) ---');
                    console.log(`Resolved Employee Email: ${employeeEmail}`);
                    console.log('--------------------------');

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
                    const manager = await getManagerForEmployee(originalRequest.EmployeeID);
                    const managerEmail = manager?.Email || await getDirectorEmail();
                    console.log('--- NOTIFICATION DEBUG (EARLY CHECKIN) ---');
                    console.log(`Resolved Employee Email: ${employeeEmail}`);
                    console.log(`Resolved Manager Email: ${managerEmail}`);
                    console.log('--------------------------');

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
                    const manager = await getManagerForEmployee(originalRequest.EmployeeID);
                    const managerEmail = manager?.Email || await getDirectorEmail();
                    console.log('--- NOTIFICATION DEBUG (EXTENSION REQUEST) ---');
                    console.log(`Resolved Employee Email: ${employeeEmail}`);
                    console.log(`Resolved Manager Email: ${managerEmail}`);
                    console.log('--------------------------');

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
                Days: originalRequest.Days + additionalDays,
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
            const manager = await getManagerForEmployee(originalRequest.EmployeeID);
            const managerEmail = manager?.Email || await getDirectorEmail();

            (async () => {
                try {
                    await notifyExtensionApproved({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        managerEmail: managerEmail,
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
                const manager = await getManagerForEmployee(originalRequest.EmployeeID);
                const managerEmail = manager?.Email || await getDirectorEmail();

                (async () => {
                    try {
                        await notifyExtensionRejected({
                            employeeName: originalRequest.EmployeeName,
                            employeeEmail: employeeEmail,
                            managerEmail: managerEmail,
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
                Days: originalRequest.Days + additionalDays,
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
            const manager = await getManagerForEmployee(originalRequest.EmployeeID);
            const managerEmail = manager?.Email || await getDirectorEmail();

            (async () => {
                try {
                    console.log('--- NOTIFICATION DEBUG (MANAGER EXTEND) ---');
                    console.log(`Resolved Employee Email: ${employeeEmail}`);
                    console.log(`Resolved Manager Email: ${managerEmail}`);
                    console.log('--------------------------');

                    await notifyManagerExtension({
                        employeeName: originalRequest.EmployeeName,
                        employeeEmail: employeeEmail,
                        managerEmail: managerEmail,
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
            outFields: '*',
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
            managerId: f.attributes.ManagerID,
            passwordSet: f.attributes.PasswordHash !== 'PENDING_SETUP',
            startDate: f.attributes.StartDate || null
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

        // Password is now optional - if not provided, user will set via email link
        if (!firstName || !lastName || !email || !username || !role) {
            return res.status(400).json({ error: 'Missing required fields (firstName, lastName, email, username, role)' });
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
        
        // Generate setup token if no password provided
        const setupToken = password ? null : crypto.randomBytes(32).toString('hex');
        const setupTokenExpiry = password ? null : Date.now() + (24 * 60 * 60 * 1000); // 24 hours
        const passwordSet = password ? 1 : 0;

        // Create user
        const result = await addFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    EmployeeID: employeeId,
                    Username: username,
                    // PasswordHash cannot be null in DB, use placeholder if not set
                    PasswordHash: password ? hashPassword(password) : 'PENDING_SETUP',
                    FirstName: firstName,
                    LastName: lastName,
                    Email: email,
                    Role: role,
                    Department: department || null,
                    ManagerID: managerId || null,
                    IsActive: 1,
                    AnnualLeaveBalance: 0,
                    SickLeaveBalance: 90,
                    OtherLeaveBalance: 10,
                    SetupToken: setupToken,
                    SetupTokenExpiry: setupTokenExpiry,
                    PasswordSet: passwordSet
                }
            }],
            authentication
        });

        if (result.addResults?.[0]?.success) {
            const objectId = result.addResults[0].objectId;
            
            // Send notifications (async, don't block response)
            (async () => {
                try {
                    // Send account created notification
                    await notifyAccountCreated({
                        firstName,
                        lastName,
                        email,
                        username,
                        role,
                        department
                    });
                    
                    // If no password set, send setup link
                    if (!password && setupToken) {
                        const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
                        const setupLink = `${appBaseUrl}/setup-password?token=${setupToken}`;
                        
                        await notifyPasswordSetupLink({
                            firstName,
                            lastName,
                            email,
                            username,
                            setupLink
                        });
                        console.log('📧 Password setup link sent to:', email);
                    }
                } catch (err) {
                    console.error('Webhook notification failed:', err);
                }
            })();
            
            res.json({ 
                success: true, 
                message: password ? 'User created successfully' : 'User created. Password setup email sent.',
                userId: objectId,
                employeeId,
                passwordSetupRequired: !password
            });
        } else {
            console.error('ArcGIS addFeatures failed:', JSON.stringify(result, null, 2));
            throw new Error('Failed to create user');
        }
    } catch (error) {
        console.error('Error creating user:', error);
        res.status(500).json({ error: error.message || 'Failed to create user' });
    }
});

// Admin trigger password reset (sends email)
app.post('/api/admin/users/:id/reset-password', async (req, res) => {
    try {
        const { id } = req.params;
        const authentication = getSession();

        // Verify user exists first
        const userQuery = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `OBJECTID = ${id}`,
            outFields: 'OBJECTID,FirstName,LastName,Email,Username',
            returnGeometry: false,
            authentication
        });

        if (!userQuery.features || userQuery.features.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        const user = userQuery.features[0].attributes;

        // Generate reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = Date.now() + (24 * 60 * 60 * 1000); // 24 hours (generous for admin reset)

        // Update user with token
        const updateResult = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{
                attributes: {
                    OBJECTID: user.OBJECTID,
                    ResetToken: resetToken,
                    ResetTokenExpiry: resetTokenExpiry,
                    // Optionally set PasswordSet to 0 if we want to force "Pending" status? 
                    // Let's keep it simple for now, just allow reset.
                }
            }],
            authentication
        });

        if (updateResult.updateResults?.[0]?.success) {
            // Send email
            const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:5173').replace(/\/$/, '');
            const resetLink = `${appBaseUrl}/reset-password?token=${resetToken}`;

            await notifyPasswordResetLink({
                firstName: user.FirstName,
                lastName: user.LastName,
                email: user.Email,
                username: user.Username,
                resetLink
            });

            console.log(`📧 Admin triggered password reset for ${user.Username}`);
            res.json({ success: true, message: `Reset link sent to ${user.Email}` });
        } else {
            throw new Error('Failed to update user record');
        }

    } catch (error) {
        console.error('Error initiating password reset:', error);
        res.status(500).json({ error: 'Failed to initiate password reset' });
    }
});


// Update user
app.put('/api/admin/users/:objectId', async (req, res) => {
    try {
        const { objectId } = req.params;
        const { firstName, lastName, email, role, department, managerId, isActive, username, startDate } = req.body;

        const authentication = getSession();
        
        // Get current user data to detect manager changes
        let previousManagerId = null;
        let staffData = null;
        if (managerId !== undefined) {
            const currentUser = await queryFeatures({
                url: EMPLOYEES_URL,
                where: `OBJECTID = ${objectId}`,
                outFields: 'ManagerID,FirstName,LastName,Email',
                returnGeometry: false,
                authentication
            });
            staffData = currentUser.features?.[0]?.attributes;
            previousManagerId = staffData?.ManagerID;
        }

        const updateAttrs = { OBJECTID: parseInt(objectId) };
        if (firstName !== undefined) updateAttrs.FirstName = firstName;
        if (lastName !== undefined) updateAttrs.LastName = lastName;
        if (email !== undefined) updateAttrs.Email = email;
        if (role !== undefined) updateAttrs.Role = role;
        if (department !== undefined) updateAttrs.Department = department;
        if (managerId !== undefined) updateAttrs.ManagerID = managerId;
        if (isActive !== undefined) updateAttrs.IsActive = isActive ? 1 : 0;
        if (username !== undefined) updateAttrs.Username = username;
        
        // Don't include StartDate in main update (may not exist in schema)
        // It will be attempted separately below

        const result = await updateFeatures({
            url: EMPLOYEES_URL,
            features: [{ attributes: updateAttrs }],
            authentication
        });

        if (result.updateResults?.[0]?.success) {
            // Try to save StartDate separately (field may not exist in ArcGIS schema)
            let startDateWarning = null;
            if (startDate !== undefined) {
                try {
                    const sdResult = await updateFeatures({
                        url: EMPLOYEES_URL,
                        features: [{ attributes: {
                            OBJECTID: parseInt(objectId),
                            StartDate: startDate ? new Date(startDate).toISOString().split('T')[0] : null
                        }}],
                        authentication
                    });
                    if (!sdResult.updateResults?.[0]?.success) {
                        startDateWarning = 'StartDate field may not exist in the database. Other changes were saved.';
                        console.warn('[admin] StartDate save failed:', sdResult.updateResults?.[0]?.error);
                    }
                } catch (sdErr) {
                    startDateWarning = 'StartDate field may not exist in the database. Other changes were saved.';
                    console.warn('[admin] StartDate save error:', sdErr.message);
                }
            }
            
            // Send manager assignment notification if manager changed
            if (managerId !== undefined && managerId !== previousManagerId && managerId) {
                (async () => {
                    try {
                        // Get new manager's details
                        const managerQuery = await queryFeatures({
                            url: EMPLOYEES_URL,
                            where: `EmployeeID = '${managerId}'`,
                            outFields: 'FirstName,LastName,Email',
                            returnGeometry: false,
                            authentication
                        });
                        const newManager = managerQuery.features?.[0]?.attributes;
                        
                        // Get previous manager name (if exists)
                        let previousManagerName = 'Unassigned';
                        if (previousManagerId) {
                            const prevQuery = await queryFeatures({
                                url: EMPLOYEES_URL,
                                where: `EmployeeID = '${previousManagerId}'`,
                                outFields: 'FirstName,LastName',
                                returnGeometry: false,
                                authentication
                            });
                            const prevMgr = prevQuery.features?.[0]?.attributes;
                            if (prevMgr) {
                                previousManagerName = `${prevMgr.FirstName} ${prevMgr.LastName}`;
                            }
                        }
                        
                        if (newManager && staffData) {
                            await notifyManagerAssignment({
                                staffFirstName: firstName || staffData.FirstName,
                                staffLastName: lastName || staffData.LastName,
                                staffEmail: email || staffData.Email,
                                managerFirstName: newManager.FirstName,
                                managerLastName: newManager.LastName,
                                managerEmail: newManager.Email,
                                previousManager: previousManagerName
                            });
                            console.log('📧 Manager assignment notification sent');
                        }
                    } catch (err) {
                        console.error('Manager assignment notification failed:', err);
                    }
                })();
            }
            
            res.json({ success: true, message: 'User updated successfully', warning: startDateWarning || undefined });
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

        const passwordError = validateStrongPassword(newPassword);
        if (passwordError) {
            return res.status(400).json({ error: passwordError });
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

        // Use direct applyEdits to avoid updateFeatures field alias validation issues
        // Use batch applyEdits on FeatureServer root to avoid layer-level issues
        // Layer ID is 0 for Employees
        const response = await request(`${process.env.LEAVE_TRACKER_SERVICE_URL}/applyEdits`, {
            params: {
                edits: JSON.stringify([{
                    id: 0,
                    updates: [{
                        attributes: {
                            OBJECTID: parseInt(objectId),
                            IsActive: 0
                        }
                    }]
                }]),
                f: 'json'
            },
            authentication,
            httpMethod: 'POST'
        });

        console.log('Deactivation result for OBJECTID', objectId, ':', JSON.stringify(response, null, 2));
        
        // Batch applyEdits returns array of layer results
        // Find result for layer 0 (Employees)
        const layerResult = Array.isArray(response) ? response.find(r => r.id === 0) : response;
        const success = layerResult?.updateResults?.[0]?.success;

        if (success) {
            res.json({ success: true, message: 'User deactivated successfully' });
        } else {
            console.error('Deactivation failed. Full result:', JSON.stringify(response, null, 2));
            throw new Error('Failed to delete user');
        }
    } catch (error) {
        console.error('Error deleting user:', error);
        res.status(500).json({ error: error.message || 'Failed to delete user' });
    }
});

// Permanently delete user (hard delete - removes record entirely)
app.delete('/api/admin/users/:objectId/permanent', async (req, res) => {
    try {
        const { objectId } = req.params;
        const authentication = getSession();

        // Permanently delete the feature using request directly to avoid client-side validation issues
        // deleteFeatures() was failing with "Change the alias to a valid name"
        const response = await request(`${EMPLOYEES_URL}/applyEdits`, {
            params: {
                deletes: [parseInt(objectId)],
                f: 'json'
            },
            authentication,
            httpMethod: 'POST'
        });

        if (response.deleteResults?.[0]?.success) {
            res.json({ success: true, message: 'User permanently deleted' });
        } else {
            console.error('Permanent Delete Failed:', JSON.stringify(response, null, 2));
            throw new Error('Failed to permanently delete user');
        }
    } catch (error) {
        console.error('Error permanently deleting user:', error);
        res.status(500).json({ error: error.message || 'Failed to permanently delete user' });
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

// Get employee cycle status, days worked, and accumulated days
app.get('/api/employees/:employeeId/cycle-status', async (req, res) => {
    try {
        const { employeeId } = req.params;
        console.log(`[cycle-status] Fetching for employee: ${employeeId}`);
        const authentication = getSession();

        // 1. Get Employee Details
        const employeeResponse = await queryFeatures({
            url: EMPLOYEES_URL,
            where: `EmployeeID = '${employeeId}'`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        if (!employeeResponse.features || employeeResponse.features.length === 0) {
            return res.status(404).json({ error: 'Employee not found' });
        }

        // 2. Get ALL approved leaves (future and past)
        const leavesResponse = await queryFeatures({
            url: LEAVE_REQUESTS_URL,
            where: `EmployeeID = '${employeeId}' AND Status = 'approved'`,
            outFields: '*',
            returnGeometry: false,
            authentication
        });
        
        const approvedLeaves = leavesResponse.features ? leavesResponse.features.map(f => ({
            startDate: new Date(f.attributes.StartDate),
            endDate: new Date(f.attributes.EndDate),
            leaveType: (f.attributes.LeaveType || 'Annual').toLowerCase()
        })) : [];

        // Sort leaves by start date
        approvedLeaves.sort((a, b) => a.startDate - b.startDate);
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        // Determine start of calculation period
        // Default: Jan 1st of current year (Annual Cycle)
        let calculationStart = new Date(today.getFullYear(), 0, 1);
        
        // If employee has a StartDate in the current year that is AFTER Jan 1st, use that.
        const empStartDate = employeeResponse.features[0].attributes.StartDate ? 
            new Date(employeeResponse.features[0].attributes.StartDate) : null;
            
        if (empStartDate) {
            empStartDate.setHours(0,0,0,0);
            if (empStartDate > calculationStart) {
                calculationStart = new Date(empStartDate);
            }
        }

        // 3. Build leave map for all dates (for projection + counting)
        const leaveMap = new Map();
        approvedLeaves.forEach(leave => {
            const start = new Date(leave.startDate);
            const end = new Date(leave.endDate);
            for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                leaveMap.set(d.toISOString().split('T')[0], leave.leaveType);
            }
        });

        // 4. Count work days from calculation start to today (excluding leave days)
        //    This is used for the 22/8 cycle calculation
        let totalWorkDaysSinceYearStart = 0;
        for (let d = new Date(calculationStart); d <= today; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            if (!leaveMap.has(dateKey)) {
                totalWorkDaysSinceYearStart++;
            }
        }

        // 5. Calculate off-days accumulated based on 22-on/8-off cycle
        //    For every 22 work days, employee earns 8 off-days
        const OFF_DAYS_PER_CYCLE = 8;
        const WORK_DAYS_PER_CYCLE = 22;
        const accumulationRate = OFF_DAYS_PER_CYCLE / WORK_DAYS_PER_CYCLE; // ~0.3636
        
        // Total off-days earned so far
        const totalOffDaysEarned = Math.floor(totalWorkDaysSinceYearStart * accumulationRate);
        
        // Subtract off-days already taken (approved leave days that have passed)
        let offDaysTaken = 0;
        for (let d = new Date(calculationStart); d <= today; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            if (leaveMap.has(dateKey)) {
                offDaysTaken++;
            }
        }
        
        const daysAccumulated = Math.max(0, totalOffDaysEarned - offDaysTaken);

        // 6. Determine current status
        let currentStatus = {
            isWorkDay: true,
            daysRemaining: 0,
            phase: 'work',
            daysWorked: 0,
            daysAccumulated: daysAccumulated
        };

        // -- Active leave check --
        const activeLeave = approvedLeaves.find(leave => {
            const start = new Date(leave.startDate); start.setHours(0,0,0,0);
            const end = new Date(leave.endDate); end.setHours(0,0,0,0);
            return today >= start && today <= end;
        });
        
        if (activeLeave) {
            currentStatus.isWorkDay = false;
            currentStatus.phase = 'off';
            currentStatus.daysWorked = 0;
            
            const end = new Date(activeLeave.endDate); end.setHours(0,0,0,0);
            const diffTime = Math.abs(end - today);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
            currentStatus.daysRemaining = diffDays;
        } else {
            currentStatus.isWorkDay = true;
            currentStatus.phase = 'work';
            
            // Next Leave
            const nextLeave = approvedLeaves.find(leave => {
                const start = new Date(leave.startDate); start.setHours(0,0,0,0);
                return start > today;
            });
            
            if (nextLeave) {
                const start = new Date(nextLeave.startDate); start.setHours(0,0,0,0);
                const diffTime = Math.abs(start - today);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                currentStatus.daysRemaining = diffDays;
            } else {
                currentStatus.daysRemaining = 0;
            }
            
            // Days Worked (since last leave ended or start of year)
            const pastLeaves = approvedLeaves.filter(leave => {
                const end = new Date(leave.endDate); end.setHours(0,0,0,0);
                return end < today;
            });
            
            let lastEndDate = new Date(calculationStart);
            if (pastLeaves.length > 0) {
                const lastLeave = pastLeaves[pastLeaves.length - 1];
                lastEndDate = new Date(lastLeave.endDate);
            }
            
            const timeSince = today - lastEndDate; 
            const daysSince = Math.floor(timeSince / (1000 * 60 * 60 * 24));
            currentStatus.daysWorked = Math.max(0, daysSince);
        }

        // 7. Projection — from Jan 1 of current year to end of year (includes history)
        const projection = [];
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const nextYear = new Date(today.getFullYear() + 1, 0, 1);
        
        for (let d = new Date(startOfYear); d < nextYear; d.setDate(d.getDate() + 1)) {
            const dateKey = d.toISOString().split('T')[0];
            const isPast = d < today;
            
            if (leaveMap.has(dateKey)) {
                projection.push({
                    date: dateKey,
                    type: 'leave',
                    leaveType: leaveMap.get(dateKey),
                    isProjected: !isPast
                });
            } else {
                projection.push({
                    date: dateKey,
                    type: 'work',
                    isProjected: !isPast
                });
            }
        }

        res.json({
            status: currentStatus,
            projection
        });

    } catch (error) {
        console.error('[cycle-status] Error calculating cycle status:', error.message);
        console.error('[cycle-status] Stack:', error.stack);
        res.status(500).json({ error: 'Failed to calculate cycle status', details: error.message });
    }
});


// JSON 404 handler for API routes
app.use('/api', (req, res) => {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.originalUrl}` });
});

// ==================== DEPLOYMENT (Serve Client) ====================

// System Refresh: Resets the global ArcGIS session to force re-authentication
app.post('/api/system/refresh', (req, res) => {
    console.log('🔄 System Refresh requested: Resetting ArcGIS session');
    session = null;
    res.json({ success: true, message: 'ArcGIS session reset successfully' });
});

// Serve static files from the client build directory
app.use(express.static(path.join(__dirname, '../client/dist')));

// Handle React routing, return all requests to React app
app.get(/.*/, (req, res) => {
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
