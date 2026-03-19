
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
  'ticket-detail.html': ['admin','coach','player']
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
    .select('id, full_name, email, role, avatar_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error && !String(error.message || '').includes('relation')) {
    throw error;
  }
  profile = data || null;
  if (!profile) {
    const fallbackName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Utilisateur';
    const fallbackRole = user.user_metadata?.role || 'player';
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: fallbackName, role: fallbackRole }, { onConflict: 'id' })
      .select('id, full_name, email, role, avatar_url')
      .maybeSingle();
    if (!insertError) profile = inserted;
  }

  cachedContext = {
    session,
    user,
    profile,
    role: profile?.role || user.user_metadata?.role || 'player',
    fullName: profile?.full_name || user.user_metadata?.full_name || user.email || 'Utilisateur'
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
  const user = data?.user || data?.session?.user || null;
  if (user) {
    saveAuthCache({
      role: user.user_metadata?.role || 'player',
      fullName: user.user_metadata?.full_name || user.email || 'Utilisateur',
      user
    });
  }
  cachedContext = null;
  return data;
}

export async function signUpWithPassword({ email, password, fullName, role }) {
  const path = location.pathname || '/';
  const basePath = path.includes('/pages/') ? path.split('/pages/')[0] : path.replace(/[^/]*$/, '');
  const redirectBase = `${location.origin}${basePath.endsWith('/') ? basePath : `${basePath}/`}`;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${redirectBase}pages/login.html`,
      data: { full_name: fullName, role }
    }
  });
  if (error) throw error;
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
