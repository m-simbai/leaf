import { useState, useEffect } from 'react'
import { PlusCircle, RefreshCw, LogOut, UserCog, Users, Calendar as CalendarIcon, LayoutDashboard, Settings, Inbox as InboxIcon, FileText, PenSquare, Shield, ArrowLeftRight } from 'lucide-react'
import Calendar from './Calendar'
import TeamView from './TeamView'
import Inbox from './Inbox'
import MyLeaves from './MyLeaves'
import LeaveRequest from './LeaveRequest'
import AdminDashboard from './AdminDashboard'
import DelegationManager from './DelegationManager'
import PasswordPromptModal from './PasswordPromptModal'
import './Dashboard.css'

function Dashboard({ user, onLogout }) {
  const [leaves, setLeaves] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // Portal mode for managers: 'manage' (default) or 'request'
  const [portalMode, setPortalMode] = useState('manage')
  const [showPasswordPrompt, setShowPasswordPrompt] = useState(false)
  
  const handlePortalSwitch = (mode) => {
    if (mode === 'manage' && portalMode === 'request') {
      setShowPasswordPrompt(true)
    } else {
      setPortalMode(mode)
    }
  }

  const [activeTab, setActiveTab] = useState(
    user?.role?.toLowerCase() === 'admin' ? 'users' : 
    user?.role?.toLowerCase() === 'director' ? 'inbox' :
    user?.role?.toLowerCase() === 'manager' ? 'calendar' : 'myleaves'
  )

  const API_URL = '/api/leaves';
  const SURVEY_URL = 'https://arcg.is/0uvKS8'; 

  const fetchLeaves = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(API_URL);
      if (!response.ok) throw new Error('Failed to fetch data');
      const data = await response.json();
      setLeaves(data.features || []); 
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLeaves();
  }, []);

  const handleNewRequest = () => {
    setActiveTab('request')
  };

  // Tab configuration - different for staff vs manager vs director vs admin
  const isManager = user?.role?.toLowerCase() === 'manager'
  const isDirector = user?.role?.toLowerCase() === 'director'
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const canManage = isManager || isDirector // Can approve leaves

  // Staff tabs
  const staffTabs = [
    { id: 'myleaves', label: 'My Leaves', icon: FileText },
    { id: 'request', label: 'Request', icon: PenSquare },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
  ]

  // Manager main tabs
  const managerMainTabs = [
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'team', label: 'Team', icon: Users },
  ]

  // Manager-only tabs (shown at bottom with separator)
  const managerBottomTabs = [
    { id: 'inbox', label: 'Inbox', icon: InboxIcon, count: leaves.filter(l => l.attributes.Status === 'pending').length },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  // Director tabs (can only manage, not request)
  const directorTabs = [
    { id: 'inbox', label: 'Inbox', icon: InboxIcon, count: leaves.filter(l => l.attributes.Status === 'pending').length },
    { id: 'calendar', label: 'Calendar', icon: CalendarIcon },
    { id: 'team', label: 'Team', icon: Users },
  ]

  // Admin tabs
  const adminTabs = [
    { id: 'users', label: 'User Management', icon: Shield },
  ]

  // Get main tabs based on role and portal mode for managers
  const getMainTabs = () => {
    if (isAdmin) return adminTabs
    if (isDirector) return directorTabs
    if (isManager) {
      // Manager in Request mode sees staff tabs
      if (portalMode === 'request') return staffTabs
      // Manager in Manage mode sees manager tabs
      return managerMainTabs
    }
    return staffTabs
  }
  
  const mainTabs = getMainTabs()
  const bottomTabs = (isManager && portalMode === 'manage') ? managerBottomTabs : []

  // All tabs for header lookup
  const allTabs = [...mainTabs, ...bottomTabs]

  return (
    <div className="dashboard-container">
      {/* Sidebar Navigation */}
      <aside className="dashboard-sidebar">
        <div className="sidebar-header">
          <div className="brand">
            <img src="/logo.svg" alt="Leaf Tracker" className="brand-logo" />
            <span className="brand-name">Leaf Tracker</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          {/* Portal Switcher for Managers */}
          {isManager && (
            <div className="portal-switcher">
              <button
                className={`portal-btn ${portalMode === 'request' ? 'active' : ''}`}
                onClick={() => {
                  setPortalMode('request')
                  setActiveTab('myleaves')
                }}
                title="Submit your own leave requests"
              >
                <FileText size={16} />
                Staff
              </button>
              <button
                className={`portal-btn ${portalMode === 'manage' ? 'active' : ''}`}
                onClick={() => {
                  setPortalMode('manage')
                  setActiveTab('calendar')
                }}
                title="Manage team leave requests"
              >
                <UserCog size={16} />
                Management
              </button>
            </div>
          )}
          
          {mainTabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.icon size={20} />
              <span>{tab.label}</span>
            </button>
          ))}

          {/* Bottom tabs (manager-only) separator and items */}
          {bottomTabs.length > 0 && (
            <>
              <div className="nav-separator"></div>
              {bottomTabs.map(tab => (
                <button
                  key={tab.id}
                  className={`nav-item ${activeTab === tab.id ? 'active' : ''} ${tab.count ? 'has-badge' : ''}`}
                  onClick={() => setActiveTab(tab.id)}
                >
                  <tab.icon size={20} />
                  <span>{tab.label}</span>
                  {tab.count > 0 && <span className="nav-badge">{tab.count}</span>}
                </button>
              ))}
            </>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="user-info">
            <div className={`user-avatar ${user?.role === 'manager' ? 'manager' : 'staff'}`}>
              {user?.username?.charAt(0).toUpperCase() || 'U'}
            </div>
            <div className="user-details">
              <span className="user-name">{user?.username}</span>
              <span className="user-role">
                {isAdmin ? 'Admin' : 
                 isDirector ? 'Director' : 
                 (isManager ? (portalMode === 'manage' ? 'Manager' : 'Staff Mode') : 'Staff')}
              </span>
            </div>
          </div>
          <button className="logout-btn" onClick={onLogout} title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="dashboard-main">
        {/* Top Header */}
        <header className="main-header">
          {/* Mobile Navigation (Visible only on mobile) */}
          <div className="mobile-nav">
            {isManager && (
              <div className="mobile-portal-switch">
                <button
                  className={`mobile-nav-item ${portalMode === 'request' ? 'active' : ''}`}
                  onClick={() => {
                    setPortalMode('request')
                    setActiveTab('myleaves')
                  }}
                >
                  <FileText size={20} />
                </button>
                <button
                  className={`mobile-nav-item ${portalMode === 'manage' ? 'active' : ''}`}
                  onClick={() => {
                    setPortalMode('manage')
                    setActiveTab('calendar')
                  }}
                >
                  <UserCog size={20} />
                </button>
                <div className="mobile-nav-separator"></div>
              </div>
            )}
            
            {mainTabs.map(tab => (
              <button
                key={tab.id}
                className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                <tab.icon size={20} />
              </button>
            ))}

            {bottomTabs.length > 0 && (
              <>
                <div className="mobile-nav-separator"></div>
                {bottomTabs.map(tab => (
                  <button
                    key={tab.id}
                    className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    <tab.icon size={20} />
                    {tab.count > 0 && <span className="mobile-nav-badge">{tab.count}</span>}
                  </button>
                ))}
              </>
            )}
            
             {/* Refresh Button (Mobile) */}
             {!isAdmin && (
              <button 
                className={`mobile-nav-item ${loading ? 'spin' : ''}`} 
                onClick={fetchLeaves}
                disabled={loading}
              >
                <RefreshCw size={20} />
              </button>
             )}

             <button className="mobile-nav-item logout" onClick={onLogout}>
              <LogOut size={20} />
            </button>
          </div>

          <div className="header-content-wrapper">
            <div className="header-left">
              <h1>{allTabs.find(t => t.id === activeTab)?.label || 'Dashboard'}</h1>
              <p className="header-subtitle">
                {activeTab === 'myleaves' && 'View your leave requests and balance'}
                {activeTab === 'request' && 'Submit a new leave request'}
                {activeTab === 'calendar' && 'View team availability at a glance'}
                {activeTab === 'team' && 'Track leave dates and countdowns'}
                {activeTab === 'inbox' && 'Review and approve leave requests'}
                {activeTab === 'settings' && 'Configure application settings'}
                {activeTab === 'users' && 'Manage accounts, roles, and permissions'}
              </p>
            </div>
            <div className="header-right">
              {!isAdmin && (
                <button onClick={fetchLeaves} disabled={loading} className="btn btn-secondary icon-only-mobile desktop-only">
                  <RefreshCw size={18} className={loading ? 'spin' : ''} />
                  <span className="btn-text">Refresh</span>
                </button>
              )}
              {!isManager && !isAdmin && (
                <button onClick={handleNewRequest} className="btn btn-primary icon-only-mobile desktop-only">
                  <PlusCircle size={18} />
                  <span className="btn-text">New Request</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            <span>{error}</span>
            <button onClick={fetchLeaves}>Retry</button>
          </div>
        )}

        {/* Tab Content */}
        <div className="tab-content">
          {activeTab === 'myleaves' && (
            <MyLeaves 
              leaves={leaves} 
              user={user}
              leaveBalance={user?.leaveBalance}
            />
          )}
          {activeTab === 'request' && (
            <LeaveRequest 
              user={user}
              leaveBalance={user?.leaveBalance}
              onSubmit={(data) => {
                console.log('Leave request submitted:', data)
                fetchLeaves()
                setActiveTab('myleaves')
              }}
              onCancel={() => setActiveTab('myleaves')}
            />
          )}
          {activeTab === 'calendar' && (
            <Calendar leaves={leaves} user={user} />
          )}
          {activeTab === 'team' && (
            <TeamView leaves={leaves} user={user} />
          )}
          {activeTab === 'inbox' && (
            <Inbox leaves={leaves} user={user} onRefresh={fetchLeaves} />
          )}
          {activeTab === 'settings' && isManager && portalMode === 'manage' ? (
            <DelegationManager user={user} />
          ) : activeTab === 'settings' ? (
            <div className="settings-placeholder">
              <Settings size={48} />
              <h2>Settings</h2>
              <p>Application settings coming soon...</p>
            </div>
          ) : null}
          {activeTab === 'users' && (
            <AdminDashboard user={user} />
          )}
        </div>

      </main>

      <PasswordPromptModal 
        isOpen={showPasswordPrompt}
        onClose={() => setShowPasswordPrompt(false)}
        onSuccess={() => {
          setShowPasswordPrompt(false)
          setPortalMode('manage')
        }}
        user={user}
      />
    </div>
  )
}

export default Dashboard
