
import { activateMenu, escapeHtml, setAppTitle, showAlert, supabase } from './common.js';
import { canAdmin, getUserContext } from './auth.js';

const tt = (key, fallback='') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.users', 'Utilisateurs'));
activateMenu('users');

const ctx = await getUserContext();
if (!canAdmin(ctx.role)) location.href = 'index.html';

const host = document.getElementById('portal-content');
document.getElementById('portal-title').textContent = tt('page.users', 'Utilisateurs');
document.getElementById('portal-subtitle').textContent = tt('users.hero_sub', 'Gère l\'activation des inscriptions et l\'accès des utilisateurs.');

function statusBadge(user) {
  if (user.is_active === false) return `<span class="badge bg-label-warning">${tt('users.pending', 'En attente')}</span>`;
  return `<span class="badge bg-label-success">${tt('users.active', 'Actif')}</span>`;
}


async function ensureLinkedRoleRecord(user) {
  if (!user?.id || !user?.role || !user?.requested_team_id) return false;

  if (user.role === 'player') {
    const { data: existingPlayer, error: existingError } = await supabase
      .from('players')
      .select('id,profile_id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (existingError && !String(existingError.message || '').includes('multiple')) throw existingError;
    if (existingPlayer?.id) return false;

    const { error } = await supabase.from('players').insert({
      team_id: user.requested_team_id,
      profile_id: user.id,
      full_name: user.full_name || user.email || 'Player',
      status: 'active'
    });
    if (error) throw error;
    return true;
  }

  if (user.role === 'coach') {
    const { data: existingCoach, error: existingError } = await supabase
      .from('coaches')
      .select('id,profile_id')
      .eq('profile_id', user.id)
      .maybeSingle();
    if (existingError && !String(existingError.message || '').includes('multiple')) throw existingError;
    if (existingCoach?.id) return false;

    const { error } = await supabase.from('coaches').insert({
      team_id: user.requested_team_id,
      profile_id: user.id,
      full_name: user.full_name || user.email || 'Coach',
      email: user.email || '',
      role: 'Coach'
    });
    if (error) throw error;
    return true;
  }

  return false;
}

function buildApprovalMail(user) {
  const link = `${location.origin}${location.pathname.split('/pages/')[0]}/pages/login.html`;
  const subject = tt('users.approval_mail_subject', 'Validation de ton inscription TactiBoard');
  const body = tt('users.approval_mail_body', 'Bonjour {name},%0A%0ATon inscription TactiBoard a été validée.%0ATu peux maintenant te connecter ici : {link}%0A%0ABien cordialement.')
    .replace('{name}', user.full_name || user.email || 'Utilisateur')
    .replace('{link}', link);
  return `Subject: ${subject}\n\n${decodeURIComponent(body)}`;
}

async function loadUsers() {
  host.innerHTML = `<div class="text-muted">${tt('common.loading', 'Chargement...')}</div>`;
  const { data, error } = await supabase
    .from('profiles')
    .select('id,full_name,email,role,is_active,created_at,approved_at,requested_team_id,teams!profiles_requested_team_id_fkey(name)')
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
    ${data.map(user => `
      <tr>
        <td>${escapeHtml(user.full_name || '—')}</td>
        <td>${escapeHtml(user.email || '—')}</td>
        <td>${escapeHtml(user.role || '—')}</td>
        <td>${escapeHtml(user.teams?.name || '—')}</td>
        <td>${statusBadge(user)}</td>
        <td>${user.created_at ? new Date(user.created_at).toLocaleString() : '—'}</td>
        <td>${user.approved_at ? new Date(user.approved_at).toLocaleString() : '—'}</td>
        <td class="actions-cell">
          ${user.role !== 'admin' ? `<button class="btn btn-sm btn-outline-${user.is_active === false ? 'success' : 'warning'} user-toggle-btn" data-id="${user.id}" data-role="${escapeHtml(user.role || '')}" data-full-name="${escapeHtml(user.full_name || '')}" data-email="${escapeHtml(user.email || '')}" data-team-id="${user.requested_team_id || ''}" data-active="${user.is_active === false ? '0' : '1'}">${user.is_active === false ? tt('users.activate','Activer') : tt('users.deactivate','Désactiver')}</button>` : ''}
          <button class="btn btn-sm btn-outline-primary user-mail-btn" data-name="${escapeHtml(user.full_name || '')}" data-email="${escapeHtml(user.email || '')}" data-link="${location.origin}${location.pathname.split('/pages/')[0]}/pages/login.html">${tt('users.copy_mail','Copier mail')}</button>
        </td>
      </tr>
    `).join('')}
  </tbody></table></div></div>`;
}

host.addEventListener('click', async e => {
  const toggleBtn = e.target.closest('.user-toggle-btn');
  if (toggleBtn) {
    try {
      const isCurrentlyActive = toggleBtn.dataset.active === '1';
      const nextActive = !isCurrentlyActive;
      let linkedCreated = false;
      const payload = nextActive
        ? { is_active: true, approved_at: new Date().toISOString(), approved_by_profile_id: ctx.user.id }
        : { is_active: false };

      toggleBtn.disabled = true;
      if (nextActive) {
        const userRow = { id: toggleBtn.dataset.id, role: toggleBtn.dataset.role, full_name: toggleBtn.dataset.fullName, email: toggleBtn.dataset.email, requested_team_id: Number(toggleBtn.dataset.teamId || '') || null };
        linkedCreated = await ensureLinkedRoleRecord(userRow);
      }
      const { error } = await supabase.from('profiles').update(payload).eq('id', toggleBtn.dataset.id);
      if (error) throw error;

      showAlert(linkedCreated ? `${tt('users.updated','Utilisateur mis à jour.')} ${tt('users.linked_record_created','Fiche liée créée automatiquement.')}` : tt('users.updated','Utilisateur mis à jour.'));
      await loadUsers();
    } catch (err) {
      console.error(err);
      const msg = String(err?.message || '');
      showAlert(msg || tt('common.update','Mise à jour impossible.'), 'danger');
    } finally {
      toggleBtn.disabled = false;
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

await loadUsers();
document.addEventListener('app:language-changed', () => location.reload());
