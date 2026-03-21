import { activateMenu, escapeHtml, getQueryParam, setAppTitle, showAlert, supabase } from './common.js';
import { getPortalContext } from './portal-common.js';

setAppTitle('Quiz');
const tt = (k, f='') => window.t ? window.t(k, f) : f;
activateMenu('my-quizzes');
const ctx = await getPortalContext();
const quizId = getQueryParam('id');
const titleEl = document.getElementById('quiz-title');
const metaEl = document.getElementById('quiz-meta');
const questionsHost = document.getElementById('questions-host');
const form = document.getElementById('quiz-pass-form');
const timerCard = document.getElementById('timer-card');
const resultCard = document.getElementById('result-card');
const historyCard = document.getElementById('history-card');
const submitBtn = document.getElementById('submit-quiz-btn');
const formActions = document.getElementById('quiz-form-actions');
const startPanel = document.getElementById('quiz-start-panel');
const launchBtn = document.getElementById('launch-quiz-btn');
let countdownInterval = null;
let isSubmitting = false;
let quizStarted = false;
let quizFinished = false;
let abandonRecorded = false;

function scorePercent(attempt) {
  return Math.round(((attempt?.score || 0) / Math.max(attempt?.total_questions || 1, 1)) * 100);
}

function attemptBadgeClass(attempt) {
  const pct = scorePercent(attempt);
  if (pct === 100) return 'success';
  if (pct >= 70) return 'warning';
  return 'danger';
}

function renderAttemptReviewCard(attempt, answers = [], questionMap = new Map()) {
  const orderedAnswers = [...answers].sort((a, b) => (questionMap.get(a.question_id)?.order_index || 0) - (questionMap.get(b.question_id)?.order_index || 0));
  return `
    <div class="card border shadow-none mb-3">
      <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
        <div>
          <h6 class="mb-0">${tt('take_quiz.attempt_of', 'Tentative du')} ${escapeHtml(new Date(attempt.submitted_at).toLocaleString())}</h6>
          <small class="text-muted">${tt('take_quiz.score', 'Score')} ${attempt.score}/${attempt.total_questions} · ${scorePercent(attempt)}%</small>
        </div>
        <span class="badge bg-label-${attemptBadgeClass(attempt)}">${attempt.score}/${attempt.total_questions}</span>
      </div>
      <div class="card-body">
        ${orderedAnswers.map((answer, index) => {
          const question = questionMap.get(answer.question_id) || {};
          const selected = answer.selected_option ? escapeHtml(question[`option_${answer.selected_option}`] || `${tt('quiz.choice','Choix')} ${answer.selected_option}`) : `<span class="text-muted">${tt('quiz.no_answer', 'Aucune réponse')}</span>`;
          const correct = question.correct_option ? escapeHtml(question[`option_${question.correct_option}`] || `${tt('quiz.choice','Choix')} ${question.correct_option}`) : '—';
          return `
            <div class="mb-3 pb-3 ${index < orderedAnswers.length - 1 ? 'border-bottom' : ''}">
              <div class="fw-semibold mb-2">${index + 1}. ${escapeHtml(question.question_text || '')}</div>
              <div class="small mb-1">${tt('take_quiz.your_answer', 'Ta réponse')}: <span class="${answer.is_correct ? 'text-success' : 'text-danger'} fw-semibold">${selected}</span></div>
              <div class="small text-muted">${tt('take_quiz.correct_answer', 'Bonne réponse')}: ${correct}</div>
            </div>`;
        }).join('') || `<p class="text-muted mb-0">${tt('take_quiz.no_attempt_answers', 'Aucune réponse enregistrée pour cette tentative.')}</p>`}
      </div>
    </div>`;
}

function renderHistoryLocked() {
  historyCard.innerHTML = `<h6 class="mb-3">${tt('take_quiz.detailed_history', 'Historique détaillé')}</h6><p class="text-muted mb-0">${tt('take_quiz.history_hidden_until_perfect', "Le détail des tentatives restera masqué jusqu'à un score de 100%.")}</p>`;
}

function formatRemaining(totalSeconds) {
  const sec = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(sec / 60);
  const secs = sec % 60;
  return `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
}

function renderTimer(minutes, idle = false) {
  if (!timerCard) return;
  if (!minutes) {
    timerCard.innerHTML = `<h6 class="mb-3">${tt('quiz.timer', 'Timer')}</h6><p class="text-muted mb-0">${tt('take_quiz.no_timer', 'Aucune limite de temps pour ce quiz.')}</p>`;
    return;
  }
  timerCard.innerHTML = `
    <h6 class="mb-3">${tt('quiz.timer', 'Timer')}</h6>
    <div class="display-6 mb-2" id="quiz-timer-value">${formatRemaining(minutes * 60)}</div>
    <p class="text-muted mb-0" id="quiz-timer-help">${idle ? tt('take_quiz.timer_ready_to_start', 'Le chrono démarrera quand tu cliqueras sur Lancer.') : tt('take_quiz.timer_running', 'Le quiz sera soumis automatiquement à la fin du temps.')}</p>`;
}

function stopTimer() {
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}

function startTimer(minutes, onExpire) {
  stopTimer();
  renderTimer(minutes, false);
  if (!minutes) return;
  const valueEl = document.getElementById('quiz-timer-value');
  const helpEl = document.getElementById('quiz-timer-help');
  let remaining = Number(minutes) * 60;
  countdownInterval = setInterval(() => {
    remaining -= 1;
    if (valueEl) valueEl.textContent = formatRemaining(remaining);
    if (remaining <= 60 && valueEl) valueEl.classList.add('text-warning');
    if (remaining <= 10 && valueEl) valueEl.classList.add('text-danger');
    if (remaining <= 0) {
      stopTimer();
      if (helpEl) helpEl.textContent = tt('take_quiz.time_over', 'Temps écoulé. Envoi automatique en cours...');
      onExpire?.();
    }
  }, 1000);
}

function renderHistory(attempts = [], answersByAttempt = new Map(), questionMap = new Map()) {
  if (!attempts.length) {
    historyCard.innerHTML = `<h6 class="mb-3">${tt('take_quiz.detailed_history', 'Historique détaillé')}</h6><p class="text-muted mb-0">${tt('take_quiz.no_pass_yet', 'Aucun passage pour le moment.')}</p>`;
    return;
  }
  historyCard.innerHTML = `<h6 class="mb-3">${tt('take_quiz.detailed_history', 'Historique détaillé')}</h6>${attempts.map(a => renderAttemptReviewCard(a, answersByAttempt.get(a.id) || [], questionMap)).join('')}`;
}

async function recordAbandonAttempt(totalQuestions) {
  if (abandonRecorded || !quizStarted || quizFinished || !quizId || !ctx?.user?.id) return;
  abandonRecorded = true;
  try {
    const sessionRes = await supabase.auth.getSession();
    const accessToken = sessionRes?.data?.session?.access_token;
    if (!accessToken || !window.APP_CONFIG?.supabaseUrl || !window.APP_CONFIG?.supabasePublishableKey) return;
    await fetch(`${window.APP_CONFIG.supabaseUrl}/rest/v1/quiz_attempts`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.APP_CONFIG.supabasePublishableKey,
        'Authorization': `Bearer ${accessToken}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({
        quiz_id: Number(quizId),
        profile_id: ctx.user.id,
        score: 0,
        total_questions: totalQuestions || 0
      })
    });
  } catch (err) {
    console.warn('Quiz abandon attempt not recorded', err);
  }
}

if (!quizId || !ctx.teamId) {
  titleEl.textContent = tt('take_quiz.not_found', 'Quiz introuvable');
  metaEl.textContent = tt('take_quiz.not_available', "Le quiz demandé n'est pas disponible.");
  submitBtn.disabled = true;
  if (launchBtn) launchBtn.disabled = true;
} else {
  const [{ data: quiz, error: quizError }, { data: questions, error: questionsError }, { data: attempts, error: attemptsError }] = await Promise.all([
    supabase.from('quizzes').select('id,title,description,status,team_id,time_limit_minutes,tactics(title)').eq('id', quizId).eq('team_id', ctx.teamId).maybeSingle(),
    supabase.from('quiz_questions').select('*').eq('quiz_id', quizId).order('order_index'),
    supabase.from('quiz_attempts').select('id,score,total_questions,submitted_at').eq('quiz_id', quizId).eq('profile_id', ctx.user.id).order('submitted_at', { ascending: false })
  ]);
  if (quizError) throw quizError;
  if (questionsError) throw questionsError;
  if (attemptsError) throw attemptsError;

  if (!quiz || !questions?.length) {
    titleEl.textContent = tt('take_quiz.unavailable', 'Quiz indisponible');
    metaEl.textContent = tt('take_quiz.empty_or_forbidden', 'Ce quiz est vide ou non accessible.');
    submitBtn.disabled = true;
    if (launchBtn) launchBtn.disabled = true;
  } else {
    const questionMap = new Map((questions || []).map(q => [q.id, q]));
    const latestAttempt = attempts?.[0] || null;
    const isPerfect = latestAttempt && latestAttempt.score >= latestAttempt.total_questions && latestAttempt.total_questions > 0;
    const attemptIds = (attempts || []).map(a => a.id);
    let answersByAttempt = new Map();
    if (attemptIds.length) {
      const { data: answers, error: answersError } = await supabase
        .from('quiz_attempt_answers')
        .select('attempt_id,question_id,selected_option,is_correct')
        .in('attempt_id', attemptIds)
        .order('id', { ascending: true });
      if (answersError) throw answersError;
      (answers || []).forEach(answer => {
        if (!answersByAttempt.has(answer.attempt_id)) answersByAttempt.set(answer.attempt_id, []);
        answersByAttempt.get(answer.attempt_id).push(answer);
      });
    }

    titleEl.textContent = quiz.title || tt('common.quiz', 'Quiz');
    metaEl.textContent = `${quiz.tactics?.title || tt('take_quiz.general', 'Quiz général')} · ${questions.length} questions${quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} min` : ''}`;

    renderTimer(quiz.time_limit_minutes, true);

    if (isPerfect) {
      questionsHost.innerHTML = `<div class="alert alert-success mb-0">${tt('take_quiz.locked_success', 'Dernier score validé à 100%. Le quiz est verrouillé en repassage. Tu peux consulter les réponses de tes tentatives ci-dessous.')}</div>`;
      if (startPanel) startPanel.classList.add('d-none');
      formActions.innerHTML = `<a class="btn btn-outline-secondary" href="my-quizzes.html">${tt('common.back','Retour')}</a>`;
      submitBtn.classList.add('d-none');
      stopTimer();
      resultCard.innerHTML = `<h6 class="mb-3">${tt('take_quiz.current_result', 'Résultat actuel')}</h6><div class="display-6 mb-2">${latestAttempt.score}/${latestAttempt.total_questions}</div><p class="text-success mb-0">${tt('take_quiz.validated_100', 'Quiz validé à 100%. Nouveau passage désactivé.')}</p>`;
      renderHistory(attempts || [], answersByAttempt, questionMap);
    } else {
      const questionsMarkup = questions.map((q, index) => `
        <div class="quiz-pass-question mb-4 p-3 border rounded">
          <div class="fw-semibold mb-3">${index + 1}. ${escapeHtml(q.question_text || '')}</div>
          ${[1,2,3,4].map(n => `<label class="quiz-option d-flex align-items-center gap-2 p-2 border rounded mb-2"><input class="form-check-input mt-0" type="radio" name="question_${q.id}" value="${n}"><span>${escapeHtml(q[`option_${n}`] || '')}</span></label>`).join('')}
        </div>`).join('');
      questionsHost.innerHTML = `<div id="quiz-questions-wrapper" class="d-none">${questionsMarkup}</div>`;
      const questionsWrapper = document.getElementById('quiz-questions-wrapper');
      submitBtn.disabled = true;
      if (formActions) formActions.classList.add('d-none');
      if (startPanel) {
        startPanel.classList.remove('d-none');
        startPanel.innerHTML = `
          <div class="alert alert-warning mb-0">
            <div class="fw-semibold mb-1">${tt('take_quiz.ready_title', 'Prêt à commencer ?')}</div>
            <div class="small mb-3">${tt('take_quiz.ready_text', 'Le chrono ne démarre qu’après avoir cliqué sur Lancer. Si tu quittes la page sans valider, une tentative à 0 sera enregistrée.')}</div>
            <button class="btn btn-warning" type="button" id="launch-quiz-btn">${tt('take_quiz.launch', 'Lancer')}</button>
          </div>`;
      }
      const launchButton = document.getElementById('launch-quiz-btn');
      const handleSubmit = async (e, forcedByTimer = false) => {
        if (e) e.preventDefault();
        if (isSubmitting) return;
        isSubmitting = true;
        quizFinished = true;
        stopTimer();
        const submitData = [];
        let score = 0;
        for (const q of questions) {
          const selected = form.querySelector(`input[name="question_${q.id}"]:checked`);
          const selectedOption = selected ? Number(selected.value) : null;
          const isCorrect = selectedOption === Number(q.correct_option);
          if (isCorrect) score += 1;
          submitData.push({
            question_id: q.id,
            selected_option: selectedOption,
            is_correct: isCorrect
          });
        }
        const { data: attempt, error: attemptError } = await supabase
          .from('quiz_attempts')
          .insert({
            quiz_id: quiz.id,
            profile_id: ctx.user.id,
            score,
            total_questions: questions.length
          })
          .select('id,score,total_questions,submitted_at')
          .single();
        if (attemptError) throw attemptError;
        const answersPayload = submitData.map(item => ({
          attempt_id: attempt.id,
          question_id: item.question_id,
          selected_option: item.selected_option,
          is_correct: item.is_correct
        }));
        if (answersPayload.length) {
          const { error: answersSaveError } = await supabase.from('quiz_attempt_answers').insert(answersPayload);
          if (answersSaveError) throw answersSaveError;
        }
        const percent = Math.round((score / Math.max(questions.length, 1)) * 100);
        resultCard.innerHTML = `<h6 class="mb-3">${tt('take_quiz.result', 'Résultat')}</h6><div class="display-6 mb-2">${score}/${questions.length}</div><p class="mb-0 ${score === questions.length ? 'text-success' : 'text-warning'}">${score === questions.length ? tt('take_quiz.perfect_unlocked', 'Bravo, tu as atteint 100%. L’historique détaillé est maintenant visible.') : `${percent}% · ${tt('take_quiz.retake_to_unlock', 'Atteins 100% pour débloquer le détail de tes tentatives.')}`}</p>`;
        if (score === questions.length) {
          renderHistory([attempt, ...(attempts || [])], new Map([[attempt.id, answersPayload], ...answersByAttempt]), questionMap);
          questionsHost.innerHTML = `<div class="alert alert-success mb-0">${tt('take_quiz.locked_success', 'Dernier score validé à 100%. Le quiz est verrouillé en repassage. Tu peux consulter les réponses de tes tentatives ci-dessous.')}</div>`;
          formActions.innerHTML = `<a class="btn btn-outline-secondary" href="my-quizzes.html">${tt('common.back','Retour')}</a>`;
          submitBtn.classList.add('d-none');
        } else {
          renderHistoryLocked();
          formActions.innerHTML = `<a class="btn btn-outline-secondary" href="my-quizzes.html">${tt('common.back','Retour')}</a><a class="btn btn-primary" href="take-quiz.html?id=${quiz.id}">${tt('take_quiz.retry', 'Réessayer')}</a>`;
          questionsHost.innerHTML = `<div class="alert alert-info mb-0">${forcedByTimer ? tt('take_quiz.submitted_on_timeout', 'Le quiz a été soumis automatiquement à la fin du temps.') : tt('take_quiz.submitted_once', 'La tentative a bien été enregistrée.')}</div>`;
        }
      };

      form.addEventListener('submit', handleSubmit);
      launchButton?.addEventListener('click', () => {
        if (quizStarted) return;
        quizStarted = true;
        startPanel?.classList.add('d-none');
        questionsWrapper?.classList.remove('d-none');
        submitBtn.disabled = false;
        if (formActions) formActions.classList.remove('d-none');
        startTimer(quiz.time_limit_minutes, () => {
          handleSubmit(null, true).catch(err => {
            console.error(err);
            showAlert(err?.message || 'Une erreur est survenue.', 'danger');
            isSubmitting = false;
            quizFinished = false;
          });
        });
      });

      const abandonHandler = () => { recordAbandonAttempt(questions.length); };
      window.addEventListener('pagehide', abandonHandler);
      window.addEventListener('beforeunload', abandonHandler);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') abandonHandler();
      });

      resultCard.innerHTML = latestAttempt
        ? `<h6 class="mb-3">${tt('take_quiz.last_result', 'Dernier résultat')}</h6><div class="display-6 mb-2">${latestAttempt.score}/${latestAttempt.total_questions}</div><p class="text-muted mb-0">${scorePercent(latestAttempt)}% · ${tt('take_quiz.last_attempt_saved', 'Dernière tentative enregistrée.')}</p>`
        : `<h6 class="mb-3">${tt('take_quiz.result', 'Résultat')}</h6><p class="text-muted mb-0">${tt('quiz.pass_to_see_score', 'Passe le quiz pour voir ton score.')}</p>`;
      renderHistoryLocked();
    }
  }
}
