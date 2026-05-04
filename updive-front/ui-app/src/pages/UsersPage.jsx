import { useState, useEffect, useCallback } from 'react';
import { Icon, Badge, TableCard, PageHeader, TD } from '../components/Charts';
import { getUsers, createUser, updateUser, deleteUser, getUserTokens, createToken, deleteToken } from '../api';

const ACCENT = '#22c55e';

const ROLE_COLORS = { admin: '#ef4444', 'global-read': '#f59e0b', user: '#6b7280' };
const ROLE_LABELS = { admin: 'Admin', 'global-read': 'Read-Only', user: 'User' };

const F = {
  label:  { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input:  { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  select: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff', cursor: 'pointer' },
  group:  { display: 'flex', flexDirection: 'column', gap: 4 },
  row2:   { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
};

// ─── Confirm modal ────────────────────────────────────────────────
const ConfirmModal = ({ message, onConfirm, onClose }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#111827', marginBottom: 8 }}>Confirm</div>
      <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 20 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
        <button onClick={onConfirm} style={{ padding: '7px 14px', fontSize: 12, border: 'none', borderRadius: 7, background: '#ef4444', color: '#fff', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Delete</button>
      </div>
    </div>
  </div>
);

// ─── Token panel (inside edit modal) ─────────────────────────────
const TokenPanel = ({ userId }) => {
  const [tokens, setTokens]   = useState([]);
  const [desc, setDesc]       = useState('');
  const [newToken, setNewToken] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => getUserTokens(userId).then(setTokens), [userId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!desc.trim()) return;
    setLoading(true);
    try {
      const res = await createToken(userId, desc.trim());
      setNewToken(res.token);
      setDesc('');
      load();
    } catch {}
    setLoading(false);
  };

  const remove = async (tid) => {
    await deleteToken(userId, tid);
    load();
  };

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>API Tokens</div>
      {newToken && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', marginBottom: 10, fontSize: 11, wordBreak: 'break-all' }}>
          <div style={{ fontWeight: 600, color: '#166534', marginBottom: 4 }}>New token (copy now — won't show again):</div>
          <code style={{ color: '#15803d', fontFamily: 'monospace' }}>{newToken}</code>
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Token description" style={{ ...F.input, flex: 1 }} onKeyDown={e => e.key === 'Enter' && add()} />
        <button onClick={add} disabled={loading || !desc.trim()} style={{ padding: '7px 12px', fontSize: 11, border: 'none', borderRadius: 7, background: ACCENT, color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: desc.trim() ? 1 : 0.5 }}>
          {loading ? '...' : '+ Add'}
        </button>
      </div>
      {tokens.length === 0 ? (
        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', padding: '12px 0' }}>No tokens</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tokens.map(t => (
            <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: '#f9fafb', borderRadius: 7, border: '1px solid #e5e7eb' }}>
              <Icon name="settings" size={12} color="#9ca3af" />
              <span style={{ flex: 1, fontSize: 11, color: '#374151' }}>{t.description}</span>
              <span style={{ fontSize: 10, color: '#9ca3af', fontFamily: 'monospace' }}>{t.token_hash.slice(0, 12)}…</span>
              <button onClick={() => remove(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 2, display: 'flex' }}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Add / Edit Modal ─────────────────────────────────────────────
const UserModal = ({ user, onClose, onSaved }) => {
  const isEdit = !!user;
  const [form, setForm] = useState({
    username:          user?.username          ?? '',
    realname:          user?.realname          ?? '',
    email:             user?.email             ?? '',
    descr:             user?.descr             ?? '',
    role:              user?.role              ?? 'user',
    enabled:           user?.enabled           ?? true,
    can_modify_passwd: user?.can_modify_passwd ?? true,
    password:          '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!isEdit && !form.username.trim()) { setError('Username is required'); return; }
    if (!isEdit && form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true); setError('');
    try {
      if (isEdit) {
        const body = { realname: form.realname, email: form.email, descr: form.descr, role: form.role, enabled: form.enabled, can_modify_passwd: form.can_modify_passwd };
        if (form.password) body.password = form.password;
        await updateUser(user.user_id, body);
      } else {
        await createUser({ username: form.username, password: form.password, realname: form.realname, email: form.email, descr: form.descr, role: form.role });
      }
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.response?.data?.errors ? Object.values(e.response.data.errors).flat().join(', ') : e.message || 'Request failed');
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{isEdit ? 'Edit User' : 'Add User'}</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: 4 }}>
            <Icon name="close" size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!isEdit && (
            <div style={F.group}>
              <label style={F.label}>Username <span style={{ color: '#ef4444' }}>*</span></label>
              <input style={F.input} value={form.username} onChange={e => set('username', e.target.value)} placeholder="e.g. john.doe" autoFocus />
            </div>
          )}
          {isEdit && (
            <div style={{ ...F.group }}>
              <label style={F.label}>Username</label>
              <input style={{ ...F.input, background: '#f9fafb', color: '#9ca3af' }} value={form.username} readOnly />
            </div>
          )}
          <div style={F.row2}>
            <div style={F.group}>
              <label style={F.label}>Full Name</label>
              <input style={F.input} value={form.realname} onChange={e => set('realname', e.target.value)} placeholder="John Doe" />
            </div>
            <div style={F.group}>
              <label style={F.label}>Email</label>
              <input style={F.input} value={form.email} onChange={e => set('email', e.target.value)} type="email" placeholder="john@example.com" />
            </div>
          </div>
          <div style={F.row2}>
            <div style={F.group}>
              <label style={F.label}>Role</label>
              <select style={F.select} value={form.role} onChange={e => set('role', e.target.value)}>
                <option value="admin">Admin</option>
                <option value="global-read">Read-Only</option>
                <option value="user">User</option>
              </select>
            </div>
            <div style={F.group}>
              <label style={F.label}>Description</label>
              <input style={F.input} value={form.descr} onChange={e => set('descr', e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div style={F.group}>
            <label style={F.label}>{isEdit ? 'New Password (leave blank to keep)' : 'Password *'}</label>
            <input style={F.input} value={form.password} onChange={e => set('password', e.target.value)} type="password" placeholder={isEdit ? '••••••••' : 'Min 6 characters'} />
          </div>
          {isEdit && (
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
                Enabled
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                <input type="checkbox" checked={form.can_modify_passwd} onChange={e => set('can_modify_passwd', e.target.checked)} />
                Can change password
              </label>
            </div>
          )}

          {isEdit && (
            <div style={{ borderTop: '1px solid #f0f2f5', paddingTop: 14, marginTop: 4 }}>
              <TokenPanel userId={user.user_id} />
            </div>
          )}

          {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid #f0f2f5', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '7px 14px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, background: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={submit} disabled={loading} style={{ padding: '7px 16px', fontSize: 12, border: 'none', borderRadius: 7, background: ACCENT, color: '#fff', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit', opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Saving…' : isEdit ? 'Save Changes' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Main page ────────────────────────────────────────────────────
export default function UsersPage({ accent = ACCENT }) {
  const [users,   setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [modal,   setModal]   = useState(null); // null | 'add' | user-object
  const [confirm, setConfirm] = useState(null); // user to delete

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setUsers(await getUsers()); }
    catch (e) { setError(e.response?.data?.message || e.message || 'Failed to load users'); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async () => {
    if (!confirm) return;
    try { await deleteUser(confirm.user_id); load(); }
    catch (e) { setError(e.response?.data?.message || 'Delete failed'); }
    setConfirm(null);
  };

  const toggleEnabled = async (u) => {
    try { await updateUser(u.user_id, { enabled: !u.enabled }); load(); }
    catch {}
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Users</div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Manage system users and API tokens</div>
        </div>
        <button onClick={() => setModal('add')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, border: 'none', borderRadius: 8, background: accent, color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>
          <Icon name="users" size={13} color="#fff" /> Add User
        </button>
      </div>

      {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626' }}>{error}</div>}

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f0f2f5' }}>
              {['#', 'Username', 'Full Name', 'Email', 'Role', 'Status', 'Tokens', 'Created', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', textAlign: 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: '32px', textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>No users found</td></tr>
            ) : users.map((u, i) => (
              <tr key={u.user_id} style={{ borderBottom: '1px solid #f9fafb' }}>
                <TD>{u.user_id}</TD>
                <TD>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: '50%', background: `${ROLE_COLORS[u.role]}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: ROLE_COLORS[u.role] }}>{u.username[0]?.toUpperCase()}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: '#111827' }}>{u.username}</span>
                  </div>
                </TD>
                <TD><span style={{ fontSize: 12, color: u.realname ? '#374151' : '#9ca3af' }}>{u.realname || '—'}</span></TD>
                <TD><span style={{ fontSize: 12, color: '#374151' }}>{u.email || '—'}</span></TD>
                <TD>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: `${ROLE_COLORS[u.role]}18`, color: ROLE_COLORS[u.role], textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                </TD>
                <TD>
                  <button onClick={() => toggleEnabled(u)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, border: 'none', cursor: 'pointer', fontFamily: 'inherit', background: u.enabled ? '#f0fdf4' : '#fef2f2', color: u.enabled ? '#15803d' : '#dc2626' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: u.enabled ? '#22c55e' : '#ef4444', display: 'inline-block' }} />
                    {u.enabled ? 'Active' : 'Disabled'}
                  </button>
                </TD>
                <TD>
                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: '#f3f4f6', color: '#6b7280' }}>
                    {u.token_count}
                  </span>
                </TD>
                <TD><span style={{ fontSize: 11, color: '#9ca3af' }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</span></TD>
                <TD>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button onClick={() => setModal(u)} title="Edit" style={{ background: '#f3f4f6', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Icon name="edit" size={12} color="#6b7280" />
                    </button>
                    <button onClick={() => setConfirm(u)} title="Delete" style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: '5px 7px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                      <Icon name="close" size={12} color="#ef4444" />
                    </button>
                  </div>
                </TD>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modal === 'add' && <UserModal onClose={() => setModal(null)} onSaved={load} />}
      {modal && modal !== 'add' && <UserModal user={modal} onClose={() => setModal(null)} onSaved={load} />}
      {confirm && <ConfirmModal message={`Delete user "${confirm.username}"? This cannot be undone.`} onConfirm={handleDelete} onClose={() => setConfirm(null)} />}
    </div>
  );
}
