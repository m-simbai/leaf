import React, { useState } from 'react';
import './Modal.css';

function EarlyCheckinModal({ leave, onClose, onSubmit }) {
    const [actualEndDate, setActualEndDate] = useState('');
    const [reason, setReason] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate reason (min 3 words)
        const wordCount = reason.trim().split(/\s+/).length;
        if (wordCount < 3) {
            setError('Reason must be at least 3 words');
            return;
        }

        // Validate date is before original end date
        const actualEnd = new Date(actualEndDate);
        const originalEnd = new Date(leave.EndDate);
        
        if (actualEnd >= originalEnd) {
            setError('Return date must be before original end date');
            return;
        }

        setLoading(true);
        setError('');

        try {
            await onSubmit({
                actualEndDate: actualEndDate,
                reason: reason
            });
            onClose();
        } catch (err) {
            setError(err.message || 'Failed to submit early check-in');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Early Check-In</h2>
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
                        <label>Actual Return Date*</label>
                        <input 
                            type="date" 
                            value={actualEndDate}
                            onChange={(e) => setActualEndDate(e.target.value)}
                            max={new Date(leave.EndDate).toISOString().split('T')[0]}
                            required
                            className="form-control"
                        />
                    </div>

                    <div className="form-group">
                        <label>Reason for Early Return* (min 3 words)</label>
                        <textarea 
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="e.g., Issue resolved earlier than expected"
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
                            {loading ? 'Submitting...' : 'Submit Check-In'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default EarlyCheckinModal;
