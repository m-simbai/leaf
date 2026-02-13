/**
 * Webhook Service for Power Automate Integration
 * 
 * Sends HTTP requests to Power Automate flows when leave events occur.
 * Configure the webhook URLs in .env file.
 */

const fetch = require('node-fetch');

// Webhook URLs from environment
const WEBHOOK_NEW_REQUEST = process.env.WEBHOOK_NEW_REQUEST;
const WEBHOOK_APPROVED = process.env.WEBHOOK_APPROVED;
const WEBHOOK_REJECTED = process.env.WEBHOOK_REJECTED;
const WEBHOOK_EARLY_CHECKIN = process.env.WEBHOOK_EARLY_CHECKIN;
const WEBHOOK_EXTENSION_REQUEST = process.env.WEBHOOK_EXTENSION_REQUEST;
const WEBHOOK_EXTENSION_APPROVED = process.env.WEBHOOK_EXTENSION_APPROVED;
const WEBHOOK_EXTENSION_REJECTED = process.env.WEBHOOK_EXTENSION_REJECTED;
const WEBHOOK_MANAGER_EXTENSION = process.env.WEBHOOK_MANAGER_EXTENSION;
const WEBHOOK_PASSWORD_RESET = process.env.WEBHOOK_PASSWORD_RESET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'p.tagwireyi@cheworeconservation.org';

/**
 * Send webhook notification to Power Automate
 */
async function sendWebhook(url, data) {
    if (!url || url.includes('your-power-automate-url')) {
        console.log('⚠️ Webhook not configured, skipping notification:', data);
        return { success: false, reason: 'Webhook URL not configured' };
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });

        if (response.ok) {
            console.log('✅ Webhook sent successfully');
            return { success: true };
        } else {
            const errorText = await response.text();
            console.error('❌ Webhook failed:', response.status, response.statusText);
            console.error('📄 Response body:', errorText);
            return { success: false, reason: `HTTP ${response.status}: ${errorText}` };
        }
    } catch (error) {
        console.error('❌ Webhook error:', error.message);
        return { success: false, reason: error.message };
    }
}

/**
 * Notify manager of new leave request
 */
async function notifyNewRequest(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail || '',
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: requestDetails.daysRequested,
        reason: requestDetails.reason || 'No reason provided'
    };

    console.log(`📧 Sending new request notification to manager: ${data.managerEmail}`);
    return sendWebhook(WEBHOOK_NEW_REQUEST, data);
}

/**
 * Notify staff that request was approved
 */
async function notifyApproved(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: parseInt(requestDetails.daysRequested) || 1,
        reason: requestDetails.reason || 'No reason provided',
        rejectionReason: '' // Empty for approvals but required by schema
    };

    console.log(`📧 Sending approval notification to: ${requestDetails.employeeEmail} (from ${data.managerEmail})`);
    console.log(`📦 Webhook Payload: ${JSON.stringify(data, null, 2)}`);
    return sendWebhook(WEBHOOK_APPROVED, data);
}

/**
 * Notify staff that request was rejected
 */
async function notifyRejected(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: parseInt(requestDetails.daysRequested) || 1,
        reason: requestDetails.reason || 'No reason provided',
        rejectionReason: requestDetails.rejectionReason || 'No reason provided'
    };

    console.log(`📧 Sending rejection notification to: ${requestDetails.employeeEmail} (from ${data.managerEmail})`);
    console.log(`📦 Webhook Payload: ${JSON.stringify(data, null, 2)}`);
    return sendWebhook(WEBHOOK_REJECTED, data);
}

/**
 * Notify manager of early check-in
 */
async function notifyEarlyCheckin(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        actualEndDate: requestDetails.actualEndDate,
        daysRefunded: requestDetails.daysRefunded,
        reason: requestDetails.reason
    };

    console.log(`📧 Sending early check-in notification to manager: ${data.managerEmail}`);
    return sendWebhook(WEBHOOK_EARLY_CHECKIN, data);
}

/**
 * Notify manager of extension request
 */
async function notifyExtensionRequest(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        requestedEndDate: requestDetails.requestedEndDate,
        additionalDays: requestDetails.additionalDays,
        reason: requestDetails.reason
    };

    console.log(`📧 Sending extension request notification to manager: ${data.managerEmail}`);
    return sendWebhook(WEBHOOK_EXTENSION_REQUEST, data);
}

/**
 * Notify staff that extension was approved
 */
async function notifyExtensionApproved(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL, // Added managerEmail
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        newEndDate: requestDetails.newEndDate,
        additionalDays: requestDetails.additionalDays
    };

    console.log(`📧 Sending extension approval notification to: ${requestDetails.employeeEmail} (from ${data.managerEmail})`);
    return sendWebhook(WEBHOOK_EXTENSION_APPROVED, data);
}

/**
 * Notify staff that extension was rejected
 */
async function notifyExtensionRejected(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL, // Added managerEmail
        leaveType: requestDetails.leaveType,
        requestedEndDate: requestDetails.requestedEndDate,
        rejectionReason: requestDetails.rejectionReason
    };

    console.log(`📧 Sending extension rejection notification to: ${requestDetails.employeeEmail} (from ${data.managerEmail})`);
    return sendWebhook(WEBHOOK_EXTENSION_REJECTED, data);
}

/**
 * Notify staff of manager-initiated extension
 */
async function notifyManagerExtension(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: requestDetails.managerEmail || ADMIN_EMAIL, // Added managerEmail
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        newEndDate: requestDetails.newEndDate,
        additionalDays: requestDetails.additionalDays,
        reason: requestDetails.reason
    };

    console.log(`📧 Sending manager extension notification to: ${requestDetails.employeeEmail} (from ${data.managerEmail})`);
    return sendWebhook(WEBHOOK_MANAGER_EXTENSION, data);
}

/**
 * Notify admin of password reset request (legacy - notification only)
 */
async function notifyPasswordReset(requestDetails) {
    const data = {
        username: requestDetails.username,
        employeeEmail: requestDetails.employeeEmail,
        adminEmail: ADMIN_EMAIL,
        message: `Password reset requested for user: ${requestDetails.username}`
    };

    console.log('📧 Sending password reset notification for:', requestDetails.username);
    return sendWebhook(WEBHOOK_PASSWORD_RESET, data);
}

// ==================== NEW WEBHOOKS ====================

const WEBHOOK_ACCOUNT_CREATED = process.env.WEBHOOK_ACCOUNT_CREATED;
const WEBHOOK_PASSWORD_SETUP_LINK = process.env.WEBHOOK_PASSWORD_SETUP_LINK;
const WEBHOOK_MANAGER_ASSIGNMENT = process.env.WEBHOOK_MANAGER_ASSIGNMENT;
const WEBHOOK_PASSWORD_RESET_LINK = process.env.WEBHOOK_PASSWORD_RESET_LINK;

/**
 * Notify new user that their account was created
 */
async function notifyAccountCreated(userDetails) {
    const data = {
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        username: userDetails.username,
        role: userDetails.role,
        department: userDetails.department || 'Not assigned',
        adminEmail: ADMIN_EMAIL,
        message: `Welcome to the Leave Tracker! Your account has been created.`
    };

    console.log('📧 Sending account created notification to:', userDetails.email);
    return sendWebhook(WEBHOOK_ACCOUNT_CREATED, data);
}

/**
 * Helper to create consistent HTML buttons
 */
function createButton(text, url, color = '#697559') {
    return `<a href="${url}" style="background-color: ${color}; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold; font-family: Arial, sans-serif;">${text}</a>`;
}

// ... existing code ...

/**
 * Send one-time password setup link to new user
 */
async function notifyPasswordSetupLink(userDetails) {
    const setupUrl = userDetails.setupLink;
    const buttonHtml = createButton('Set Password', setupUrl);

    const data = {
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        username: userDetails.username,
        setupLink: buttonHtml,
        setupUrl: setupUrl, // Fallback raw URL
        expiresIn: '24 hours',
        adminEmail: ADMIN_EMAIL,
        message: `Please click the button below to set your password for the Leave Tracker account.`
    };

    console.log('📧 Sending password setup link to:', userDetails.email);
    return sendWebhook(WEBHOOK_PASSWORD_SETUP_LINK, data);
}

/**
 * Notify manager that a staff member has been assigned to them
 */
async function notifyManagerAssignment(details) {
    const data = {
        staffFirstName: details.staffFirstName,
        staffLastName: details.staffLastName,
        staffEmail: details.staffEmail,
        staffRole: details.staffRole,
        staffDepartment: details.staffDepartment || 'Not assigned',
        managerFirstName: details.managerFirstName,
        managerLastName: details.managerLastName,
        managerEmail: details.managerEmail,
        adminEmail: ADMIN_EMAIL,
        message: `You have been assigned as the manager for ${details.staffFirstName} ${details.staffLastName}.`
    };

    console.log('📧 Sending manager assignment notification to:', details.managerEmail);
    return sendWebhook(WEBHOOK_MANAGER_ASSIGNMENT, data);
}

/**
 * Send password reset link to user (secure token-based)
 */
async function notifyPasswordResetLink(userDetails) {
    const resetUrl = userDetails.resetLink;
    const buttonHtml = createButton('Reset Password', resetUrl);

    const data = {
        firstName: userDetails.firstName,
        lastName: userDetails.lastName,
        email: userDetails.email,
        username: userDetails.username,
        resetLink: buttonHtml,
        resetUrl: resetUrl, // Fallback raw URL
        expiresIn: '1 hour',
        adminEmail: ADMIN_EMAIL,
        message: `Click the button below to reset your password.`
    };

    console.log('📧 Sending password reset link to:', userDetails.email);
    return sendWebhook(WEBHOOK_PASSWORD_RESET_LINK, data);
}

// ... existing code ...

/**
 * Send assignment request to new manager for approval
 */
async function notifyAssignmentRequest(details) {
    const approveBtn = createButton('Approve Assignment', details.approveLink);
    const rejectBtn = createButton('Reject Assignment', details.rejectLink, '#d9534f'); // Keep red for reject? Or user said ALL buttons #697559? User said "all buttons #697559". I'll stick to that for consistency if requested, but reject usually wants a different color. "make sure the weebhook links are all buttons #697559". I will make them ALL #697559 to be safe and strictly follow instructions.
    
    // Actually, visually distinguishing reject is better, but strictly following "all buttons #697559" might be what they want for branding.
    // Let's use #697559 for Approve and maybe a slightly different shade or same for Reject if I must. 
    // "make sure the weebhook links are all buttons #697559".
    // I'll interpret "all buttons" as the primary action buttons. 
    // But for "Approve" vs "Reject", using the same color might be confusing. 
    // However, the user request is specific about the color.
    // I will use #697559 for both to be safe.
    
    const data = {
        staffFirstName: details.staffFirstName,
        staffLastName: details.staffLastName,
        staffEmail: details.staffEmail,
        staffRole: details.staffRole,
        staffDepartment: details.staffDepartment || 'Not assigned',
        managerFirstName: details.managerFirstName,
        managerLastName: details.managerLastName,
        managerEmail: details.managerEmail,
        previousManager: details.previousManager || 'None',
        approveLink: approveBtn, // Sending HTML button instead of raw link
        rejectLink: createButton('Reject Assignment', details.rejectLink, '#697559'), // Using same color as requested
        approveUrl: details.approveLink, // Fallback
        rejectUrl: details.rejectLink,   // Fallback
        expiresIn: '48 hours',
        adminEmail: ADMIN_EMAIL,
        message: `You have been requested to manage ${details.staffFirstName} ${details.staffLastName}. Please approve or reject this assignment.`
    };

    console.log('📧 Sending assignment request to manager:', details.managerEmail);
    return sendWebhook(WEBHOOK_ASSIGNMENT_REQUEST, data);
}

/**
 * Notify staff and admin that assignment was approved
 */
async function notifyAssignmentApproved(details) {
    const data = {
        staffFirstName: details.staffFirstName,
        staffLastName: details.staffLastName,
        staffEmail: details.staffEmail,
        managerFirstName: details.managerFirstName,
        managerLastName: details.managerLastName,
        managerEmail: details.managerEmail,
        adminEmail: ADMIN_EMAIL,
        message: `${details.managerFirstName} ${details.managerLastName} has approved the assignment of ${details.staffFirstName} ${details.staffLastName}.`
    };

    console.log('📧 Sending assignment approved notification');
    return sendWebhook(WEBHOOK_ASSIGNMENT_APPROVED, data);
}

/**
 * Notify staff and admin that assignment was rejected
 */
async function notifyAssignmentRejected(details) {
    const data = {
        staffFirstName: details.staffFirstName,
        staffLastName: details.staffLastName,
        staffEmail: details.staffEmail,
        managerFirstName: details.managerFirstName,
        managerLastName: details.managerLastName,
        managerEmail: details.managerEmail,
        rejectionReason: details.rejectionReason || 'No reason provided',
        adminEmail: ADMIN_EMAIL,
        message: `${details.managerFirstName} ${details.managerLastName} has declined the assignment of ${details.staffFirstName} ${details.staffLastName}.`
    };

    console.log('📧 Sending assignment rejected notification');
    return sendWebhook(WEBHOOK_ASSIGNMENT_REJECTED, data);
}

/**
 * Notify previous manager that their staff is being reassigned
 */
async function notifyPreviousManagerReassignment(details) {
    const data = {
        staffFirstName: details.staffFirstName,
        staffLastName: details.staffLastName,
        previousManagerFirstName: details.previousManagerFirstName,
        previousManagerLastName: details.previousManagerLastName,
        previousManagerEmail: details.previousManagerEmail,
        newManagerFirstName: details.newManagerFirstName,
        newManagerLastName: details.newManagerLastName,
        adminEmail: ADMIN_EMAIL,
        message: `${details.staffFirstName} ${details.staffLastName} is being reassigned to ${details.newManagerFirstName} ${details.newManagerLastName}.`
    };

    console.log('📧 Notifying previous manager of reassignment:', details.previousManagerEmail);
    // Reuse manager assignment webhook for this
    return sendWebhook(WEBHOOK_MANAGER_ASSIGNMENT, data);
}

module.exports = {
    notifyNewRequest,
    notifyApproved,
    notifyRejected,
    notifyEarlyCheckin,
    notifyExtensionRequest,
    notifyExtensionApproved,
    notifyExtensionRejected,
    notifyManagerExtension,
    notifyPasswordReset,
    // Account & Password webhooks
    notifyAccountCreated,
    notifyPasswordSetupLink,
    notifyManagerAssignment,
    notifyPasswordResetLink,
    // Assignment approval webhooks
    notifyAssignmentRequest,
    notifyAssignmentApproved,
    notifyAssignmentRejected,
    notifyPreviousManagerReassignment
};
