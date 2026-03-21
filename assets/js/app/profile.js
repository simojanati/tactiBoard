
import { activateMenu, escapeHtml, formatDate, setAppTitle, showAlert, supabase, uploadAvatar, syncLinkedAvatar } from './common.js';
import { ROLE_LABELS, requireAuthForPage } from './auth.js';
import './page-init.js';

setAppTitle('Mon profil');
activateMenu('profile');

const avatarImg = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileRole = document.getElementById('profile-role');
const profileTeamBadge = document.getElementById('profile-team-badge');
const profileEmailBadge = document.getElementById('profile-email-badge');
const profileCreatedAt = document.getElementById('profile-created-at');
const profileEmail = document.getElementById('profile-email');
const profileRoleInput = document.getElementById('profile-role-input');
const profileTeamLine = document.getElementById('profile-team-line');
const profileMemberSince = document.getElementById('profile-member-since');
const profileForm = document.getElementById('profile-form');
const avatarForm = document.getElementById('avatar-form');
const profileActiveDot = document.getElementById('profile-active-dot');
const profileJerseyNumber = document.getElementById('profile-jersey-number');
const profilePrimaryPosition = document.getElementById('profile-primary-position');
const profileSecondaryPosition = document.getElementById('profile-secondary-position');
const profileCaptainRoleDisplay = document.getElementById('profile-captain-role-display');
const profileAge = document.getElementById('profile-age');
const profileHeightCm = document.getElementById('profile-height-cm');
const profileWeightKg = document.getElementById('profile-weight-kg');
const profileCoachRole = document.getElementById('profile-coach-role');
const profileCoachEmail = document.getElementById('profile-coach-email');
const passwordForm = document.getElementById('password-form');
const currentPasswordInput = document.getElementById('current-password');
const newPasswordInput = document.getElementById('new-password');
const confirmPasswordInput = document.getElementById('confirm-password');

function syncPasswordToggle(group) {
  const input = group?.querySelector('.password-toggle-input');
  const btn = group?.querySelector('.password-toggle-btn');
  const icon = btn?.querySelector('i');
  if (!input || !btn) return;
  const visible = input.type === 'text';
  btn.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  btn.setAttribute('title', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
  btn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  if (icon) icon.className = visible ? 'bx bx-show' : 'bx bx-hide';
}

function initPasswordToggles() {
  document.querySelectorAll('.form-password-toggle').forEach(group => {
    const input = group.querySelector('.password-toggle-input');
    const btn = group.querySelector('.password-toggle-btn');
    if (!input || !btn) return;
    syncPasswordToggle(group);
    if (btn.dataset.toggleBound === '1') return;
    btn.dataset.toggleBound = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      input.type = input.type === 'password' ? 'text' : 'password';
      syncPasswordToggle(group);
      input.focus({ preventScroll: true });
      const len = input.value?.length || 0;
      try { input.setSelectionRange(len, len); } catch {}
    });
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.password-toggle-btn');
  if (!btn) return;
  const group = btn.closest('.form-password-toggle');
  const input = group?.querySelector('.password-toggle-input');
  if (!group || !input) return;
  e.preventDefault();
  e.stopPropagation();
  input.type = input.type === 'password' ? 'text' : 'password';
  syncPasswordToggle(group);
  input.focus({ preventScroll: true });
  const len = input.value?.length || 0;
  try { input.setSelectionRange(len, len); } catch {}
}, true);

function tt(key, fallback) {
  return window.t ? window.t(key, fallback) : fallback;
}

function toggleRoleEditFields() {
  document.querySelectorAll('.profile-player-field').forEach(el => el.classList.toggle('d-none', ctx?.role !== 'player'));
  document.querySelectorAll('.profile-coach-field').forEach(el => el.classList.toggle('d-none', ctx?.role !== 'coach'));
}

let ctx = null;
let linked = null;

function teamLogo(url, name='Équipe') {
  const src = url || '../assets/img/branding/team-logo-placeholder.png';
  return `<img src="${src}" alt="${escapeHtml(name)}" class="team-logo-sm">`;
}

function captainIcon(value, sizeClass = '') {
  const map = { captain_1: '../assets/img/captains/captaine1.png', captain_2: '../assets/img/captains/captaine2.png', captain_3: '../assets/img/captains/captaine3.png' };
  const labels = {
    captain_1: tt('players.captain_1', 'Capitaine 1'),
    captain_2: tt('players.captain_2', 'Capitaine 2'),
    captain_3: tt('players.captain_3', 'Capitaine 3')
  };
  const src = map[value];
  if (!src) return '<span class="text-muted">—</span>';
  const title = labels[value] || '';
  return `<span class="captain-icon-wrap" title="${escapeHtml(title)}"><img src="${src}" alt="${escapeHtml(title || 'Captain')}" class="captain-icon ${sizeClass}"></span>`;
}


function paintProfile() {
  const p = ctx.profile || {};
  const email = ctx.user?.email || p.email || '—';
  const team = linked?.teams || null;
  avatarImg.src = linked?.image_url || p.avatar_url || '../assets/img/branding/avatar-placeholder.png';
  profileName.textContent = p.full_name || ctx.fullName || 'Utilisateur';
  profileRole.textContent = ROLE_LABELS[ctx.role] || ctx.role;
  profileTeamBadge.textContent = team?.name || tt('profile.no_team','Aucune équipe');
  profileEmailBadge.textContent = email;
  profileCreatedAt.textContent = `${tt('profile.account_created','Compte créé')} : ${formatDate(ctx.user?.created_at)}`;
  const isActive = p.is_active !== false;
  profileActiveDot?.classList.toggle('d-none', !isActive);
  profileEmail.value = email;
  profileRoleInput.value = ROLE_LABELS[ctx.role] || ctx.role;
  profileMemberSince.value = formatDate(ctx.user?.created_at);
  document.getElementById('profile-full-name').value = p.full_name || ctx.fullName || '';
  profileTeamLine.innerHTML = team ? `<div class="d-flex align-items-center gap-2">${teamLogo(team.logo_url, team.name)}<span class="fw-semibold">${escapeHtml(team.name)}</span></div>` : `<span class="text-muted">${tt('profile.no_linked_team','Aucune équipe liée')}</span>`;
  if (profileJerseyNumber) profileJerseyNumber.value = linked?.jersey_number ?? '';
  if (profilePrimaryPosition) profilePrimaryPosition.value = linked?.primary_position || '';
  if (profileSecondaryPosition) profileSecondaryPosition.value = linked?.secondary_position || '';
  if (profileCaptainRoleDisplay) profileCaptainRoleDisplay.innerHTML = captainIcon(linked?.captain_role, 'captain-icon-lg');
  if (profileAge) profileAge.value = linked?.age ?? '';
  if (profileHeightCm) profileHeightCm.value = linked?.height_cm ?? '';
  if (profileWeightKg) profileWeightKg.value = linked?.weight_kg ?? '';
  if (profileCoachRole) profileCoachRole.value = linked?.role || '';
  if (profileCoachEmail) profileCoachEmail.value = linked?.email || ctx.user?.email || '';
  toggleRoleEditFields();
}

async function loadLinkedRoleData() {
  if (ctx.role === 'player') {
    const { data, error } = await supabase.from('players').select('id,profile_id,image_url,full_name,jersey_number,primary_position,secondary_position,status,captain_role,age,height_cm,weight_kg,teams(name,logo_url)').eq('profile_id', ctx.user.id).maybeSingle();
    if (error) throw error;
    linked = data || null;
  } else if (ctx.role === 'coach') {
    const { data, error } = await supabase.from('coaches').select('id,profile_id,image_url,full_name,role,email,teams(name,logo_url)').eq('profile_id', ctx.user.id).maybeSingle();
    if (error) throw error;
    linked = data || null;
  } else {
    linked = null;
  }
}

(async () => {
  ctx = await requireAuthForPage();
  if (!ctx) return;
  try {
    const { data: profile, error } = await supabase.from('profiles').select('id,full_name,email,role,avatar_url,is_active').eq('id', ctx.user.id).maybeSingle();
    if (error) throw error;
    ctx.profile = profile || ctx.profile;
    await loadLinkedRoleData();
    paintProfile();
    initPasswordToggles();
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('profile.load_failed','Impossible de charger le profil.'), 'danger');
  }
})();

profileForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const full_name = document.getElementById('profile-full-name').value.trim();
    const profilePayload = { full_name };
    const updates = [supabase.from('profiles').update(profilePayload).eq('id', ctx.user.id)];

    if (ctx.role === 'player' && linked?.id) {
      const playerPayload = {
        full_name,
        jersey_number: profileJerseyNumber?.value?.trim() || null,
        primary_position: profilePrimaryPosition?.value?.trim() || null,
        secondary_position: profileSecondaryPosition?.value?.trim() || null,
        age: profileAge?.value === '' ? null : Number(profileAge?.value),
        height_cm: profileHeightCm?.value === '' ? null : Number(profileHeightCm?.value),
        weight_kg: profileWeightKg?.value === '' ? null : Number(profileWeightKg?.value)
      };
      updates.push(supabase.from('players').update(playerPayload).eq('id', linked.id));
    }

    if (ctx.role === 'coach' && linked?.id) {
      const coachPayload = {
        full_name,
        role: profileCoachRole?.value?.trim() || null,
        email: profileCoachEmail?.value?.trim() || null
      };
      updates.push(supabase.from('coaches').update(coachPayload).eq('id', linked.id));
    }

    const results = await Promise.all(updates);
    const failed = results.find(r => r.error);
    if (failed?.error) throw failed.error;

    ctx.profile.full_name = full_name;
    ctx.fullName = full_name;
    try {
      const cached = JSON.parse(localStorage.getItem('pbm_auth_cache') || '{}');
      cached.fullName = full_name;
      localStorage.setItem('pbm_auth_cache', JSON.stringify(cached));
    } catch {}
    const userboxNames = document.querySelectorAll('#user-box .userbox-name');
    if (userboxNames.length) {
      const captainHtml = ctx.role === 'player' ? captainIcon(linked?.captain_role, 'captain-icon-sm') : '';
      userboxNames.forEach(el => { el.innerHTML = `${full_name}${captainHtml}`; });
    }
    if (linked) {
      linked.full_name = full_name;
      if (ctx.role === 'player') {
        linked.jersey_number = profileJerseyNumber?.value?.trim() || null;
        linked.primary_position = profilePrimaryPosition?.value?.trim() || null;
        linked.secondary_position = profileSecondaryPosition?.value?.trim() || null;
        linked.age = profileAge?.value === '' ? null : Number(profileAge?.value);
        linked.height_cm = profileHeightCm?.value === '' ? null : Number(profileHeightCm?.value);
        linked.weight_kg = profileWeightKg?.value === '' ? null : Number(profileWeightKg?.value);
      }
      if (ctx.role === 'coach') {
        linked.role = profileCoachRole?.value?.trim() || null;
        linked.email = profileCoachEmail?.value?.trim() || null;
      }
    }
    paintProfile();
    showAlert(tt('profile.updated','Profil mis à jour.'));
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('profile.update_failed','Impossible de mettre à jour le profil.'), 'danger');
  }
});

avatarForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = document.getElementById('avatar-file')?.files?.[0];
  if (!file) return showAlert(tt('profile.choose_image','Choisis une image.'), 'warning');
  const btn = document.getElementById('avatar-submit-btn');
  const prev = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tt('profile.updating','Mise à jour...')}`;
  try {
    const avatar_url = await uploadAvatar(file, ctx.user.id);
    const { error } = await supabase.from('profiles').update({ avatar_url }).eq('id', ctx.user.id);
    if (error) throw error;
    if (linked?.id && ['player','coach'].includes(ctx.role)) {
      await syncLinkedAvatar({ table: ctx.role === 'player' ? 'players' : 'coaches', rowId: linked.id, profileId: ctx.user.id, imageUrl: avatar_url });
      linked.image_url = avatar_url;
    }
    ctx.profile.avatar_url = avatar_url;
    avatarImg.src = avatar_url;
    const userboxAvatar = document.querySelector('#user-box .userbox-avatar');
    if (userboxAvatar) userboxAvatar.src = avatar_url;
    try {
      const cached = JSON.parse(localStorage.getItem('pbm_auth_cache') || '{}');
      cached.avatar_url = avatar_url;
      localStorage.setItem('pbm_auth_cache', JSON.stringify(cached));
    } catch {}
    showAlert(tt('profile.avatar_updated','Photo mise à jour.'));
    avatarForm.reset();
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('profile.avatar_update_failed','Impossible de mettre à jour la photo.'), 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = prev;
  }
});


passwordForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('password-save-btn');
  const previous = btn?.innerHTML || '';
  try {
    const currentPassword = currentPasswordInput?.value || '';
    const newPassword = newPasswordInput?.value || '';
    const confirmPassword = confirmPasswordInput?.value || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new Error(tt('profile.password_fill_all', 'Remplis tous les champs du mot de passe.'));
    }
    if (newPassword.length < 6) {
      throw new Error(tt('profile.password_min_length', 'Le nouveau mot de passe doit contenir au moins 6 caractères.'));
    }
    if (newPassword !== confirmPassword) {
      throw new Error(tt('profile.password_mismatch', 'La confirmation du nouveau mot de passe ne correspond pas.'));
    }
    if (currentPassword === newPassword) {
      throw new Error(tt("profile.password_same", "Le nouveau mot de passe doit être différent de l'ancien."));
    }

    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${tt('profile.password_updating', 'Mise à jour...')}`;
    }

    const email = ctx?.user?.email || ctx?.profile?.email || '';
    if (!email) throw new Error(tt('profile.password_no_email', 'Email utilisateur introuvable.'));

    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (verifyError) {
      throw new Error(tt('profile.password_current_invalid', 'Le mot de passe actuel est incorrect.'));
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
    if (updateError) throw updateError;

    passwordForm.reset();
    showAlert(tt('profile.password_updated', 'Mot de passe mis à jour avec succès.'));
  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('profile.password_update_failed', 'Impossible de mettre à jour le mot de passe.'), 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = previous;
    }
  }
});
