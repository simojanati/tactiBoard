import { activateMenu, bindFormSubmit, escapeHtml, fetchTacticsOptions, fetchTeamsOptions, initCrudPanel, setAppTitle, showAlert, supabase } from './common.js';
import { notifyTeamEvent } from './notification-helpers.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.quizzes', 'Quizzes'));
activateMenu('quizzes');

const tableBody = document.getElementById('quizzes-table');
const form = document.getElementById('quiz-form');
const teamSelect = document.getElementById('team-select');
const tacticSelect = document.getElementById('tactic-select');
const questionsBuilder = document.getElementById('questions-builder');
const addQuestionBtn = document.getElementById('add-question-btn');
const refreshBtn = document.getElementById('refresh-btn');
const entityId = document.getElementById('entity-id');
const submitLabel = document.getElementById('submit-label');
const attemptsDetailsHost = document.getElementById('quiz-attempts-details');
const panel = initCrudPanel({ addTitle: tt('quiz.add', 'Ajouter un quiz'), editTitle: tt('quiz.edit', 'Modifier le quiz') });

let quizzesCache = [];

function scorePercent(attempt) {
  return Math.round(((attempt?.score || 0) / Math.max(attempt?.total_questions || 1, 1)) * 100);
}

function questionRowHtml(item = {}) {
  const options = Array.isArray(item.options) && item.options.length === 4 ? item.options : ['', '', '', ''];
  const correct = Number(item.correct_option || 1);
  return `<div class="quiz-question-row border rounded p-3 mb-3">
    <div class="d-flex justify-content-between align-items-center mb-2">
      <h6 class="mb-0">${tt('quiz.question', 'Question')}</h6>
      <button class="btn btn-sm btn-outline-danger remove-question-btn" type="button"><i class="bx bx-trash me-1"></i>${tt('common.delete','Supprimer')}</button>
    </div>
    <div class="mb-3">
      <label class="form-label">${tt('quiz.question_text', 'Texte de la question')}</label>
      <input type="text" class="form-control question-text" value="${escapeHtml(item.question_text || '')}" placeholder="${tt('quiz.question_placeholder', 'Ex: Quel est le rôle du WR sur cette tactique ?')}">
    </div>
    <div class="row">
      ${options.map((opt, index) => `<div class="col-md-6 mb-3"><label class="form-label">${tt('quiz.choice','Choix')} ${index + 1}</label><input type="text" class="form-control question-option" value="${escapeHtml(opt || '')}" placeholder="${tt('quiz.answer','Réponse')} ${index + 1}"></div>`).join('')}
    </div>
    <div class="mb-0">
      <label class="form-label">${tt('quiz.correct_answer', 'Bonne réponse')}</label>
      <select class="form-select question-correct">
        ${[1,2,3,4].map(n => `<option value="${n}" ${correct === n ? 'selected' : ''}>${tt('quiz.choice','Choix')} ${n}</option>`).join('')}
      </select>
    </div>
  </div>`;
}

function ensureQuestionRows(items = []) {
  if (!questionsBuilder) return;
  if (!items.length) items = [{}];
  questionsBuilder.innerHTML = items.map(questionRowHtml).join('');
}

function collectQuestions() {
  return [...questionsBuilder.querySelectorAll('.quiz-question-row')].map((row, index) => {
    const options = [...row.querySelectorAll('.question-option')].map(input => input.value.trim());
    return {
      question_text: row.querySelector('.question-text')?.value.trim() || '',
      options,
      correct_option: Number(row.querySelector('.question-correct')?.value || 1),
      order_index: index + 1
    };
  }).filter(q => q.question_text && q.options.every(Boolean));
}

function renderAttemptsPlaceholder(message = tt('quiz.select_for_attempts', 'Choisis un quiz pour afficher le détail des tentatives.')) {
  if (!attemptsDetailsHost) return;
  attemptsDetailsHost.innerHTML = `<p class="text-muted mb-0">${escapeHtml(message)}</p>`;
}

async function renderAttemptsDetails(quizId, quizTitle = '') {
  if (!attemptsDetailsHost) return;
  attemptsDetailsHost.innerHTML = `<p class="text-muted mb-0">${tt('common.loading','Chargement...')}</p>`;

  const { data: attempts, error } = await supabase
    .from('quiz_attempts')
    .select('id,profile_id,score,total_questions,submitted_at,quiz_attempt_answers(question_id,selected_option,is_correct,quiz_questions(question_text,correct_option,option_1,option_2,option_3,option_4,order_index))')
    .eq('quiz_id', quizId)
    .order('submitted_at', { ascending: false });
  if (error) throw error;

  if (!attempts?.length) {
    renderAttemptsPlaceholder(tt('quiz.no_attempts', 'Aucune tentative enregistrée pour ce quiz.'));
    return;
  }

  const profileIds = [...new Set(attempts.map(attempt => attempt.profile_id).filter(Boolean))];
  let profilesMap = new Map();
  let playersMap = new Map();
  let coachesMap = new Map();
  if (profileIds.length) {
    const [{ data: profilesData, error: profilesError }, { data: playersData, error: playersError }, { data: coachesData, error: coachesError }] = await Promise.all([
      supabase.from('profiles').select('id,full_name,email').in('id', profileIds),
      supabase.from('players').select('profile_id,full_name').in('profile_id', profileIds),
      supabase.from('coaches').select('profile_id,full_name').in('profile_id', profileIds)
    ]);
    if (profilesError) throw profilesError;
    if (playersError) throw playersError;
    if (coachesError) throw coachesError;
    profilesMap = new Map((profilesData || []).map(profile => [String(profile.id), profile]));
    playersMap = new Map((playersData || []).map(player => [String(player.profile_id), player]));
    coachesMap = new Map((coachesData || []).map(coach => [String(coach.profile_id), coach]));
  }

  attemptsDetailsHost.innerHTML = `
    <div class="mb-3">
      <h6 class="mb-1">${tt('quiz.attempt_details', 'Détail des tentatives')}${quizTitle ? ` · ${escapeHtml(quizTitle)}` : ''}</h6>
      <p class="text-muted mb-0">${tt('quiz.full_history', 'Historique complet des passages et réponses données.')}</p>
    </div>
    ${attempts.map(attempt => {
      const answers = [...(attempt.quiz_attempt_answers || [])].sort((a, b) => (a.quiz_questions?.order_index || 0) - (b.quiz_questions?.order_index || 0));
      const profileKey = String(attempt.profile_id || '');
      const profile = profilesMap.get(profileKey) || null;
      const linkedPlayer = playersMap.get(profileKey) || null;
      const linkedCoach = coachesMap.get(profileKey) || null;
      const profileName = linkedPlayer?.full_name || linkedCoach?.full_name || profile?.full_name || profile?.email || tt('quiz.user', 'Utilisateur');
      const profileMeta = profile?.email && profile?.email !== profileName ? profile.email : '';
      return `
      <div class="card border shadow-none mb-3">
        <div class="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div>
            <div class="fw-semibold">${escapeHtml(profileName)}</div>
            <small class="text-muted d-block">${escapeHtml(new Date(attempt.submitted_at).toLocaleString())}</small>
            ${profileMeta ? `<small class="text-muted">${escapeHtml(profileMeta)}</small>` : ''}
          </div>
          <span class="badge bg-label-${scorePercent(attempt) === 100 ? 'success' : scorePercent(attempt) >= 70 ? 'warning' : 'danger'}">${attempt.score}/${attempt.total_questions} · ${scorePercent(attempt)}%</span>
        </div>
        <div class="card-body">
          ${answers.map((answer, index) => {
            const q = answer.quiz_questions || {};
            const selected = answer.selected_option ? escapeHtml(q[`option_${answer.selected_option}`] || `${tt('quiz.choice','Choix')} ${answer.selected_option}`) : `<span class="text-muted">${tt('quiz.no_answer', 'Aucune réponse')}</span>`;
            const correct = q.correct_option ? escapeHtml(q[`option_${q.correct_option}`] || `${tt('quiz.choice','Choix')} ${q.correct_option}`) : '—';
            return `
            <div class="mb-3 pb-3 ${index < answers.length - 1 ? 'border-bottom' : ''}">
              <div class="fw-semibold mb-2">${index + 1}. ${escapeHtml(q.question_text || '')}</div>
              <div class="small mb-1">${tt('quiz.answer_selected', 'Réponse donnée')}: <span class="${answer.is_correct ? 'text-success' : 'text-danger'} fw-semibold">${selected}</span></div>
              <div class="small text-muted">${tt('quiz.correct_answer', 'Bonne réponse')}: ${correct}</div>
            </div>`;
          }).join('') || `<p class="text-muted mb-0">${tt('quiz.no_answers', 'Aucune réponse enregistrée.')}</p>`}
        </div>
      </div>`;
    }).join('')}`;
}

addQuestionBtn?.addEventListener('click', () => {
  questionsBuilder.insertAdjacentHTML('beforeend', questionRowHtml({}));
});

questionsBuilder?.addEventListener('click', e => {
  const btn = e.target.closest('.remove-question-btn');
  if (!btn) return;
  btn.closest('.quiz-question-row')?.remove();
  if (!questionsBuilder.querySelector('.quiz-question-row')) ensureQuestionRows([{}]);
});

teamSelect?.addEventListener('change', async () => {
  await fetchTacticsOptions(tacticSelect, { teamId: teamSelect.value, includePlaceholder: true });
});

async function loadReferenceData() {
  await fetchTeamsOptions(teamSelect, true);
  await fetchTacticsOptions(tacticSelect, { includePlaceholder: true });
}

async function fetchQuizzes() {
  tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">${tt('common.loading','Chargement...')}</td></tr>`;
  const { data, error } = await supabase
    .from('quizzes')
    .select('id,title,description,status,team_id,tactic_id,time_limit_minutes,created_at,teams(name),tactics(title),quiz_questions(id),quiz_attempts(id,score,total_questions,submitted_at)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  quizzesCache = data || [];
  if (!quizzesCache.length) {
    tableBody.innerHTML = `<tr><td colspan="8" class="table-empty">${tt('quiz.none', 'Aucun quiz pour le moment.')}</td></tr>`;
    renderAttemptsPlaceholder(tt('quiz.none_available', 'Aucun quiz disponible.'));
    return;
  }
  tableBody.innerHTML = quizzesCache.map(item => {
    const attempts = item.quiz_attempts || [];
    const latestAttempt = attempts.length ? [...attempts].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] : null;
    return `
    <tr>
      <td><div class="fw-semibold">${escapeHtml(item.title || '')}</div><small class="text-muted">${escapeHtml(item.description || '—')}</small></td>
      <td>${escapeHtml(item.teams?.name || '—')}</td>
      <td>${escapeHtml(item.tactics?.title || '—')}</td>
      <td><span class="badge bg-label-info">${item.quiz_questions?.length || 0}</span></td>
      <td>${item.time_limit_minutes ? `<span class="badge bg-label-warning"><i class="bx bx-time-five me-1"></i>${item.time_limit_minutes} min</span>` : '<span class="text-muted">—</span>'}</td>
      <td>
        <div class="fw-semibold">${attempts.length}</div>
        <small class="text-muted">${latestAttempt ? `Dernier: ${latestAttempt.score}/${latestAttempt.total_questions}` : tt('quiz.no_pass', 'Aucun passage')}</small>
      </td>
      <td><span class="badge bg-label-${item.status === 'active' ? 'success' : item.status === 'archived' ? 'secondary' : 'warning'}">${escapeHtml(item.status || 'draft')}</span></td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-info attempts-btn" data-id="${item.id}"><i class="bx bx-list-ul"></i></button>
        <button class="btn btn-sm btn-outline-primary edit-btn" data-id="${item.id}"><i class="bx bx-edit-alt"></i></button>
        <button class="btn btn-sm btn-outline-danger delete-btn" data-id="${item.id}"><i class="bx bx-trash"></i></button>
      </td>
    </tr>`;
  }).join('');
  renderAttemptsPlaceholder();
}

async function loadQuizForEdit(id) {
  const { data, error } = await supabase
    .from('quizzes')
    .select('*, quiz_questions(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return;
  entityId.value = data.id;
  form.elements.team_id.value = data.team_id || '';
  await fetchTacticsOptions(tacticSelect, { teamId: data.team_id || '', includePlaceholder: true, selectedIds: data.tactic_id ? [data.tactic_id] : [] });
  form.elements.title.value = data.title || '';
  form.elements.time_limit_minutes.value = data.time_limit_minutes || '';
  form.elements.status.value = data.status || 'draft';
  form.elements.description.value = data.description || '';
  submitLabel.textContent = tt('common.update', 'Mettre à jour');
  ensureQuestionRows((data.quiz_questions || []).sort((a,b) => (a.order_index || 0) - (b.order_index || 0)).map(q => ({
    question_text: q.question_text,
    options: [q.option_1, q.option_2, q.option_3, q.option_4],
    correct_option: q.correct_option
  })));
  panel.open(true);
}

async function saveQuiz(formData) {
  const id = entityId.value;
  const isUpdate = Boolean(id);
  const questions = collectQuestions();
  if (!questions.length) throw new Error(tt('quiz.min_one_question', 'Ajoute au moins une question complète.'));
  const payload = {
    team_id: Number(formData.get('team_id')),
    tactic_id: formData.get('tactic_id') ? Number(formData.get('tactic_id')) : null,
    title: formData.get('title')?.trim(),
    time_limit_minutes: formData.get('time_limit_minutes') ? Number(formData.get('time_limit_minutes')) : null,
    status: formData.get('status') || 'draft',
    description: formData.get('description')?.trim() || null
  };
  if (!payload.team_id || !payload.title) throw new Error(tt('quiz.required_fields', 'Complète les champs obligatoires.'));
  if (payload.time_limit_minutes !== null && (!Number.isFinite(payload.time_limit_minutes) || payload.time_limit_minutes < 1)) throw new Error(tt('quiz.timer_invalid', 'Le timer doit être supérieur ou égal à 1 minute.'));

  let quizId = id;
  if (id) {
    const { error } = await supabase.from('quizzes').update(payload).eq('id', id);
    if (error) throw error;
    const { error: deleteQuestionsError } = await supabase.from('quiz_questions').delete().eq('quiz_id', id);
    if (deleteQuestionsError) throw deleteQuestionsError;
  } else {
    const { data, error } = await supabase.from('quizzes').insert(payload).select('id').single();
    if (error) throw error;
    quizId = data.id;
  }

  const questionRows = questions.map(q => ({
    quiz_id: quizId,
    question_text: q.question_text,
    option_1: q.options[0],
    option_2: q.options[1],
    option_3: q.options[2],
    option_4: q.options[3],
    correct_option: q.correct_option,
    order_index: q.order_index
  }));
  const { error: insertQuestionsError } = await supabase.from('quiz_questions').insert(questionRows);
  if (insertQuestionsError) throw insertQuestionsError;

  showAlert(id ? tt('quiz.updated', 'Quiz mis à jour.') : tt('quiz.created', 'Quiz créé avec succès.'));
  await notifyTeamEvent({
    teamId: payload.team_id,
    eventType: 'quiz',
    title: isUpdate ? tt('quiz.updated_title', 'Quiz mis à jour') : tt('quiz.new_tactical', 'Nouveau quiz tactique'),
    body: isUpdate
      ? `${payload.title} a été mis à jour${payload.tactic_id ? ' et reste lié à une tactique.' : '.'}`
      : `${payload.title} est disponible${payload.status === 'active' ? ' dès maintenant' : ' prochainement'}.`,
    links: {
      player: 'my-quizzes.html',
      coach: 'quizzes.html'
    }
  });
  form.reset();
  entityId.value = '';
  submitLabel.textContent = 'Enregistrer';
  ensureQuestionRows([{}]);
  panel.close(true);
  await fetchQuizzes();
}

bindFormSubmit('quiz-form', saveQuiz);

refreshBtn?.addEventListener('click', fetchQuizzes);

tableBody?.addEventListener('click', async e => {
  const attemptsBtn = e.target.closest('.attempts-btn');
  if (attemptsBtn) {
    const quiz = quizzesCache.find(item => String(item.id) === String(attemptsBtn.dataset.id));
    await renderAttemptsDetails(attemptsBtn.dataset.id, quiz?.title || '');
    attemptsDetailsHost?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const editBtn = e.target.closest('.edit-btn');
  if (editBtn) {
    await loadQuizForEdit(editBtn.dataset.id);
    return;
  }
  const deleteBtn = e.target.closest('.delete-btn');
  if (deleteBtn) {
    if (!confirm(tt('quiz.delete_confirm', 'Supprimer ce quiz ?'))) return;
    const { error } = await supabase.from('quizzes').delete().eq('id', deleteBtn.dataset.id);
    if (error) {
      showAlert(error.message || tt('quiz.delete_failed', 'Suppression impossible.'), 'danger');
      return;
    }
    showAlert(tt('quiz.deleted', 'Quiz supprimé.'));
    await fetchQuizzes();
  }
});

document.querySelectorAll('.cancel-form-btn').forEach(btn => btn.addEventListener('click', () => {
  form.reset();
  entityId.value = '';
  submitLabel.textContent = 'Enregistrer';
  ensureQuestionRows([{}]);
}));

await loadReferenceData();
ensureQuestionRows([{}]);
renderAttemptsPlaceholder();
await fetchQuizzes();
