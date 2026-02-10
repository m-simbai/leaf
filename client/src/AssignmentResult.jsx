import { useSearchParams, useNavigate } from 'react-router-dom'
import { CheckCircle, XCircle, AlertCircle, Clock, Home } from 'lucide-react'
import './SetupPassword.css'

export default function AssignmentResult() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  
  const status = searchParams.get('status') || 'unknown'
  const staffName = searchParams.get('staff') || ''
  
  const statusConfig = {
    approved: {
      icon: <CheckCircle size={64} className="success-icon" />,
      title: 'Assignment Approved!',
      message: staffName 
        ? `You have approved ${staffName} to join your team.`
        : 'The assignment has been approved successfully.',
      showHome: true,
      containerClass: 'success'
    },
    rejected: {
      icon: <XCircle size={64} className="error-icon" />,
      title: 'Assignment Declined',
      message: staffName 
        ? `You have declined to manage ${staffName}.`
        : 'The assignment has been declined.',
      showHome: true,
      containerClass: 'error'
    },
    expired: {
      icon: <Clock size={64} style={{ color: '#f59e0b' }} />,
      title: 'Link Expired',
      message: 'This assignment link has expired. Please contact the administrator.',
      showHome: true,
      containerClass: ''
    },
    invalid: {
      icon: <AlertCircle size={64} className="error-icon" />,
      title: 'Invalid Link',
      message: 'This assignment link is invalid or has already been processed.',
      showHome: true,
      containerClass: 'error'
    },
    error: {
      icon: <AlertCircle size={64} className="error-icon" />,
      title: 'Something Went Wrong',
      message: 'An error occurred while processing your request. Please try again.',
      showHome: true,
      containerClass: 'error'
    },
    unknown: {
      icon: <AlertCircle size={64} className="error-icon" />,
      title: 'Unknown Status',
      message: 'Unable to determine the result of this action.',
      showHome: true,
      containerClass: ''
    }
  }
  
  const config = statusConfig[status] || statusConfig.unknown
  
  return (
    <div className="setup-password-page">
      <div className={`setup-password-container ${config.containerClass}`}>
        {config.icon}
        <h1>{config.title}</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', marginTop: '12px' }}>{config.message}</p>
        
        {config.showHome && (
          <button 
            onClick={() => navigate('/')} 
            className="btn-primary"
            style={{ marginTop: '24px' }}
          >
            <Home size={18} />
            Go to Home
          </button>
        )}
      </div>
    </div>
  )
}
