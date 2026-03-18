import { activateMenu, bindFormSubmit, escapeHtml, setAppTitle, showAlert, supabase } from './common.js';
import { canAdmin, canEdit, getUserContext } from './auth.js';

const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.notifications', 'Notifications'));
activateMenu('notifications');

const listHost = document.getElementById('notifications-list');
const refreshBtn = document.getElementById('refresh-btn');
const markAllReadBtn = document.getElementById('mark-all-read-btn');
const metaEl = document.getElementById('notification-meta');
const adminPanel = document.getElementById('admin-notify-panel');
const notifyProfileSelect = document.getElementById('notify-profile');
const notifyLinkSelect = document.getElementById('notify-link');
const notifyLinkLabelInput = document.getElementById('notify-link-label');
const notifyLinkTypeInput = document.getElementById('notify-link-type');
const notifyForm = document.getElementById('notify-form');
const ctx = await getUserContext();

let recipientOptionsCache = [];
let linkOptionsCache = [];
let currentSenderTeamId = null;

function typeBadge(type) {
  const map = { update: 'warning', quiz: 'info', session: 'primary', match: 'success', info: 'secondary' };
  return map[type] || 'secondary';
}

async function resolveCurrentUserTeamId() {
  if (ctx.role === 'admin') return null;
  const [{ data: coachRow }, { data: playerRow }] = await Promise.all([
    supabase.from('coaches').select('team_id').eq('profile_id', ctx.user.id).maybeSingle(),
    supabase.from('players').select('team_id').eq('profile_id', ctx.user.id).maybeSingle()
  ]);
  return coachRow?.team_id || playerRow?.team_id || null;
}

function buildSenderFallbackPrefix() {
  const senderName = ctx.fullName || ctx.profile?.full_name || ctx.user?.email || 'Unknown';
  const senderRole = ctx.role || '';
  return `[sender:${senderName}|${senderRole}]`;
}

function parseSenderFromBody(item) {
  // Sender info is persisted in the body prefix to stay compatible with
  // notification tables that do not yet include dedicated sender columns.

  const body = String(item?.body || '');
  const match = body.match(/^\[sender:([^|\]]+)\|([^\]]*)\]\s*/);
  if (!match) return { senderName: item?.sender_name || '', senderRole: item?.sender_role || '', body };
  return {
    senderName: item?.sender_name || match[1] || '',
    senderRole: item?.sender_role || match[2] || '',
    body: body.replace(match[0], '')
  };
}

function formatRecipientOption(item) {
  const bits = [item.full_name || item.email || item.id];
  if (item.role) bits.push(item.role);
  if (item.team_name) bits.push(item.team_name);
  return bits.join(' · ');
}

function hydrateLinkMeta() {
  const selected = notifyLinkSelect?.selectedOptions?.[0];
  if (!selected) {
    if (notifyLinkLabelInput) notifyLinkLabelInput.value = '';
    if (notifyLinkTypeInput) notifyLinkTypeInput.value = '';
    return;
  }
  if (notifyLinkLabelInput) notifyLinkLabelInput.value = selected.dataset.label || '';
  if (notifyLinkTypeInput) notifyLinkTypeInput.value = selected.dataset.linkType || '';
}

function renderRecipientOptions(items) {
  recipientOptionsCache = items || [];
  if (!notifyProfileSelect) return;
  if (!recipientOptionsCache.length) {
    notifyProfileSelect.innerHTML = `<option value="">${tt('notifications.no_recipient', 'Aucun destinataire disponible.')}</option>`;
    return;
  }
  notifyProfileSelect.innerHTML = recipientOptionsCache
    .map(item => `<option value="${item.id}">${escapeHtml(formatRecipientOption(item))}</option>`)
    .join('');
}

function renderLinkOptions(items) {
  linkOptionsCache = items || [];
  if (!notifyLinkSelect) return;
  const options = [`<option value="">${tt('notifications.no_link', 'Aucun lien')}</option>`];
  options.push(...linkOptionsCache.map(item => `<option value="${item.url}" data-label="${escapeHtml(item.label)}" data-link-type="${item.linkType}">${escapeHtml(item.groupLabel)} · ${escapeHtml(item.label)}</option>`));
  notifyLinkSelect.innerHTML = options.join('');
  hydrateLinkMeta();
}

async function loadRecipientOptions() {
  if (!canEdit(ctx.role)) return;
  adminPanel.style.display = '';
  currentSenderTeamId = await resolveCurrentUserTeamId();

  const [{ data: profiles }, { data: players }, { data: coaches }] = await Promise.all([
    supabase.from('profiles').select('id,full_name,email,role').order('full_name'),
    supabase.from('players').select('profile_id,full_name,team_id,teams(name)').not('profile_id','is',null),
    supabase.from('coaches').select('profile_id,full_name,team_id,teams(name)').not('profile_id','is',null)
  ]);

  const byId = new Map();

  (profiles || []).forEach(profile => {
    byId.set(String(profile.id), {
      id: profile.id,
      full_name: profile.full_name,
      email: profile.email,
      role: profile.role,
      team_id: null,
      team_name: ''
    });
  });

  (players || []).forEach(player => {
    const key = String(player.profile_id);
    byId.set(key, {
      ...(byId.get(key) || { id: player.profile_id, email: '', role: 'player' }),
      id: player.profile_id,
      full_name: player.full_name || byId.get(key)?.full_name,
      role: 'player',
      team_id: player.team_id || null,
      team_name: player.teams?.name || ''
    });
  });

  (coaches || []).forEach(coach => {
    const key = String(coach.profile_id);
    byId.set(key, {
      ...(byId.get(key) || { id: coach.profile_id, email: '', role: 'coach' }),
      id: coach.profile_id,
      full_name: coach.full_name || byId.get(key)?.full_name,
      role: 'coach',
      team_id: coach.team_id || null,
      team_name: coach.teams?.name || ''
    });
  });

  let items = [...byId.values()].filter(item => String(item.id) !== String(ctx.user.id));

  if (ctx.role === 'coach') {
    items = items.filter(item =>
      item.team_id && String(item.team_id) === String(currentSenderTeamId || '') && (item.role === 'player' || item.role === 'coach')
    );
  }

  renderRecipientOptions(items);
}

async function loadLinkOptions() {
  if (!canEdit(ctx.role)) return;
  const isAdmin = canAdmin(ctx.role);
  let tacticsQuery = supabase.from('tactics').select('id,title,team_id').order('title');
  let sessionsQuery = supabase.from('sessions').select('id,title,team_id,session_date').order('session_date', { ascending: false });
  let matchesQuery = supabase.from('matches').select('id,opponent,team_id,match_date').order('match_date', { ascending: false });

  if (!isAdmin && currentSenderTeamId) {
    tacticsQuery = tacticsQuery.eq('team_id', currentSenderTeamId);
    sessionsQuery = sessionsQuery.eq('team_id', currentSenderTeamId);
    matchesQuery = matchesQuery.eq('team_id', currentSenderTeamId);
  }

  const [{ data: tactics }, { data: sessions }, { data: matches }] = await Promise.all([tacticsQuery, sessionsQuery, matchesQuery]);

  const items = [];
  (tactics || []).forEach(item => {
    items.push({
      url: `tactic-detail.html?id=${item.id}`,
      label: item.title || `${tt('notifications.link_tactic', 'Tactique')} #${item.id}`,
      linkType: 'tactic',
      groupLabel: tt('notifications.link_tactic', 'Tactique')
    });
  });
  (sessions || []).forEach(item => {
    const label = item.title || (item.session_date ? `${tt('notifications.link_session', 'Séance')} ${item.session_date}` : `${tt('notifications.link_session', 'Séance')} #${item.id}`);
    items.push({
      url: `sessions.html`,
      label,
      linkType: 'session',
      groupLabel: tt('notifications.link_session', 'Séance')
    });
  });
  (matches || []).forEach(item => {
    const label = item.opponent ? `${tt('notifications.link_match', 'Match')} vs ${item.opponent}` : `${tt('notifications.link_match', 'Match')} #${item.id}`;
    items.push({
      url: `match-detail.html?id=${item.id}`,
      label,
      linkType: 'match',
      groupLabel: tt('notifications.link_match', 'Match')
    });
  });

  renderLinkOptions(items);
}

async function loadNotifications() {
  listHost.innerHTML = `<div class="p-4 text-muted">${tt('notifications.loading', 'Chargement...')}</div>`;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('profile_id', ctx.user.id)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const unread = (data || []).filter(item => !item.is_read).length;
  metaEl.textContent = tt('notifications.meta', '{total} notification(s) · {unread} non lue(s)').replace('{total}', (data || []).length).replace('{unread}', unread);

  if (!data?.length) {
    listHost.innerHTML = `<div class="p-4 text-muted">${tt('notifications.none', 'Aucune notification pour le moment.')}</div>`;
    return;
  }

  listHost.innerHTML = data.map(item => {
    const parsed = parseSenderFromBody(item);
    return `
      <div class="notification-row border-bottom p-3 ${item.is_read ? '' : 'notification-unread'}" data-id="${item.id}">
        <div class="d-flex justify-content-between align-items-start gap-3 flex-wrap">
          <div>
            <div class="d-flex align-items-center gap-2 flex-wrap mb-1">
              <span class="badge bg-label-${typeBadge(item.type)}">${escapeHtml(item.type || 'info')}</span>
              ${item.is_read ? `<span class="badge bg-label-secondary">${tt('notifications.read', 'Lue')}</span>` : `<span class="badge bg-label-danger">${tt('notifications.unread', 'Non lue')}</span>`}
            </div>
            <div class="fw-semibold mb-1">${escapeHtml(item.title || '')}</div>
            ${parsed.senderName ? `<div class="small text-primary mb-1">${tt('notifications.sent_by', 'Envoyée par')}: ${escapeHtml(parsed.senderName)}${parsed.senderRole ? ` · ${escapeHtml(parsed.senderRole)}` : ''}</div>` : ''}
            <div class="text-muted mb-2">${escapeHtml(parsed.body || '')}</div>
            <div class="small text-muted">${escapeHtml(new Date(item.created_at).toLocaleString())}</div>
          </div>
          <div class="d-flex gap-2 align-items-center">
            ${item.link_url ? `<a class="btn btn-sm btn-outline-primary" href="${item.link_url}">${tt('notifications.open', 'Ouvrir')}</a>` : ''}
            <button class="btn btn-sm btn-outline-${item.is_read ? 'secondary' : 'success'} toggle-read-btn" data-id="${item.id}" data-read="${item.is_read ? '1' : '0'}">${item.is_read ? tt('notifications.mark_unread', 'Non lue') : tt('notifications.mark_read', 'Marquer lue')}</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

listHost.addEventListener('click', async (e) => {
  const btn = e.target.closest('.toggle-read-btn');
  if (!btn) return;
  const nextRead = btn.dataset.read !== '1';
  const { error } = await supabase.from('notifications').update({ is_read: nextRead }).eq('id', btn.dataset.id);
  if (error) {
    showAlert(error.message || tt('notifications.update_failed', 'Impossible de mettre à jour la notification.'), 'danger');
    return;
  }
  await loadNotifications();
});

markAllReadBtn?.addEventListener('click', async () => {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('profile_id', ctx.user.id).eq('is_read', false);
  if (error) {
    showAlert(error.message || tt('notifications.mark_all_failed', 'Impossible de tout marquer lu.'), 'danger');
    return;
  }
  showAlert(tt('notifications.all_read_success', 'Toutes les notifications ont été marquées comme lues.'));
  await loadNotifications();
});

notifyLinkSelect?.addEventListener('change', hydrateLinkMeta);

bindFormSubmit('notify-form', async (fd) => {
  const payload = Object.fromEntries(fd.entries());

  // Use a schema-safe payload only, to avoid 400 errors when optional columns
  // like sender_profile_id / sender_name / sender_role / link_label / link_type
  // do not exist in the notifications table yet.
  const safePayload = {
    profile_id: payload.profile_id,
    type: payload.type || 'info',
    title: payload.title,
    body: `${buildSenderFallbackPrefix()} ${payload.body}`,
    link_url: payload.link_url || null
  };

  const { error } = await supabase.from('notifications').insert(safePayload);
  if (error) throw error;

  showAlert(tt('notifications.sent_success', 'Notification envoyée.'));
  notifyForm?.reset();
  hydrateLinkMeta();
});

document.getElementById('notify-form')?.addEventListener('submit', async () => {
  setTimeout(loadNotifications, 350);
});

refreshBtn?.addEventListener('click', loadNotifications);

await loadRecipientOptions();
await loadLinkOptions();
await loadNotifications();

document.addEventListener('app:language-changed', () => {
  try {
    loadRecipientOptions().catch(console.error);
    loadLinkOptions().catch(console.error);
    loadNotifications().catch(console.error);
  } catch (e) {
    console.warn(e);
  }
});
