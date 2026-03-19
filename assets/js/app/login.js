
import { firstAllowedPage, getSession, signInWithPassword, signUpWithPassword } from './auth.js';
import { clearAlert, showAlert } from './common.js';
import { initI18n, t, setLanguage } from './i18n.js';

await initI18n();

const signInForm = document.getElementById('login-form');
const signUpForm = document.getElementById('register-form');
const toggleBtns = document.querySelectorAll('[data-auth-tab]');
const loginPane = document.getElementById('login-pane');
const registerPane = document.getElementById('register-pane');

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

toggleBtns.forEach(btn => btn.addEventListener('click', () => switchTab(btn.dataset.authTab)));

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
    role: fd.get('role')
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

redirectIfLoggedIn();

(function injectLoginLanguageSwitcher(){ const box=document.createElement('div'); box.className='position-fixed top-0 end-0 p-3'; box.innerHTML=`<select class="form-select form-select-sm" style="width:88px"><option value="fr" ${localStorage.getItem('tactiboard_lang')==='en'?'':'selected'}>${t('lang.fr')}</option><option value="en" ${localStorage.getItem('tactiboard_lang')==='en'?'selected':''}>${t('lang.en')}</option></select>`; box.querySelector('select').addEventListener('change',e=>setLanguage(e.target.value)); document.body.appendChild(box); })();
