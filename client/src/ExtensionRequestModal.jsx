import React, { useState } from 'react';
import './Modal.css';

function ExtensionRequestModal({ leave, onClose, onSubmit }) {
    const [newEndDate, setNewEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const calculateAdditionalDays = () => {
        if (!newEndDate) return 0;
        const originalEnd = new Date(leave.EndDate);
        const requestedEnd = new Date(newEndDate);
        const diffTime = requestedEnd - originalEnd;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return Math.max(0, diffDays);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate reason (min 3 words)
        const wordCount = reason.trim().split(/\s+/).length;
        if (wordCount < 3) {
            setError('Reason must be at least 3 words');
            return;
        }

        // Validate date is after original end date
        const additionalDays = calculateAdditionalDays();
        if (additionalDays <= 0) {
            setError('New end date must be after original end date');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onSubmit({
                newEndDate: newEndDate,
                reason: reason
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to submit extension request');
        } finally {
            setLoading(false);
        }
    };

    const additionalDays = calculateAdditionalDays();

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Request Leave Extension</h2>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <form onSubmit={handleSubmit} className="modal-form">
                    <div className="form-group">
                        <label>Original End Date</label>
                        <input 
                            type="text" 
                            value={new Date(leave.EndDate).toLocaleDateString()} 
                            disabled 
                            className="form-control-readonly"
                        />
                    </div>

                    <div className="form-group">
                        <label>Requested New End Date*</label>
                        <input 
                            type="date" 
                            value={newEndDate}
                            onChange={(e) => setNewEndDate(e.target.value)}
                            min={new Date(leave.EndDate).toISOString().split('T')[0]}
                            required
                            className="form-control"
                        />
                    </div>

                    {additionalDays > 0 && (
                        <div className="info-box">
                            <strong>Additional Days:</strong> {additionalDays} day(s)
                        </div>
                    )}

                    <div className="form-group">
                        <label>Reason for Extension* (min 3 words)</label>
                        <textarea 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Unexpected circumstances require additional time"
                            rows="3"
                            required
                            className="form-control"
                        />
                        <small>{reason.trim().split(/\s+/).filter(w => w).length} words</small>
                    </div>

                    {error && <div className="error-message">{error}</div>}

                    <div className="modal-actions">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="btn-secondary"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="btn-primary"
                            disabled={loading}
                        >
                            {loading ? 'Submitting...' : 'Request Extension'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default ExtensionRequestModal;
