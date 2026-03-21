import { activateMenu, bindFormSubmit, escapeHtml, fetchTeamsOptions, setAppTitle, showAlert, supabase } from './common.js';
import { canAdmin, getUserContext } from './auth.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.users', 'Utilisateurs'));
activateMenu('users');

const ctx = await getUserContext();
if (!canAdmin(ctx.role)) location.href = 'index.html';

const host = document.getElementById('portal-content');
const requestsHost = document.getElementById('password-reset-requests');
const createForm = document.getElementById('user-create-form');
const createRoleSelect = document.getElementById('create-role-select');
const createTeamSelect = document.getElementById('create-team-select');
const generatePasswordBtn = document.getElementById('generate-password-btn');
document.getElementById('portal-title').textContent = tt('page.users', 'Utilisateurs');
document.getElementById('portal-subtitle').textContent = tt('users.hero_sub', 'Gère l\'activation des inscriptions et l\'accès des utilisateurs.');

let teamsCache = [];

function statusBadge(user) {
  if (user.is_active === false) return `<span class="badge bg-label-warning">${tt('users.pending', 'En attente')}</span>`;
  return `<span class="badge bg-label-success">${tt('users.active', 'Actif')}</span>`;
}

function resetStatusBadge(status) {
  const map = {
    pending: 'bg-label-warning',
    handled: 'bg-label-success',
    cancelled: 'bg-label-secondary'
  };
  const labels = {
    pending: tt('users.reset_pending', 'En attente'),
    handled: tt('users.reset_handled', 'Traitée'),
    cancelled: tt('users.reset_cancelled', 'Annulée')
  };
  return `<span class="badge ${map[status] || 'bg-label-secondary'}">${labels[status] || escapeHtml(status || '—')}</span>`;
}

function roleBadge(role) {
  const map = {
    admin: 'bg-label-danger',
    coach: 'bg-label-primary',
    player: 'bg-label-info'
  };
  return `<span class="badge ${map[role] || 'bg-label-secondary'} text-uppercase">${escapeHtml(role || '—')}</span>`;
}

function randomPassword(length = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, n => chars[n % chars.length]).join('');
}

function teamNameById(id) {
  return teamsCache.find(team => String(team.id) === String(id))?.name || '—';
}

function buildRoleSelect(currentRole = 'player', userId, isPending = false) {
  const roles = ['admin', 'coach', 'player'];
  const disabled = isPending ? 'disabled' : '';
  const title = isPending ? `title="${escapeHtml(tt('users.pending_disable_hint', 'Compte en attente de validation. Modification indisponible.'))}"` : '';
  return `<select class="form-select form-select-sm user-role-select" data-id="${userId}" ${disabled} ${title}>${roles.map(role => `<option value="${role}" ${role === currentRole ? 'selected' : ''}>${role}</option>`).join('')}</select>`;
}

function buildTeamSelect(currentTeamId, userId, role, isPending = false) {
  const disabled = role === 'admin' || isPending ? 'disabled' : '';
  const title = isPending ? `title="${escapeHtml(tt('users.pending_disable_hint', 'Compte en attente de validation. Modification indisponible.'))}"` : '';
  const placeholder = `<option value="">${tt('common.choose_team','Choisir une équipe')}</option>`;
  const options = teamsCache.map(team => `<option value="${team.id}" ${String(team.id) === String(currentTeamId ?? '') ? 'selected' : ''}>${escapeHtml(team.name)}</option>`).join('');
  return `<select class="form-select form-select-sm user-team-select" data-id="${userId}" ${disabled} ${title}>${placeholder}${options}</select>`;
}

async function ensureTeamOptions() {
  teamsCache = await fetchTeamsOptions(createTeamSelect);
  createTeamSelect.value = '';
}

function toggleCreateTeamState() {
  const disabled = createRoleSelect.value === 'admin';
  createTeamSelect.disabled = disabled;
  if (disabled) createTeamSelect.value = '';
}

async function loadPasswordResetRequests() {
  if (!requestsHost) return;
  requestsHost.innerHTML = `<div class="card"><div class="card-body text-muted">${tt('common.loading', 'Chargement...')}</div></div>`;
  const { data, error } = await supabase
    .from('password_reset_requests')
    .select('id,email,status,requested_at,handled_at,profile_id,last_temp_password,email_subject,email_body')
    .order('requested_at', { ascending: false })
    .limit(20);
  if (error) {
    requestsHost.innerHTML = `<div class="card border-warning"><div class="card-body text-warning">${escapeHtml(error.message || 'Erreur')}</div></div>`;
    return;
  }
  const rows = data || [];
  const pendingCount = rows.filter(row => row.status === 'pending').length;
  const isCollapsed = localStorage.getItem('usersResetRequestsCollapsed') !== '0';
  requestsHost.innerHTML = `
    <div class="card">
      <div class="card-header d-flex justify-content-between align-items-center gap-3 flex-wrap">
        <div class="d-flex align-items-center gap-2 flex-wrap">
          <h5 class="mb-0">Demandes de réinitialisation</h5>
          <span class="badge ${pendingCount ? 'bg-label-warning' : 'bg-label-secondary'}">${pendingCount} ${tt('users.new_requests', 'nouvelles')}</span>
        </div>
        <button type="button" class="btn btn-sm btn-outline-primary" id="toggle-reset-requests-btn" aria-expanded="${isCollapsed ? 'false' : 'true'}">
          <i class="bx ${isCollapsed ? 'bx-chevron-down' : 'bx-chevron-up'} me-1"></i>${isCollapsed ? tt('common.show', 'Afficher') : tt('common.hide', 'Masquer')}
        </button>
      </div>
      <div class="card-body border-top ${isCollapsed ? 'd-none' : ''}" id="reset-requests-body">
        <p class="text-muted mb-3">Les demandes envoyées depuis l'écran de connexion arrivent ici.</p>
        <div class="table-responsive">
          <table class="table align-middle mb-0">
            <thead>
              <tr>
                <th>Email</th>
                <th>Statut</th>
                <th>Demandée le</th>
                <th>Traitée le</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              ${rows.length ? rows.map(row => `
                <tr>
                  <td>${escapeHtml(row.email || '—')}</td>
                  <td>${resetStatusBadge(row.status)}</td>
                  <td>${row.requested_at ? new Date(row.requested_at).toLocaleString() : '—'}</td>
                  <td>${row.handled_at ? new Date(row.handled_at).toLocaleString() : '—'}</td>
                  <td>
                    <div class="d-flex flex-wrap gap-2">
                      ${row.status === 'pending' ? `<button class="btn btn-sm btn-warning process-reset-btn" data-id="${row.id}" data-email="${escapeHtml(row.email || '')}"><i class="bx bx-key me-1"></i>${tt('users.generate_temp_password', 'Générer un mot de passe')}</button>` : (!row.email_body ? `<span class="text-muted small align-self-center">${tt('users.reset_done_hint', 'Mot de passe généré')}</span>` : '')}
                      ${row.email_body ? `<button class="btn btn-sm btn-outline-primary copy-reset-mail-btn" data-subject="${escapeHtml(row.email_subject || 'Réinitialisation TactiBoard')}" data-body="${escapeHtml(row.email_body || '')}"><i class="bx bx-copy me-1"></i>${tt('users.copy_reset_mail', "Copier l'email")}</button>` : ''}
                    </div>
                  </td>
                </tr>
              `).join('') : `<tr><td colspan="5" class="text-muted">${tt('users.no_reset_requests', 'Aucune demande de réinitialisation.')}</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>`;
}


async function loadUsers() {
  host.innerHTML = `<div class="text-muted">${tt('common.loading', 'Chargement...')}</div>`;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,email,role,is_active,created_at,approved_at,requested_team_id')
    .order('created_at', { ascending: false });
  if (error) throw error;
  if (!data?.length) {
    host.innerHTML = `<div class="card"><div class="card-body text-muted">${tt('users.no_users','Aucun utilisateur.')}</div></div>`;
    return;
  }
  host.innerHTML = `<div class="card"><div class="table-responsive"><table class="table align-middle"><thead><tr>
    <th>${tt('profile.full_name','Nom complet')}</th>
    <th>${tt('profile.email','Email')}</th>
    <th>${tt('users.role','Rôle')}</th>
    <th>${tt('users.team','Équipe demandée')}</th>
    <th>${tt('users.status','Statut')}</th>
    <th>${tt('users.created_at','Inscrit le')}</th>
    <th>${tt('users.approved_at','Validé le')}</th>
    <th>${tt('common.actions','Actions') || 'Actions'}</th>
  </tr></thead><tbody>
    ${data.map(user => {
      const isPending = user.is_active === false;
      return `
      <tr>
        <td>${escapeHtml(user.full_name || '—')}</td>
        <td>${escapeHtml(user.email || '—')}</td>
        <td><div class="d-flex flex-column gap-1">${roleBadge(user.role)}${buildRoleSelect(user.role, user.id, isPending)}</div></td>
        <td><div class="d-flex flex-column gap-1"><span class="small text-muted">${escapeHtml(teamNameById(user.requested_team_id))}</span>${buildTeamSelect(user.requested_team_id, user.id, user.role, isPending)}</div></td>
        <td>${statusBadge(user)}${isPending ? `<div class="small text-muted mt-1">${tt('users.pending_disable_hint', 'Modification disponible après validation du compte.')}</div>` : ''}</td>
        <td>${user.created_at ? new Date(user.created_at).toLocaleString() : '—'}</td>
        <td>${user.approved_at ? new Date(user.approved_at).toLocaleString() : '—'}</td>
        <td class="actions-cell">
          ${user.role !== 'admin' ? `<button class="btn btn-sm btn-outline-${user.is_active === false ? 'success' : 'warning'} user-toggle-btn" data-id="${user.id}" data-active="${user.is_active === false ? '0' : '1'}">${user.is_active === false ? tt('users.activate','Activer') : tt('users.deactivate','Désactiver')}</button>` : ''}
          <button class="btn btn-sm btn-outline-primary user-mail-btn" data-name="${escapeHtml(user.full_name || '')}" data-email="${escapeHtml(user.email || '')}" data-link="${location.origin}${location.pathname.split('/pages/')[0]}/pages/login.html">${tt('users.copy_mail','Copier mail')}</button>
        </td>
      </tr>`;
    }).join('')}
  </tbody></table></div></div>`;
}

async function toggleUserActivation(toggleBtn) {
  const isCurrentlyActive = toggleBtn.dataset.active === '1';
  const nextActive = !isCurrentlyActive;
  const payload = nextActive
    ? { is_active: true, approved_at: new Date().toISOString(), approved_by_profile_id: ctx.user.id }
    : { is_active: false };

  toggleBtn.disabled = true;
  try {
    const { error } = await supabase.from('profiles').update(payload).eq('id', toggleBtn.dataset.id);
    if (error) throw error;
    showAlert(tt('users.updated','Utilisateur mis à jour.'));
    await Promise.all([loadUsers(), loadPasswordResetRequests()]);
  } finally {
    toggleBtn.disabled = false;
  }
}

async function updateUserRoleTeam(userId) {
  const roleSelect = host.querySelector(`.user-role-select[data-id="${userId}"]`);
  const teamSelect = host.querySelector(`.user-team-select[data-id="${userId}"]`);
  if (!roleSelect || !teamSelect) return;
  if (roleSelect.disabled || teamSelect.title) {
    showAlert(tt('users.pending_disable_hint', 'Compte en attente de validation. Modification indisponible.'), 'warning');
    return;
  }
  const role = roleSelect.value;
  const requestedTeamId = role === 'admin' ? null : (teamSelect.value ? Number(teamSelect.value) : null);
  if (role !== 'admin' && !requestedTeamId) {
    showAlert('Choisis une équipe pour ce rôle.', 'warning');
    return;
  }
  roleSelect.disabled = true;
  teamSelect.disabled = true;
  try {
    const { error } = await supabase.rpc('admin_update_user_role_team', {
      p_profile_id: userId,
      p_role: role,
      p_requested_team_id: requestedTeamId
    });
    if (error) throw error;
    showAlert(tt('users.updated','Utilisateur mis à jour.'));
    await loadUsers();
  } finally {
    roleSelect.disabled = false;
    teamSelect.disabled = role === 'admin';
  }
}

host.addEventListener('change', async e => {
  const roleSelect = e.target.closest('.user-role-select');
  const teamSelect = e.target.closest('.user-team-select');
  if (roleSelect) {
    if (roleSelect.disabled) return;
    const rowTeamSelect = host.querySelector(`.user-team-select[data-id="${roleSelect.dataset.id}"]`);
    if (rowTeamSelect) {
      rowTeamSelect.disabled = roleSelect.value === 'admin';
      if (roleSelect.value === 'admin') rowTeamSelect.value = '';
    }
    await updateUserRoleTeam(roleSelect.dataset.id);
    return;
  }
  if (teamSelect) {
    if (teamSelect.disabled) return;
    await updateUserRoleTeam(teamSelect.dataset.id);
  }
});

async function processResetRequest(btn) {
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${tt('common.saving','Traitement...')}`;
  try {
    const { data, error } = await supabase.rpc('admin_process_password_reset_request', { p_request_id: Number(btn.dataset.id) });
    if (error) throw error;
    const payload = Array.isArray(data) ? data[0] : data;
    const subject = payload?.email_subject || 'Réinitialisation TactiBoard';
    const body = payload?.email_body || '';
    const text = `Subject: ${subject}\n\n${body}`;
    await navigator.clipboard.writeText(text);
    showAlert(tt('users.reset_mail_copied','Mot de passe temporaire généré et email copié.'));
    await loadPasswordResetRequests();
  } finally {
    btn.disabled = false;
    btn.innerHTML = original;
  }
}

host.addEventListener('click', async e => {
  const toggleBtn = e.target.closest('.user-toggle-btn');
  if (toggleBtn) {
    try {
      await toggleUserActivation(toggleBtn);
    } catch (err) {
      console.error(err);
      showAlert(String(err?.message || tt('common.update','Mise à jour impossible.')), 'danger');
    }
    return;
  }

  const mailBtn = e.target.closest('.user-mail-btn');
  if (mailBtn) {
    try {
      const name = mailBtn.dataset.name || mailBtn.dataset.email || 'Utilisateur';
      const link = mailBtn.dataset.link;
      const subject = tt('users.approval_mail_subject', 'Validation de ton inscription TactiBoard');
      const body = tt('users.approval_mail_body', 'Bonjour {name},%0A%0ATon inscription TactiBoard a été validée.%0ATu peux maintenant te connecter ici : {link}%0A%0ABien cordialement.')
        .replace('{name}', name)
        .replace('{link}', link);
      const text = `Subject: ${subject}\n\n${decodeURIComponent(body)}`;
      await navigator.clipboard.writeText(text);
      showAlert(tt('users.mail_copied','Message copié.'));
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Clipboard error', 'danger');
    }
  }
});

requestsHost?.addEventListener('click', async e => {
  const toggleBtn = e.target.closest('#toggle-reset-requests-btn');
  if (toggleBtn) {
    const body = document.getElementById('reset-requests-body');
    if (!body) return;
    const isHidden = body.classList.toggle('d-none');
    localStorage.setItem('usersResetRequestsCollapsed', isHidden ? '1' : '0');
    toggleBtn.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
    toggleBtn.innerHTML = `<i class="bx ${isHidden ? 'bx-chevron-down' : 'bx-chevron-up'} me-1"></i>${isHidden ? tt('common.show', 'Afficher') : tt('common.hide', 'Masquer')}`;
    return;
  }

  const processBtn = e.target.closest('.process-reset-btn');
  if (processBtn) {
    try {
      await processResetRequest(processBtn);
    } catch (err) {
      console.error(err);
      showAlert(err.message || tt('common.update', 'Mise à jour impossible.'), 'danger');
    }
    return;
  }

  const copyBtn = e.target.closest('.copy-reset-mail-btn');
  if (copyBtn) {
    try {
      const subject = copyBtn.dataset.subject || 'Réinitialisation TactiBoard';
      const body = copyBtn.dataset.body || '';
      await navigator.clipboard.writeText(`Subject: ${subject}

${body}`);
      showAlert(tt('users.reset_mail_copied','Mot de passe temporaire généré et email copié.'));
    } catch (err) {
      console.error(err);
      showAlert(err.message || 'Clipboard error', 'danger');
    }
  }
});

createRoleSelect?.addEventListener('change', toggleCreateTeamState);
generatePasswordBtn?.addEventListener('click', () => {
  if (!createForm) return;
  createForm.password.value = randomPassword();
});

bindFormSubmit('user-create-form', async fd => {
  const payload = Object.fromEntries(fd.entries());
  const role = payload.role || 'player';
  const teamId = role === 'admin' ? null : Number(payload.requested_team_id || '') || null;
  if (role !== 'admin' && !teamId) throw new Error('Choisis une équipe pour ce rôle.');

  const { data, error } = await supabase.rpc('admin_create_managed_user', {
    p_email: String(payload.email || '').trim().toLowerCase(),
    p_password: String(payload.password || ''),
    p_full_name: String(payload.full_name || '').trim(),
    p_role: role,
    p_requested_team_id: teamId
  });
  if (error) throw error;

  createForm.reset();
  createForm.password.value = randomPassword();
  toggleCreateTeamState();
  showAlert(data?.email ? `Utilisateur créé avec succès : ${data.email}` : 'Utilisateur créé avec succès.');
  await loadUsers();
});

await ensureTeamOptions();
createForm && (createForm.password.value = randomPassword());
toggleCreateTeamState();
await Promise.all([loadUsers(), loadPasswordResetRequests()]);
document.addEventListener('app:language-changed', () => location.reload());
