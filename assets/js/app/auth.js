
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const cfg = window.APP_CONFIG;
export const supabase = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);

export const ROLE_LABELS = {
  admin: 'Admin',
  coach: 'Coach',
  player: 'Joueuse'
};

export const ROLE_PAGE_RULES = {
  'index.html': ['admin','coach','player'],
  'teams.html': ['admin'],
  'players.html': ['admin','coach'],
  'coaches.html': ['admin'],
  'tactics.html': ['admin','coach'],
  'tactical-board.html': ['admin','coach'],
  'tactic-detail.html': ['admin','coach','player'],
  'sessions.html': ['admin','coach'],
  'matches.html': ['admin','coach'],
  'match-detail.html': ['admin','coach','player'],
  'login.html': ['guest'],
  'player-links.html': ['admin'],
  'my-team.html': ['coach','player'],
  'my-tactics.html': ['player'],
  'my-sessions.html': ['player'],
  'my-matches.html': ['player'],
  'quizzes.html': ['admin','coach'],
  'my-quizzes.html': ['player'],
  'take-quiz.html': ['player'],
  'notifications.html': ['admin','coach','player'],
  'profile.html': ['admin','coach','player'],
  'my-tickets.html': ['coach','player'],
  'tickets.html': ['admin'],
  'ticket-detail.html': ['admin','coach','player'],
  'users.html': ['admin']
};

let cachedContext = null;
const AUTH_CACHE_KEY = 'pbm_auth_cache';

function saveAuthCache(ctx) {
  try {
    localStorage.setItem(AUTH_CACHE_KEY, JSON.stringify({
      role: ctx?.role || 'guest',
      fullName: ctx?.fullName || '',
      email: ctx?.user?.email || ctx?.profile?.email || ''
    }));
  } catch {}
}

export function readCachedAuth() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_CACHE_KEY) || 'null');
  } catch {
    return null;
  }
}

function clearAuthCache() {
  try { localStorage.removeItem(AUTH_CACHE_KEY); } catch {}
}

export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getUserContext(force = false) {
  if (cachedContext && !force) return cachedContext;
  const session = await getSession();
  if (!session?.user) {
    cachedContext = { session: null, user: null, profile: null, role: 'guest' };
    clearAuthCache();
    return cachedContext;
  }
  const user = session.user;
  let profile = null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, avatar_url, is_active, approved_at, approved_by_profile_id, requested_team_id')
    .eq('id', user.id)
    .maybeSingle();

  if (error && !String(error.message || '').includes('relation')) {
    throw error;
  }
  profile = data || null;
  if (!profile) {
    profile = {
      id: user.id,
      full_name: user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur',
      email: user.email || '',
      role: user.user_metadata?.role || 'player',
      avatar_url: null,
      is_active: false,
      approved_at: null,
      approved_by_profile_id: null,
      requested_team_id: user.user_metadata?.team_id || null
    };
  }

  cachedContext = {
    session,
    user,
    profile,
    role: profile?.role || user.user_metadata?.role || 'player',
    fullName: profile?.full_name || user.user_metadata?.full_name || user.email || 'Utilisateur',
    isActive: profile?.is_active !== false
  };
  saveAuthCache(cachedContext);
  return cachedContext;
}

export function canEdit(role) {
  return role === 'admin' || role === 'coach';
}

export function canAdmin(role) {
  return role === 'admin';
}

export async function requireAuthForPage() {
  const ctx = await getUserContext();
  const file = location.pathname.split('/').pop() || 'index.html';
  if (file === 'login.html') return ctx;
  if (!ctx.user) {
    location.href = 'login.html';
    return null;
  }
  if (file !== 'login.html' && ctx.profile && ctx.profile.is_active === false) {
    await signOut();
    return null;
  }
  const allowed = ROLE_PAGE_RULES[file] || ['admin'];
  if (!allowed.includes(ctx.role)) {
    const first = firstAllowedPage(ctx.role);
    location.href = first;
    return null;
  }
  return ctx;
}

export function firstAllowedPage(role) {
  if (role === 'admin') return 'index.html';
  if (role === 'coach') return 'index.html';
  if (role === 'player') return 'index.html';
  return 'login.html';
}

export async function signInWithPassword(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  cachedContext = null;
  const ctx = await getUserContext(true);
  if (ctx?.profile && ctx.profile.is_active === false) {
    await supabase.auth.signOut();
    clearAuthCache();
    cachedContext = null;
    throw new Error(window.t ? window.t('login.pending_signin_blocked', 'Ton inscription est en attente de validation par les admins.') : 'Account pending admin approval.');
  }
  const user = data?.user || data?.session?.user || null;
  if (user) {
    saveAuthCache({
      role: ctx?.role || user.user_metadata?.role || 'player',
      fullName: ctx?.fullName || user.user_metadata?.full_name || user.email || 'Utilisateur',
      user
    });
  }
  return data;
}


export async function signUpWithPassword({ email, password, fullName, role, teamId }) {
  const safeRole = role === 'admin' ? 'player' : role;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, role: safeRole, team_id: teamId ? Number(teamId) : null }
    }
  });
  if (error) throw error;

  const hasSession = !!(data?.session?.user || data?.user?.aud === 'authenticated');

  if (hasSession) {
    try {
      const { data: admins } = await supabase.from('profiles').select('id').eq('role', 'admin');
      const rows = (admins || []).map(admin => ({
        profile_id: admin.id,
        type: 'update',
        title: window.t ? window.t('notifications.signup_title', 'Nouvelle inscription en attente') : 'New pending registration',
        body: (window.t ? window.t('notifications.signup_body', 'Un nouvel utilisateur “{name}” attend la validation admin.') : 'New pending registration').replace('{name}', fullName || email),
        link_url: 'users.html'
      }));
      if (rows.length) await supabase.from('notifications').insert(rows);
    } catch (e) {
      console.warn('Signup admin notification failed:', e);
    }
  }

  await supabase.auth.signOut();
  cachedContext = null;
  clearAuthCache();
  return data;
}


export async function signOut() {
  await supabase.auth.signOut();
  cachedContext = null;
  clearAuthCache();
  location.href = 'login.html';
}

export async function waitForAuthReady() {
  return new Promise(resolve => {
    let settled = false;
    supabase.auth.getSession().then(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
      sub.subscription.unsubscribe();
    });
    setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 1200);
  });
}
