import { useState, useEffect } from 'react';
import { PageHeader, Badge, TableCard, TD } from '../components/Charts';
import {
  getRbacRoles, getRbacRole, createRbacRole, updateRbacRole, deleteRbacRole,
  getRbacPermissions, getRbacUsers, assignUserRoles,
} from '../api';

// ─── helpers ──────────────────────────────────────────────────────
const ROLE_COLORS = {
  'super-admin': '#7c3aed',
  'admin':       '#2563eb',
  'operator':    '#0891b2',
  'viewer':      '#16a34a',
  'global-read': '#15803d',
  'user':        '#6b7280',
};
const SYSTEM_ROLES = ['super-admin', 'admin', 'operator', 'viewer', 'global-read', 'user'];

const roleColor  = (name) => ROLE_COLORS[name] || '#f59e0b';
const RoleBadge  = ({ name }) => (
  <span style={{
    background: roleColor(name) + '18', color: roleColor(name),
    border: `1px solid ${roleColor(name)}40`,
    borderRadius: 20, padding: '2px 10px', fontSize: 11, fontWeight: 700,
  }}>{name}</span>
);

const F = {
  label:  { fontSize: 11, fontWeight: 600, color: '#374151', marginBottom: 4, display: 'block' },
  input:  { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff' },
  select: { width: '100%', padding: '7px 10px', fontSize: 12, border: '1px solid #d1d5db', borderRadius: 7, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box', color: '#111827', background: '#fff', cursor: 'pointer' },
  group:  { display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 },
};

// ─── Modal wrapper ────────────────────────────────────────────────
const Modal = ({ title, onClose, children, width = 520 }) => (
  <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
    <div style={{ background: '#fff', borderRadius: 12, width: '100%', maxWidth: width, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f2f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#111827' }}>{title}</div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#9ca3af', lineHeight: 1 }}>×</button>
      </div>
      <div style={{ padding: 20, overflowY: 'auto', flex: 1 }}>
        {children}
      </div>
    </div>
  </div>
);

const Err = ({ msg }) => msg ? <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#dc2626', marginTop: 8 }}>{msg}</div> : null;
const Ok  = ({ msg }) => msg ? <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: '#16a34a', marginTop: 8 }}>{msg}</div> : null;

const Btn = ({ onClick, disabled, color = '#6366f1', children, style = {} }) => (
  <button onClick={onClick} disabled={disabled} style={{
    padding: '7px 16px', borderRadius: 8, border: 'none', background: disabled ? '#e5e7eb' : color,
    color: disabled ? '#9ca3af' : '#fff', fontSize: 12, fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'inherit', ...style,
  }}>{children}</button>
);

// ─── Permission picker ────────────────────────────────────────────
const PermissionPicker = ({ allPerms, selected, onChange }) => {
  const [search, setSearch] = useState('');

  const filteredGroups = Object.entries(allPerms).reduce((acc, [group, perms]) => {
    const matched = perms.filter(p => !search || p.includes(search.toLowerCase()));
    if (matched.length) acc[group] = matched;
    return acc;
  }, {});

  const allSelected = Object.values(allPerms).flat();
  const toggleAll = (checked) => onChange(checked ? allSelected : []);
  const toggleGroup = (group, checked) => {
    const groupPerms = allPerms[group] || [];
    if (checked) onChange([...new Set([...selected, ...groupPerms])]);
    else onChange(selected.filter(p => !groupPerms.includes(p)));
  };
  const toggleOne = (perm, checked) => {
    if (checked) onChange([...selected, perm]);
    else onChange(selected.filter(p => p !== perm));
  };

  const totalCount    = allSelected.length;
  const selectedCount = selected.length;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
        <input
          style={{ ...F.input, flex: 1 }}
          placeholder="Qidirish..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <label style={{ fontSize: 11, whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', gap: 5, alignItems: 'center', color: '#374151' }}>
          <input type="checkbox"
            checked={selectedCount === totalCount}
            onChange={e => toggleAll(e.target.checked)}
          />
          Barchasi ({selectedCount}/{totalCount})
        </label>
      </div>
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, maxHeight: 360, overflowY: 'auto' }}>
        {Object.entries(filteredGroups).map(([group, perms]) => {
          const groupSelected = perms.filter(p => selected.includes(p)).length;
          const allGroup = groupSelected === perms.length;
          return (
            <div key={group}>
              <div style={{ padding: '7px 12px', background: '#f9fafb', borderBottom: '1px solid #f0f2f5', display: 'flex', alignItems: 'center', gap: 8, position: 'sticky', top: 0 }}>
                <input type="checkbox" checked={allGroup} onChange={e => toggleGroup(group, e.target.checked)} />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</span>
                <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{groupSelected}/{perms.length}</span>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
                {perms.map(p => {
                  const action = p.split('.')[1] || p;
                  const isSelected = selected.includes(p);
                  return (
                    <label key={p} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer',
                      background: isSelected ? '#ede9fe' : '#f3f4f6', color: isSelected ? '#5b21b6' : '#374151',
                      padding: '2px 8px', borderRadius: 12, border: `1px solid ${isSelected ? '#c4b5fd' : 'transparent'}` }}>
                      <input type="checkbox" style={{ width: 10, height: 10 }}
                        checked={isSelected} onChange={e => toggleOne(p, e.target.checked)} />
                      {action}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        {Object.keys(filteredGroups).length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>Topilmadi</div>
        )}
      </div>
    </div>
  );
};

// ─── Role Edit Modal ──────────────────────────────────────────────
const RoleEditModal = ({ role, allPerms, onClose, onSaved }) => {
  const [selected, setSelected] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState('');

  useEffect(() => {
    getRbacRole(role.id).then(r => { setSelected(r.permissions); setLoading(false); }).catch(() => setLoading(false));
  }, [role.id]);

  const save = async () => {
    setSaving(true); setError('');
    try {
      await updateRbacRole(role.id, selected);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Xato yuz berdi');
    }
    setSaving(false);
  };

  return (
    <Modal title={`"${role.name}" permissionlari`} onClose={onClose} width={680}>
      {loading ? <div style={{ textAlign: 'center', color: '#9ca3af', padding: 24 }}>Yuklanmoqda...</div> : (
        <>
          <PermissionPicker allPerms={allPerms} selected={selected} onChange={setSelected} />
          <Err msg={error} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Bekor</button>
            <Btn onClick={save} disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Btn>
          </div>
        </>
      )}
    </Modal>
  );
};

// ─── Create Role Modal ────────────────────────────────────────────
const CreateRoleModal = ({ allPerms, onClose, onCreated }) => {
  const [name,     setName]     = useState('');
  const [selected, setSelected] = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const create = async () => {
    if (!name.trim()) { setError('Rol nomi kiritilmagan'); return; }
    setSaving(true); setError('');
    try {
      await createRbacRole({ name: name.trim(), permissions: selected });
      onCreated();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Xato');
    }
    setSaving(false);
  };

  return (
    <Modal title="Yangi rol yaratish" onClose={onClose} width={680}>
      <div style={F.group}>
        <label style={F.label}>Rol nomi</label>
        <input style={F.input} value={name} onChange={e => setName(e.target.value)} placeholder="masalan: network-engineer" autoFocus />
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 600, color: '#374151' }}>Permissionlar</div>
      <PermissionPicker allPerms={allPerms} selected={selected} onChange={setSelected} />
      <Err msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Bekor</button>
        <Btn onClick={create} disabled={saving}>{saving ? 'Yaratilmoqda...' : 'Yaratish'}</Btn>
      </div>
    </Modal>
  );
};

// ─── User Role Modal ──────────────────────────────────────────────
const UserRoleModal = ({ user, allRoles, onClose, onSaved }) => {
  const [selected, setSelected] = useState(user.roles || []);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');

  const toggle = (name) => setSelected(s => s.includes(name) ? s.filter(r => r !== name) : [...s, name]);

  const save = async () => {
    if (selected.length === 0) { setError('Kamida 1 ta rol tanlang'); return; }
    setSaving(true); setError('');
    try {
      await assignUserRoles(user.id, selected);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Xato');
    }
    setSaving(false);
  };

  return (
    <Modal title={`"${user.username}" rollari`} onClose={onClose} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {allRoles.map(role => {
          const isOn = selected.includes(role.name);
          return (
            <label key={role.name} onClick={() => toggle(role.name)} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              borderRadius: 8, border: `1px solid ${isOn ? roleColor(role.name) + '60' : '#e5e7eb'}`,
              background: isOn ? roleColor(role.name) + '08' : '#fff',
              cursor: 'pointer', transition: 'all 0.15s',
            }}>
              <input type="checkbox" checked={isOn} onChange={() => {}} style={{ accentColor: roleColor(role.name), width: 15, height: 15 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: isOn ? roleColor(role.name) : '#111827' }}>{role.name}</div>
                <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{role.permissions_count} permission</div>
              </div>
            </label>
          );
        })}
      </div>
      <Err msg={error} />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
        <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', color: '#374151' }}>Bekor</button>
        <Btn onClick={save} disabled={saving}>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</Btn>
      </div>
    </Modal>
  );
};

// ─── Main RBAC Page ───────────────────────────────────────────────
export const RBACPage = ({ accent = '#6366f1' }) => {
  const [tab,      setTab]      = useState('users');
  const [roles,    setRoles]    = useState([]);
  const [users,    setUsers]    = useState([]);
  const [allPerms, setAllPerms] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [modal,    setModal]    = useState(null); // { type, data }
  const [ok,       setOk]       = useState('');

  const load = async () => {
    setLoading(true);
    const [r, u, p] = await Promise.all([getRbacRoles(), getRbacUsers(), getRbacPermissions()]);
    setRoles(r); setUsers(u); setAllPerms(p);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const saved = (msg) => { setOk(msg); load(); setTimeout(() => setOk(''), 3000); };

  const deleteRole = async (role) => {
    if (!confirm(`"${role.name}" rolini o'chirasizmi?`)) return;
    try {
      await deleteRbacRole(role.id);
      saved('Rol o\'chirildi');
    } catch (e) {
      alert(e.response?.data?.message || e.message);
    }
  };

  const S = {
    tab:     (active) => ({
      padding: '8px 18px', border: 'none', borderBottom: active ? `2px solid ${accent}` : '2px solid transparent',
      background: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: active ? 700 : 500,
      color: active ? accent : '#6b7280', cursor: 'pointer', marginBottom: -1,
    }),
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="RBAC — Rol va Huquqlar" desc="Foydalanuvchi rollari va ruxsatlarini boshqarish." />

      <Ok msg={ok} />

      {/* Tab bar */}
      <div style={{ borderBottom: '1px solid #e5e7eb', display: 'flex', gap: 0 }}>
        <button style={S.tab(tab === 'users')} onClick={() => setTab('users')}>Foydalanuvchilar</button>
        <button style={S.tab(tab === 'roles')} onClick={() => setTab('roles')}>Rollar</button>
      </div>

      {loading && <div style={{ color: '#9ca3af', textAlign: 'center', padding: 40 }}>Yuklanmoqda...</div>}

      {/* ── Users tab ── */}
      {!loading && tab === 'users' && (
        <TableCard
          headers={['Foydalanuvchi', 'To\'liq ismi', 'Email', 'Rollari', 'Holat', '']}
          rows={users}
          renderRow={(u, i) => (
            <tr key={u.id} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <TD mono bold>{u.username}</TD>
              <TD>{u.realname || '—'}</TD>
              <TD>{u.email || '—'}</TD>
              <td style={{ padding: '10px 14px' }}>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {u.roles.length > 0
                    ? u.roles.map(r => <RoleBadge key={r} name={r} />)
                    : <span style={{ fontSize: 11, color: '#9ca3af' }}>rol yo'q</span>}
                </div>
              </td>
              <td style={{ padding: '10px 14px' }}>
                <Badge status={u.enabled ? 'up' : 'down'} />
              </td>
              <td style={{ padding: '10px 14px' }}>
                <button onClick={() => setModal({ type: 'userRole', data: u })}
                  style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, border: `1px solid ${accent}40`, background: accent + '10', color: accent, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                  Rol o'zgartir
                </button>
              </td>
            </tr>
          )}
        />
      )}

      {/* ── Roles tab ── */}
      {!loading && tab === 'roles' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Btn onClick={() => setModal({ type: 'createRole' })}>+ Yangi rol</Btn>
          </div>
          <TableCard
            headers={['Rol nomi', 'Permissionlar', 'Foydalanuvchilar', 'Tur', '']}
            rows={roles}
            renderRow={(r, i) => (
              <tr key={r.id} style={{ borderTop: '1px solid #f0f2f5', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
                <td style={{ padding: '10px 14px' }}><RoleBadge name={r.name} /></td>
                <TD>{r.permissions_count}</TD>
                <TD>{r.users_count}</TD>
                <td style={{ padding: '10px 14px' }}>
                  <span style={{ fontSize: 11, color: SYSTEM_ROLES.includes(r.name) ? '#6b7280' : '#f59e0b', fontWeight: 600 }}>
                    {SYSTEM_ROLES.includes(r.name) ? 'Tizim' : 'Custom'}
                  </span>
                </td>
                <td style={{ padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {r.editable && (
                      <button onClick={() => setModal({ type: 'editRole', data: r })}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${accent}40`, background: accent + '10', color: accent, cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                        Permissionlar
                      </button>
                    )}
                    {!SYSTEM_ROLES.includes(r.name) && (
                      <button onClick={() => deleteRole(r)}
                        style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontWeight: 600, fontFamily: 'inherit' }}>
                        O'chir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            )}
          />

          {/* Role permission matrix */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e8ecf0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f2f5' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111827' }}>Rol matritsasi</div>
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Har bir rolning huquqlari darajasi</div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f9fafb' }}>
                    <th style={{ padding: '10px 16px', textAlign: 'left', fontWeight: 700, color: '#374151', borderBottom: '1px solid #e5e7eb' }}>Modul</th>
                    {roles.filter(r => SYSTEM_ROLES.includes(r.name)).map(r => (
                      <th key={r.id} style={{ padding: '10px 12px', textAlign: 'center', borderBottom: '1px solid #e5e7eb', minWidth: 90 }}>
                        <RoleBadge name={r.name} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Qurilmalar', 'device'],
                    ['Alertlar', 'alert'],
                    ['Foydalanuvchilar', 'user'],
                    ['Sozlamalar', 'settings'],
                    ['Portlar', 'port'],
                    ['Rollar', 'role'],
                  ].map(([label, resource]) => (
                    <tr key={resource} style={{ borderBottom: '1px solid #f9fafb' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#374151' }}>{label}</td>
                      {roles.filter(r => SYSTEM_ROLES.includes(r.name)).map(r => {
                        const perms = r.permissions_count;
                        // Determine access level for this resource based on role
                        const levels = {
                          'super-admin': '✅ To\'liq',
                          'admin':       resource === 'device' ? '✅ To\'liq' : resource === 'user' ? '✅ To\'liq' : resource === 'settings' ? '✅ To\'liq' : resource === 'role' ? '✅ Ko\'r' : '✅ To\'liq',
                          'operator':    resource === 'user' ? '🚫 Yo\'q' : resource === 'settings' ? '👁 Ko\'r' : resource === 'role' ? '🚫 Yo\'q' : '✅ CRUD',
                          'viewer':      resource === 'user' ? '👁 Ko\'r' : resource === 'settings' ? '👁 Ko\'r' : '👁 Ko\'r',
                          'global-read': '👁 Ko\'r',
                          'user':        resource === 'device' ? '👁 Ko\'r' : resource === 'alert' ? '👁 Ko\'r' : '🚫 Yo\'q',
                        };
                        const val = levels[r.name] || '🚫 Yo\'q';
                        const c   = val.startsWith('✅') ? '#16a34a' : val.startsWith('👁') ? '#2563eb' : '#9ca3af';
                        return (
                          <td key={r.id} style={{ padding: '10px 12px', textAlign: 'center', color: c, fontWeight: 600, fontSize: 11 }}>
                            {val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ── Modals ── */}
      {modal?.type === 'userRole' && (
        <UserRoleModal
          user={modal.data}
          allRoles={roles}
          onClose={() => setModal(null)}
          onSaved={() => saved('Rol saqlandi')}
        />
      )}
      {modal?.type === 'editRole' && (
        <RoleEditModal
          role={modal.data}
          allPerms={allPerms}
          onClose={() => setModal(null)}
          onSaved={() => saved('Permissionlar saqlandi')}
        />
      )}
      {modal?.type === 'createRole' && (
        <CreateRoleModal
          allPerms={allPerms}
          onClose={() => setModal(null)}
          onCreated={() => saved('Yangi rol yaratildi')}
        />
      )}
    </div>
  );
};

export default RBACPage;
