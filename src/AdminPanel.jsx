import React, { useState, useEffect } from 'react';

export default function AdminPanel({ token, allParcels }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [viewingUser, setViewingUser] = useState(null);
  const [viewingBoundary, setViewingBoundary] = useState(null);

  const headers = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` };

  const flash = (msg, isError) => {
    if (isError) { setError(msg); setTimeout(() => setError(''), 4000); }
    else { setMessage(msg); setTimeout(() => setMessage(''), 4000); }
  };

  const loadUsers = async () => {
    try {
      const res = await fetch('/api/admin/users', { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadUsers(); }, []);

  const deleteUser = async (username) => {
    if (!window.confirm(`Delete user ${username}? This will also delete their boundary.`)) return;
    try {
      const res = await fetch(`/api/admin/users/${username}`, { method: 'DELETE', headers });
      if (res.ok) {
        flash('User deleted');
        loadUsers();
      } else {
        const data = await res.json();
        flash(data.error, true);
      }
    } catch {
      flash('Failed to delete user', true);
    }
  };

  const viewBoundary = async (username) => {
    try {
      const res = await fetch(`/api/admin/users/${username}/boundary`, { headers });
      const data = await res.json();
      setViewingUser(username);
      setViewingBoundary(data);
    } catch {
      flash('Failed to load boundary', true);
    }
  };

  return (
    <div style={{ padding: '24px', maxWidth: '900px', margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>Admin Panel</h2>
      <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px' }}>
        Manage users and view their boundaries. Regular users only see the boundary editor.
      </p>

      {message && <div style={{ padding: '10px 14px', background: '#ecfdf5', border: '1px solid #6ee7b7', borderRadius: '8px', fontSize: '13px', color: '#065f46', marginBottom: '12px' }}>{message}</div>}
      {error && <div style={{ padding: '10px 14px', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', fontSize: '13px', color: '#991b1b', marginBottom: '12px' }}>{error}</div>}

      {/* Users table */}
      <div style={{ background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>Registered Users ({users.length})</span>
        </div>

        {loading ? (
          <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>Loading...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={th}>Name</th>
                <th style={th}>Email</th>
                <th style={th}>Role</th>
                <th style={th}>Joined</th>
                <th style={th}>Boundary</th>
                <th style={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.username} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={td}>{u.displayName}</td>
                  <td style={td}><span style={{ color: '#64748b' }}>{u.email}</span></td>
                  <td style={td}>
                    <span style={{
                      padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600,
                      background: u.role === 'admin' ? '#fef3c7' : '#f0f9ff',
                      color: u.role === 'admin' ? '#92400e' : '#0369a1'
                    }}>{u.role}</span>
                  </td>
                  <td style={td}><span style={{ color: '#94a3b8' }}>{new Date(u.createdAt).toLocaleDateString()}</span></td>
                  <td style={td}>
                    {u.hasBoundary ? (
                      <button onClick={() => viewBoundary(u.username)}
                        style={{ padding: '3px 8px', border: '1px solid #6366f1', borderRadius: '4px', background: 'white', color: '#6366f1', cursor: 'pointer', fontSize: '11px' }}>
                        View
                      </button>
                    ) : (
                      <span style={{ color: '#cbd5e1', fontSize: '11px' }}>Default</span>
                    )}
                  </td>
                  <td style={td}>
                    {u.role !== 'admin' && (
                      <button onClick={() => deleteUser(u.username)}
                        style={{ padding: '3px 8px', border: '1px solid #fca5a5', borderRadius: '4px', background: '#fef2f2', color: '#991b1b', cursor: 'pointer', fontSize: '11px' }}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Boundary viewer modal */}
      {viewingUser && viewingBoundary && (
        <div style={{
          marginTop: '20px', background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '18px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#0f172a' }}>
              Boundary for: {viewingUser}
            </span>
            <button onClick={() => { setViewingUser(null); setViewingBoundary(null); }}
              style={{ padding: '4px 10px', border: '1px solid #cbd5e1', borderRadius: '5px', background: 'white', cursor: 'pointer', fontSize: '12px', color: '#64748b' }}>
              Close
            </button>
          </div>

          {viewingBoundary.vertices && viewingBoundary.vertices.length > 0 ? (
            <div style={{ fontSize: '13px', color: '#475569' }}>
              <p><strong>Vertices:</strong> {viewingBoundary.vertices.length}</p>
              <p><strong>Parcels inside:</strong> {viewingBoundary.parcelsInsideCount || 'N/A'}</p>
              <p><strong>Last saved:</strong> {viewingBoundary.savedAt ? new Date(viewingBoundary.savedAt).toLocaleString() : 'Never'}</p>
              {viewingBoundary.cleared && <p style={{ color: '#dc2626' }}><strong>Status:</strong> Cleared (empty boundary)</p>}
            </div>
          ) : (
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
              {viewingBoundary.cleared ? 'This user has cleared their boundary.' : 'This user is using the default boundary (no custom edits).'}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

const th = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.5px' };
const td = { padding: '10px 14px' };
