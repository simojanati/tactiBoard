
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
const roleDetails = document.getElementById('profile-role-details');
const profileJerseyNumber = document.getElementById('profile-jersey-number');
const profilePrimaryPosition = document.getElementById('profile-primary-position');
const profileSecondaryPosition = document.getElementById('profile-secondary-position');
const profileCoachRole = document.getElementById('profile-coach-role');
const profileCoachEmail = document.getElementById('profile-coach-email');

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

function renderLinkedDetails() {
  if (!roleDetails) return;
  if (!linked) {
    roleDetails.innerHTML = `<div class="col-12 text-muted">${tt('profile.no_role_info','Aucune information liée au rôle.')}</div>`;
    return;
  }
  if (ctx.role === 'player') {
    roleDetails.innerHTML = `
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.jersey_number','Numéro')}</div><div class="fw-semibold">${escapeHtml(linked.jersey_number || '—')}</div></div></div>
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.primary_position','Poste principal')}</div><div class="fw-semibold">${escapeHtml(linked.primary_position || '—')}</div></div></div>
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.secondary_position','Poste secondaire')}</div><div class="fw-semibold">${escapeHtml(linked.secondary_position || '—')}</div></div></div>
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.status','Statut')}</div><div class="fw-semibold">${escapeHtml(linked.status || 'active')}</div></div></div>`;
  } else if (ctx.role === 'coach') {
    roleDetails.innerHTML = `
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.coach_role','Fonction coach')}</div><div class="fw-semibold">${escapeHtml(linked.role || 'Coach')}</div></div></div>
      <div class="col-md-4"><div class="profile-info-card"><div class="small text-muted">${tt('profile.coach_email','Email coach')}</div><div class="fw-semibold">${escapeHtml(linked.email || ctx.user?.email || '—')}</div></div></div>`;
  } else {
    roleDetails.innerHTML = `<div class="col-12 text-muted">${tt('profile.admin_scope','Accès administrateur global.')}</div>`;
  }
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
  profileEmail.value = email;
  profileRoleInput.value = ROLE_LABELS[ctx.role] || ctx.role;
  profileMemberSince.value = formatDate(ctx.user?.created_at);
  document.getElementById('profile-full-name').value = p.full_name || ctx.fullName || '';
  profileTeamLine.innerHTML = team ? `<div class="d-flex align-items-center gap-2">${teamLogo(team.logo_url, team.name)}<span class="fw-semibold">${escapeHtml(team.name)}</span></div>` : `<span class="text-muted">${tt('profile.no_linked_team','Aucune équipe liée')}</span>`;
  if (profileJerseyNumber) profileJerseyNumber.value = linked?.jersey_number ?? '';
  if (profilePrimaryPosition) profilePrimaryPosition.value = linked?.primary_position || '';
  if (profileSecondaryPosition) profileSecondaryPosition.value = linked?.secondary_position || '';
  if (profileCoachRole) profileCoachRole.value = linked?.role || '';
  if (profileCoachEmail) profileCoachEmail.value = linked?.email || ctx.user?.email || '';
  toggleRoleEditFields();
  renderLinkedDetails();
}

async function loadLinkedRoleData() {
  if (ctx.role === 'player') {
    const { data, error } = await supabase.from('players').select('id,profile_id,image_url,full_name,jersey_number,primary_position,secondary_position,status,teams(name,logo_url)').eq('profile_id', ctx.user.id).maybeSingle();
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
    const { data: profile, error } = await supabase.from('profiles').select('id,full_name,email,role,avatar_url').eq('id', ctx.user.id).maybeSingle();
    if (error) throw error;
    ctx.profile = profile || ctx.profile;
    await loadLinkedRoleData();
    paintProfile();
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
        secondary_position: profileSecondaryPosition?.value?.trim() || null
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
    const userboxName = document.querySelector('#user-box .fw-semibold');
    if (userboxName) userboxName.textContent = full_name;
    if (linked) {
      linked.full_name = full_name;
      if (ctx.role === 'player') {
        linked.jersey_number = profileJerseyNumber?.value?.trim() || null;
        linked.primary_position = profilePrimaryPosition?.value?.trim() || null;
        linked.secondary_position = profileSecondaryPosition?.value?.trim() || null;
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
