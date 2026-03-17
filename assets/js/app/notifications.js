import { activateMenu, bindFormSubmit, escapeHtml, setAppTitle, showAlert, supabase } from './common.js';
import { canAdmin, getUserContext } from './auth.js';

setAppTitle('Notifications');
activateMenu('notifications');

const listHost = document.getElementById('notifications-list');
const refreshBtn = document.getElementById('refresh-btn');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const metaEl = document.getElementById('notification-meta');
const adminPanel = document.getElementById('admin-notify-panel');
const notifyProfileSelect = document.getElementById('notify-profile');
const ctx = await getUserContext();

function typeBadge(type) {
  const map = { update: 'warning', quiz: 'info', session: 'primary', match: 'success', info: 'secondary' };
  return map[type] || 'secondary';
}

async function loadProfilesForAdmin() {
  if (!canAdmin(ctx.role)) return;
  adminPanel.style.display = '';
  const [{ data: profiles }, { data: players }, { data: coaches }] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email,role').order('full_name'),
    supabase.from('players').select('profile_id,full_name').not('profile_id','is',null),
    supabase.from('coaches').select('profile_id,full_name').not('profile_id','is',null)
  ]);
  const names = new Map();
  (profiles || []).forEach(p => names.set(String(p.id), { full_name: p.full_name, email: p.email, role: p.role }));
  (players || []).forEach(p => names.set(String(p.profile_id), { ...(names.get(String(p.profile_id)) || {}), full_name: p.full_name || names.get(String(p.profile_id))?.full_name, role: 'player' }));
  (coaches || []).forEach(c => names.set(String(c.profile_id), { ...(names.get(String(c.profile_id)) || {}), full_name: c.full_name || names.get(String(c.profile_id))?.full_name, role: 'coach' }));
  notifyProfileSelect.innerHTML = (profiles || []).map(profile => {
    const item = names.get(String(profile.id)) || profile;
    return `<option value="${profile.id}">${escapeHtml(item.full_name || item.email || profile.id)}${item.role ? ` · ${escapeHtml(item.role)}` : ''}</option>`;
  }).join('');
}

async function loadNotifications() {
  listHost.innerHTML = '<div class="p-4 text-muted">Chargement...</div>';
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', ctx.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const unread = (data || []).filter(item => !item.is_read).length;
  metaEl.textContent = `${(data || []).length} notification(s) · ${unread} non lue(s)`;
  if (!data?.length) {
    listHost.innerHTML = '<div class="p-4 text-muted">Aucune notification pour le moment.</div>';
    return;
  }
  listHost.innerHTML = data.map(item => `
    <div class="notification-row border-bottom p-3 ${item.is_read ? '' : 'notification-unread'}" data-id="${item.id}">
      <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
        <div>
          <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
            <span class="badge bg-label-${typeBadge(item.type)}">${escapeHtml(item.type || 'info')}</span>
            ${item.is_read ? '<span class="badge bg-label-secondary">Lue</span>' : '<span class="badge bg-label-danger">Non lue</span>'}
          </div>
          <div class="fw-semibold mb-1">${escapeHtml(item.title || '')}</div>
          <div class="text-muted mb-2">${escapeHtml(item.body || '')}</div>
          <div class="small text-muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</div>
        </div>
        <div class="d-flex gap-2 align-items-center">
          ${item.link_url ? `<a class="btn btn-sm btn-outline-primary" href="${item.link_url}">Ouvrir</a>` : ''}
          <button class="btn btn-sm btn-outline-${item.is_read ? 'secondary' : 'success'} toggle-read-btn" data-id="${item.id}" data-read="${item.is_read ? '1' : '0'}">${item.is_read ? 'Non lue' : 'Marquer lue'}</button>
        </div>
      </div>
    </div>`).join('');
}

listHost.addEventListener('click', async e => {
  const btn = e.target.closest('.toggle-read-btn');
  if (!btn) return;
  const nextRead = btn.dataset.read !== '1';
  const { error } = await supabase.from('notifications').update({ is_read: nextRead }).eq('id', btn.dataset.id);
  if (error) {
    showAlert(error.message || 'Impossible de mettre à jour la notification.', 'danger');
    return;
  }
  await loadNotifications();
});

markAllReadBtn?.addEventListener('click', async () => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('profile_id', ctx.user.id).eq('is_read', false);
  if (error) {
    showAlert(error.message || 'Impossible de tout marquer lu.', 'danger');
    return;
  }
  showAlert('Toutes les notifications ont été marquées comme lues.');
  await loadNotifications();
});

bindFormSubmit('notify-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const { error } = await supabase.from('notifications').insert({
    profile_id: payload.profile_id,
    type: payload.type || 'info',
    title: payload.title,
    body: payload.body,
    link_url: payload.link_url || null
  });
  if (error) throw error;
  showAlert('Notification envoyée.');
  document.getElementById('notify-form').reset();
});

document.getElementById('notify-form')?.addEventListener('submit', async () => {
  setTimeout(loadNotifications, 350);
});

refreshBtn?.addEventListener('click', loadNotifications);
await loadProfilesForAdmin();
await loadNotifications();
