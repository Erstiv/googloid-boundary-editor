import React, { useState, useEffect, useCallback } from 'react';
import BoundaryEditor from './BoundaryEditor';
import AdminPanel from './AdminPanel';
import PARCEL_CENTROIDS from './parcelData';

// ── Auth Screen (Login + Signup) ──

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = mode === 'signup' ? '/api/auth/signup' : '/api/auth/login';
    const body = mode === 'signup'
      ? { email, password, displayName: displayName || undefined }
      : { email, password };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('be-token', data.token);
        localStorage.setItem('be-user', JSON.stringify(data.user));
        onLogin(data.token, data.user);
      } else {
        setError(data.error || 'Something went wrong');
      }
    } catch {
      setError('Cannot connect to server');
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(145deg, #0c1829 0%, #162d50 40%, #1a3a6a 100%)'
    }}>
      <div style={{
        background: 'white', borderRadius: '14px', padding: '44px 40px', width: '400px',
        boxShadow: '0 30px 60px rgba(0,0,0,0.35)'
      }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '13px', fontWeight: 600, letterSpacing: '2px', color: '#94a3b8', textTransform: 'uppercase', marginBottom: '6px' }}>
            Town of Southborough
          </div>
          <div style={{ fontSize: '26px', fontWeight: 800, color: '#0f172a' }}>
            DIF Boundary Editor
          </div>
          <div style={{ fontSize: '13px', color: '#64748b', marginTop: '4px' }}>
            Route 9 Corridor District
          </div>
        </div>

        {/* Toggle */}
        <div style={{ display: 'flex', marginBottom: '24px', background: '#f1f5f9', borderRadius: '8px', padding: '3px' }}>
          {['login', 'signup'].map(m => (
            <button key={m} onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '8px', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: 600,
                cursor: 'pointer', transition: 'all 0.2s',
                background: mode === m ? 'white' : 'transparent',
                color: mode === m ? '#0f172a' : '#94a3b8',
                boxShadow: mode === m ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}>
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>
                Display Name <span style={{ color: '#94a3b8', fontWeight: 400 }}>(optional)</span>
              </label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                placeholder="How should we call you?"
                style={inputStyle} />
            </div>
          )}

          <div style={{ marginBottom: '14px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>
              Email
            </label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" autoFocus required
              style={inputStyle} />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: '#475569', marginBottom: '5px' }}>
              Password
            </label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'} required
              style={inputStyle} />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5',
              borderRadius: '8px', fontSize: '13px', color: '#991b1b', marginBottom: '14px'
            }}>{error}</div>
          )}

          <button type="submit" disabled={loading || !email || !password}
            style={{
              width: '100%', padding: '12px', background: loading ? '#94a3b8' : '#1e40af',
              color: 'white', border: 'none', borderRadius: '8px', fontSize: '14px',
              fontWeight: 600, cursor: loading ? 'wait' : 'pointer'
            }}>
            {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: '8px',
  fontSize: '14px', outline: 'none', boxSizing: 'border-box'
};

// ── Main App ──

export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('be-token'));
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('be-user')); } catch { return null; }
  });
  const [showAdmin, setShowAdmin] = useState(false);

  // Verify session on mount
  useEffect(() => {
    if (!authToken) return;
    fetch('/api/auth/me', { headers: { 'Authorization': `Bearer ${authToken}` } })
      .then(r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setCurrentUser(data.user))
      .catch(() => {
        localStorage.removeItem('be-token');
        localStorage.removeItem('be-user');
        setAuthToken(null);
        setCurrentUser(null);
      });
  }, [authToken]);

  const handleLogin = (token, user) => {
    setAuthToken(token);
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    } catch {}
    localStorage.removeItem('be-token');
    localStorage.removeItem('be-user');
    setAuthToken(null);
    setCurrentUser(null);
    setShowAdmin(false);
  };

  if (!authToken || !currentUser) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  const isAdmin = currentUser.role === 'admin';

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: '48px', background: '#0f172a', color: 'white', flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.5px' }}>SOUTHBOROUGH DIF</span>
          <span style={{ fontSize: '12px', color: '#64748b' }}>Boundary Editor</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {isAdmin && (
            <button onClick={() => setShowAdmin(!showAdmin)}
              style={{
                padding: '5px 12px', border: '1px solid ' + (showAdmin ? '#f59e0b' : '#475569'),
                borderRadius: '6px', background: showAdmin ? '#f59e0b' : 'transparent',
                color: showAdmin ? '#0f172a' : '#94a3b8', cursor: 'pointer', fontSize: '12px', fontWeight: 600
              }}>
              {showAdmin ? '← Back to Editor' : 'Admin'}
            </button>
          )}
          <span style={{ fontSize: '12px', color: '#94a3b8' }}>
            {currentUser.displayName}
            {isAdmin && <span style={{ marginLeft: '6px', padding: '1px 6px', background: '#f59e0b', color: '#0f172a', borderRadius: '4px', fontSize: '10px', fontWeight: 700 }}>ADMIN</span>}
          </span>
          <button onClick={handleLogout}
            style={{ padding: '5px 10px', border: '1px solid #475569', borderRadius: '6px', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: '12px' }}>
            Sign Out
          </button>
        </div>
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {showAdmin && isAdmin ? (
          <AdminPanel token={authToken} allParcels={PARCEL_CENTROIDS} />
        ) : (
          <BoundaryEditor
            allParcels={PARCEL_CENTROIDS}
            authToken={authToken}
            currentUser={currentUser}
          />
        )}
      </div>
    </div>
  );
}
