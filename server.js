import express from 'express';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createHash, randomBytes } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const DATA_DIR = join(__dirname, 'data');
const USERS_FILE = join(DATA_DIR, 'users.json');

try { mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
try { mkdirSync(join(DATA_DIR, 'boundaries'), { recursive: true }); } catch (e) {}

app.use(express.json({ limit: '2mb' }));
app.use(express.static(join(__dirname, 'dist')));

// ── Helpers ──

function hashPassword(password, salt) {
  return createHash('sha256').update(password + salt).digest('hex');
}

function loadJSON(file, fallback) {
  try {
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {}
  return fallback;
}

function saveJSON(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

function getUsers() { return loadJSON(USERS_FILE, { users: [] }); }
function saveUsers(data) { saveJSON(USERS_FILE, data); }

// Per-user boundary file
function getUserBoundaryFile(username) {
  return join(DATA_DIR, 'boundaries', `${username}.json`);
}

function getUserBoundary(username) {
  return loadJSON(getUserBoundaryFile(username), null);
}

function saveUserBoundary(username, data) {
  saveJSON(getUserBoundaryFile(username), data);
}

// ── Sessions (in-memory) ──

const sessions = new Map();

function createSession(user) {
  const token = randomBytes(32).toString('hex');
  sessions.set(token, {
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    createdAt: Date.now()
  });
  return token;
}

function getSession(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (Date.now() - session.createdAt > 48 * 60 * 60 * 1000) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function requireAuth(req, res) {
  const session = getSession(req);
  if (!session) { res.status(401).json({ error: 'Not logged in' }); return null; }
  return session;
}

function requireAdmin(req, res) {
  const session = requireAuth(req, res);
  if (!session) return null;
  if (session.role !== 'admin') { res.status(403).json({ error: 'Admin access required' }); return null; }
  return session;
}

// ── Bootstrap admin ──

function ensureAdminExists() {
  const data = getUsers();
  if (!data.users.find(u => u.role === 'admin')) {
    const salt = randomBytes(16).toString('hex');
    data.users.push({
      username: 'admin',
      email: 'admin@googloid.com',
      displayName: 'Admin',
      role: 'admin',
      passwordHash: hashPassword('admin', salt),
      salt,
      createdAt: new Date().toISOString()
    });
    saveUsers(data);
    console.log('Default admin created (username: admin, password: admin)');
    console.log('IMPORTANT: Change the admin password after first login!');
  }
}
ensureAdminExists();

// ═══════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════

// POST /api/auth/signup — self-service registration
app.post('/api/auth/signup', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  const emailLower = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    return res.status(400).json({ error: 'Please enter a valid email address' });
  }

  const data = getUsers();
  if (data.users.find(u => u.email === emailLower || u.username === emailLower)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  const salt = randomBytes(16).toString('hex');
  const newUser = {
    username: emailLower,
    email: emailLower,
    displayName: (displayName || email.split('@')[0]).trim(),
    role: 'user',
    passwordHash: hashPassword(password, salt),
    salt,
    createdAt: new Date().toISOString()
  };

  data.users.push(newUser);
  saveUsers(data);

  const token = createSession(newUser);

  res.json({
    token,
    user: { username: newUser.username, email: newUser.email, displayName: newUser.displayName, role: newUser.role }
  });
});

// POST /api/auth/login
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' });
  }

  const data = getUsers();
  const emailLower = email.toLowerCase().trim();
  const user = data.users.find(u => u.email === emailLower || u.username === emailLower);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  if (hashPassword(password, user.salt) !== user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = createSession(user);
  res.json({
    token,
    user: { username: user.username, email: user.email, displayName: user.displayName, role: user.role }
  });
});

// POST /api/auth/logout
app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ success: true });
});

// GET /api/auth/me
app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: { username: session.username, email: session.email, displayName: session.displayName, role: session.role } });
});

// POST /api/auth/change-password
app.post('/api/auth/change-password', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const { currentPassword, newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const data = getUsers();
  const user = data.users.find(u => u.username === session.username);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (hashPassword(currentPassword, user.salt) !== user.passwordHash) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const newSalt = randomBytes(16).toString('hex');
  user.passwordHash = hashPassword(newPassword, newSalt);
  user.salt = newSalt;
  saveUsers(data);
  res.json({ success: true });
});

// ═══════════════════════════════════════
// PER-USER BOUNDARY ROUTES
// ═══════════════════════════════════════

// GET /api/boundary — get current user's boundary
app.get('/api/boundary', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const data = getUserBoundary(session.username);
  if (data) {
    res.json(data);
  } else {
    // New user — return null so frontend uses DEFAULT_BOUNDARY
    res.json({ vertices: null, savedAt: null });
  }
});

// POST /api/boundary — save current user's boundary
app.post('/api/boundary', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  const { vertices, parcelsInsideCount } = req.body;
  if (!vertices || !Array.isArray(vertices) || vertices.length < 3) {
    return res.status(400).json({ error: 'Invalid boundary data' });
  }

  const data = {
    vertices,
    savedAt: new Date().toISOString(),
    parcelsInsideCount: parcelsInsideCount || 0
  };

  saveUserBoundary(session.username, data);
  res.json({ success: true, data });
});

// POST /api/boundary/reset — reset to default boundary
app.post('/api/boundary/reset', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  // Delete user's boundary file so frontend falls back to default
  const file = getUserBoundaryFile(session.username);
  try {
    if (existsSync(file)) {
      unlinkSync(file);
    }
  } catch (e) {}

  res.json({ success: true });
});

// POST /api/boundary/clear — clear boundary completely
app.post('/api/boundary/clear', (req, res) => {
  const session = requireAuth(req, res);
  if (!session) return;

  saveUserBoundary(session.username, {
    vertices: [],
    savedAt: new Date().toISOString(),
    parcelsInsideCount: 0,
    cleared: true
  });

  res.json({ success: true });
});

// ═══════════════════════════════════════
// ADMIN ROUTES
// ═══════════════════════════════════════

// GET /api/admin/users — list all users
app.get('/api/admin/users', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;

  const data = getUsers();
  const safeUsers = data.users.map(u => ({
    username: u.username,
    email: u.email,
    displayName: u.displayName,
    role: u.role,
    createdAt: u.createdAt,
    hasBoundary: existsSync(getUserBoundaryFile(u.username))
  }));
  res.json({ users: safeUsers });
});

// DELETE /api/admin/users/:username
app.delete('/api/admin/users/:username', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;

  const target = req.params.username.toLowerCase();
  if (target === session.username) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const data = getUsers();
  const idx = data.users.findIndex(u => u.username === target);
  if (idx === -1) return res.status(404).json({ error: 'User not found' });

  data.users.splice(idx, 1);
  saveUsers(data);

  // Also remove their boundary
  const file = getUserBoundaryFile(target);
  try { if (existsSync(file)) { unlinkSync(file); } } catch (e) {}

  res.json({ success: true });
});

// GET /api/admin/users/:username/boundary — admin can view any user's boundary
app.get('/api/admin/users/:username/boundary', (req, res) => {
  const session = requireAdmin(req, res);
  if (!session) return;

  const data = getUserBoundary(req.params.username.toLowerCase());
  res.json(data || { vertices: null, savedAt: null });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Googloid Boundary Editor running on port ${PORT}`);
});
