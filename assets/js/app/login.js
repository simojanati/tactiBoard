import { firstAllowedPage, getSession, signInWithPassword, signUpWithPassword } from './auth.js';
import { clearAlert, fetchTeamsOptions, showAlert, supabase, getThemeMode, setThemeMode } from './common.js';
import { initI18n, t, setLanguage } from './i18n.js';
import { injectLoginInstallButton, initPwaUi, registerServiceWorker } from './pwa.js';

await initI18n();
initPwaUi();
registerServiceWorker();

const signInForm = document.getElementById('login-form');
const signUpForm = document.getElementById('register-form');
const toggleBtns = document.querySelectorAll('[data-auth-tab]');
const loginPane = document.getElementById('login-pane');
const registerPane = document.getElementById('register-pane');
const registerTeamSelect = document.getElementById('register-team-select');
const forgotLink = document.getElementById('forgot-password-link');
const forgotModal = document.getElementById('forgot-password-modal');
const forgotForm = document.getElementById('forgot-password-form');
const forgotClose = document.getElementById('forgot-password-close');
const forgotCancel = document.getElementById('forgot-password-cancel');
const forgotFeedback = document.getElementById('forgot-password-feedback');

function initPasswordToggles() {
  document.querySelectorAll('.form-password-toggle').forEach(group => {
    const input = group.querySelector('.password-toggle-input');
    const btn = group.querySelector('.password-toggle-btn');
    const icon = btn?.querySelector('i');
    if (!input || !btn) return;
    const sync = () => {
      const visible = input.type === 'text';
      btn.setAttribute('aria-label', visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe');
      if (icon) icon.className = visible ? 'bx bx-show' : 'bx bx-hide';
    };
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      sync();
      input.focus({ preventScroll: true });
      const len = input.value?.length || 0;
      try { input.setSelectionRange(len, len); } catch {}
    });
    sync();
  });
}

async function redirectIfLoggedIn() {
  const session = await getSession();
  if (session?.user) {
    const role = session.user.user_metadata?.role || 'player';
    location.href = firstAllowedPage(role);
  }
}

function switchTab(tab) {
  const isLogin = tab === 'login';
  loginPane.classList.toggle('d-none', !isLogin);
  registerPane.classList.toggle('d-none', isLogin);
  toggleBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === tab));
  clearAlert();
}

function setForgotFeedback(message = '', type = 'danger') {
  if (!forgotFeedback) return;
  if (!message) {
    forgotFeedback.className = 'alert d-none';
    forgotFeedback.textContent = '';
    return;
  }
  forgotFeedback.className = `alert alert-${type}`;
  forgotFeedback.textContent = message;
}

function openForgotModal() {
  setForgotFeedback('');
  forgotModal?.classList.remove('d-none');
  setTimeout(() => forgotForm?.querySelector('input[name="email"]')?.focus(), 20);
}

function closeForgotModal() {
  forgotModal?.classList.add('d-none');
  forgotForm?.reset();
  setForgotFeedback('');
}

toggleBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.authTab)));
forgotLink?.addEventListener('click', openForgotModal);
forgotClose?.addEventListener('click', closeForgotModal);
forgotCancel?.addEventListener('click', closeForgotModal);
forgotModal?.addEventListener('click', e => {
  if (e.target === forgotModal) closeForgotModal();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && forgotModal && !forgotModal.classList.contains('d-none')) closeForgotModal();
});

signInForm?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert();
  const fd = new FormData(signInForm);
  const btn = signInForm.querySelector('[type="submit"]');
  const original = btn?.innerHTML;
  document.body.classList.add('login-loading');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-center"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${t('login.logging_in','Connexion...')}</span></span>`;
  }
  try {
    await signInWithPassword(fd.get('email'), fd.get('password'));
    showAlert(t('login.success','Connexion réussie. Redirection...'), 'success');
    setTimeout(() => location.href = 'index.html', 250);
  } catch (err) {
    console.error(err);
    showAlert(err.message || t('login.failed','Connexion impossible.'), 'danger');
  } finally {
    document.body.classList.remove('login-loading');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
});

signUpForm?.addEventListener('submit', async e => {
  e.preventDefault();
  clearAlert();
  const fd = new FormData(signUpForm);
  const payload = {
    fullName: fd.get('full_name'),
    email: fd.get('email'),
    password: fd.get('password'),
    role: fd.get('role'),
    teamId: fd.get('team_id') || null
  };
  const btn = signUpForm.querySelector('[type="submit"]');
  const original = btn?.innerHTML;
  document.body.classList.add('login-loading');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="btn-loading-center"><span class="spinner-border spinner-border-sm" aria-hidden="true"></span><span>${t('login.creating','Création...')}</span></span>`;
  }
  try {
    if (payload.role === 'admin') throw new Error(t('login.role_no_admin','Le rôle admin n\'est pas disponible à l\'inscription.'));
    await signUpWithPassword(payload);
    showAlert(t('login.pending_created','Inscription envoyée. Elle sera validée par les admins sous 24h maximum.'), 'success');
    signUpForm.reset();
    registerPane.classList.remove('d-none');
    loginPane.classList.add('d-none');
    toggleBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.authTab === 'register'));
  } catch (err) {
    console.error(err);
    showAlert(err.message || t('login.create_failed','Création du compte impossible.'), 'danger');
  } finally {
    document.body.classList.remove('login-loading');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
});

forgotForm?.addEventListener('submit', async e => {
  e.preventDefault();
  const fd = new FormData(forgotForm);
  const btn = forgotForm.querySelector('[type="submit"]');
  const original = btn?.innerHTML;
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${t('common.saving','Envoi...')}`;
  }
  try {
    setForgotFeedback('');
    const { error } = await supabase.rpc('request_password_reset', {
      p_email: String(fd.get('email') || '').trim().toLowerCase()
    });
    if (error) throw error;
    closeForgotModal();
    showAlert(t('login.forgot_sent','La demande a été transmise à l\'administrateur.'), 'success');
  } catch (err) {
    console.error(err);
    const msg = err?.message || t('login.forgot_failed','Impossible d\'envoyer la demande.');
    setForgotFeedback(msg, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = original;
    }
  }
});

initPasswordToggles();
redirectIfLoggedIn();

(function injectLoginLanguageSwitcher(){ const box=document.createElement('div'); box.className='position-fixed top-0 end-0 p-3'; box.innerHTML=`<select class="form-select form-select-sm" style="width:88px"><option value="fr" ${localStorage.getItem('tactiboard_lang')==='en'?'':'selected'}>${t('lang.fr')}</option><option value="en" ${localStorage.getItem('tactiboard_lang')==='en'?'selected':''}>${t('lang.en')}</option></select>`; box.querySelector('select').addEventListener('change',e=>setLanguage(e.target.value)); document.body.appendChild(box); })();

if (registerTeamSelect) {
  try { await fetchTeamsOptions(registerTeamSelect, true); } catch (e) { console.warn('Unable to load teams for signup', e); }
}


(function injectLoginThemeSwitcher(){
  const box = document.createElement('div');
  box.className = 'position-fixed top-0 end-0 p-3 d-flex gap-2 auth-floating-controls';
  const renderThemeButton = () => {
    const mode = getThemeMode();
    const isDark = mode === 'dark';
    return `<button type="button" class="btn btn-sm btn-outline-secondary auth-theme-toggle" title="${isDark ? t('theme.switch_to_light','Passer au mode clair') : t('theme.switch_to_dark','Passer au mode sombre')}"><i class="bx ${isDark ? 'bx-sun' : 'bx-moon'}"></i></button>`;
  };
  box.innerHTML = `${renderThemeButton()}<select class="form-select form-select-sm" style="width:88px"><option value="fr" ${localStorage.getItem('tactiboard_lang')==='en'?'':'selected'}>${t('lang.fr')}</option><option value="en" ${localStorage.getItem('tactiboard_lang')==='en'?'selected':''}>${t('lang.en')}</option></select>`;
  box.querySelector('select').addEventListener('change',e=>setLanguage(e.target.value));
  box.querySelector('.auth-theme-toggle')?.addEventListener('click',()=>setThemeMode(getThemeMode()==='dark'?'light':'dark'));
  document.addEventListener('app:theme-changed', () => {
    const next = renderThemeButton();
    const holder = box.querySelector('.auth-theme-toggle');
    if (holder) holder.outerHTML = next;
    box.querySelector('.auth-theme-toggle')?.addEventListener('click',()=>setThemeMode(getThemeMode()==='dark'?'light':'dark'));
  });
  document.body.appendChild(box);
})();


injectLoginInstallButton();
