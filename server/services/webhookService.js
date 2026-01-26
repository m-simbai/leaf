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
            console.error('❌ Webhook failed:', response.status, response.statusText);
            return { success: false, reason: `HTTP ${response.status}` };
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
        managerEmail: ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: requestDetails.daysRequested,
        reason: requestDetails.reason || 'No reason provided'
    };

    console.log('📧 Sending new request notification to manager:', ADMIN_EMAIL);
    return sendWebhook(WEBHOOK_NEW_REQUEST, data);
}

/**
 * Notify staff that request was approved
 */
async function notifyApproved(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: requestDetails.daysRequested,
        status: 'approved'
    };

    console.log('📧 Sending approval notification to:', requestDetails.employeeEmail);
    return sendWebhook(WEBHOOK_APPROVED, data);
}

/**
 * Notify staff that request was rejected
 */
async function notifyRejected(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        startDate: requestDetails.startDate,
        endDate: requestDetails.endDate,
        daysRequested: requestDetails.daysRequested,
        status: 'rejected',
        rejectionReason: requestDetails.rejectionReason || 'No reason provided'
    };

    console.log('📧 Sending rejection notification to:', requestDetails.employeeEmail);
    return sendWebhook(WEBHOOK_REJECTED, data);
}

/**
 * Notify manager of early check-in
 */
async function notifyEarlyCheckin(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        actualEndDate: requestDetails.actualEndDate,
        daysRefunded: requestDetails.daysRefunded,
        reason: requestDetails.reason
    };

    console.log('📧 Sending early check-in notification to manager:', ADMIN_EMAIL);
    return sendWebhook(WEBHOOK_EARLY_CHECKIN, data);
}

/**
 * Notify manager of extension request
 */
async function notifyExtensionRequest(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        managerEmail: ADMIN_EMAIL,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        requestedEndDate: requestDetails.requestedEndDate,
        additionalDays: requestDetails.additionalDays,
        reason: requestDetails.reason
    };

    console.log('📧 Sending extension request notification to manager:', ADMIN_EMAIL);
    return sendWebhook(WEBHOOK_EXTENSION_REQUEST, data);
}

/**
 * Notify staff that extension was approved
 */
async function notifyExtensionApproved(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        newEndDate: requestDetails.newEndDate,
        additionalDays: requestDetails.additionalDays
    };

    console.log('📧 Sending extension approval notification to:', requestDetails.employeeEmail);
    return sendWebhook(WEBHOOK_EXTENSION_APPROVED, data);
}

/**
 * Notify staff that extension was rejected
 */
async function notifyExtensionRejected(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        leaveType: requestDetails.leaveType,
        requestedEndDate: requestDetails.requestedEndDate,
        rejectionReason: requestDetails.rejectionReason
    };

    console.log('📧 Sending extension rejection notification to:', requestDetails.employeeEmail);
    return sendWebhook(WEBHOOK_EXTENSION_REJECTED, data);
}

/**
 * Notify staff of manager-initiated extension
 */
async function notifyManagerExtension(requestDetails) {
    const data = {
        employeeName: requestDetails.employeeName,
        employeeEmail: requestDetails.employeeEmail,
        leaveType: requestDetails.leaveType,
        originalEndDate: requestDetails.originalEndDate,
        newEndDate: requestDetails.newEndDate,
        additionalDays: requestDetails.additionalDays,
        reason: requestDetails.reason
    };

    console.log('📧 Sending manager extension notification to:', requestDetails.employeeEmail);
    return sendWebhook(WEBHOOK_MANAGER_EXTENSION, data);
}

module.exports = {
    notifyNewRequest,
    notifyApproved,
    notifyRejected,
    notifyEarlyCheckin,
    notifyExtensionRequest,
    notifyExtensionApproved,
    notifyExtensionRejected,
    notifyManagerExtension
};
