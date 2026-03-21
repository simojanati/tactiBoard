import { activateMenu, escapeHtml, setAppTitle, supabase } from './common.js';
import { getPortalContext, renderPortalEmpty } from './portal-common.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.my_quizzes', 'Mes quiz'));
activateMenu('my-quizzes');
const host = document.getElementById('portal-content');
const titleEl = document.getElementById('portal-title');
const subtitleEl = document.getElementById('portal-subtitle');
const ctx = await getPortalContext();

if (!ctx.teamId) {
  renderPortalEmpty(host, tt('common.quiz', 'Quiz'), tt('portal.no_team_linked', "Le compte n'est pas encore lié à une équipe."));
} else {
  titleEl.textContent = `${tt('page.my_quizzes','Mes quiz')} · ${ctx.teamName || ''}`;
  subtitleEl.textContent = tt('my_quizzes.subtitle', 'Révise les consignes tactiques et valide ta compréhension.');

  const [{ data: quizzes, error: quizzesError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase.from('quizzes').select('id,title,description,status,tactic_id,team_id,time_limit_minutes,tactics(title),quiz_questions(id)').eq('team_id', ctx.teamId).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('quiz_attempts').select('id,quiz_id,score,total_questions,submitted_at').eq('profile_id', ctx.user.id).order('submitted_at', { ascending: false })
  ]);
  if (quizzesError) throw quizzesError;
  if (attemptsError) throw attemptsError;

  const latestByQuiz = new Map();
  const attemptsCountByQuiz = new Map();
  (attempts || []).forEach(attempt => {
    attemptsCountByQuiz.set(attempt.quiz_id, (attemptsCountByQuiz.get(attempt.quiz_id) || 0) + 1);
    if (!latestByQuiz.has(attempt.quiz_id)) latestByQuiz.set(attempt.quiz_id, attempt);
  });

  if (!quizzes?.length) {
    renderPortalEmpty(host, tt('common.quiz', 'Quiz'), tt('my_quizzes.none_active', 'Aucun quiz actif pour ton équipe pour le moment.'));
  } else {
    host.innerHTML = `<div class="row">${quizzes.map(item => {
      const latest = latestByQuiz.get(item.id);
      const attemptsCount = attemptsCountByQuiz.get(item.id) || 0;
      const scorePct = latest ? Math.round(((latest.score || 0) / Math.max(latest.total_questions || 1, 1)) * 100) : null;
      const isPerfect = latest && latest.score >= latest.total_questions && latest.total_questions > 0;
      return `<div class="col-md-6 col-xl-4 mb-4"><div class="card h-100"><div class="card-body d-flex flex-column">
        <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
          <h5 class="mb-0">${escapeHtml(item.title || '')}</h5>
          <span class="badge bg-label-info">${item.quiz_questions?.length || 0} questions</span>
        </div>
        <div class="small text-muted mb-2">${escapeHtml(item.tactics?.title || tt('my_quizzes.general_team_quiz','Quiz général d’équipe'))}</div>
        <p class="text-muted flex-grow-1 mb-2">${escapeHtml(item.description || tt('quiz.no_description', 'Aucune description.'))}</p>
        <div class="small text-muted mb-3">${item.time_limit_minutes ? `${tt('quiz.timer', 'Timer')}: ${item.time_limit_minutes} min` : tt('my_quizzes.no_timer', 'Sans limite de temps')}</div>
        <div class="d-flex justify-content-between align-items-center mb-2">
          <span class="badge bg-label-${latest ? (isPerfect ? 'success' : 'secondary') : 'secondary'}">${latest ? (isPerfect ? `${tt('my_quizzes.last_score','Dernier score')}: ${latest.score}/${latest.total_questions}` : tt('my_quizzes.results_hidden', 'Résultats masqués jusqu’à 100%')) : tt('quiz.never_taken', 'Jamais passé')}</span>
          ${latest && isPerfect ? `<small class="text-muted">${scorePct}%</small>` : ''}
        </div>
        <div class="small text-muted mb-3">${window.t ? window.t('misc.attempts', 'Attempts') : 'Attempts'}: ${attemptsCount}</div>
        <a class="btn btn-outline-primary mt-auto" href="take-quiz.html?id=${item.id}">${isPerfect ? tt('quiz.review_attempt', 'Voir ma tentative') : (attemptsCount ? tt('my_quizzes.continue', 'Continuer le quiz') : tt('quiz.take', 'Passer le quiz'))}</a>
      </div></div></div>`;
    }).join('')}</div>`;
  }
}

document.addEventListener('app:language-changed', () => { try { location.reload(); } catch (e) { console.warn(e); } });
