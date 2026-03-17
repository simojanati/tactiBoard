import { activateMenu, escapeHtml, getQueryParam, nl2br, setAppTitle, showAlert, supabase } from './common.js';
import { getPortalContext, matchAssignmentsForPlayer, markTacticRead, buildReadState } from './portal-common.js';

setAppTitle('Détail tactique');
const tt = (k, f='') => window.t ? window.t(k, f) : f;
activateMenu('tactics');

const id = getQueryParam('id');
const host = document.getElementById('tactic-detail-host');
const linkedSessionsHost = document.getElementById('linked-sessions');
const linkedMatchesHost = document.getElementById('linked-matches');
const linkedQuizzesHost = document.getElementById('linked-quizzes');
const linkedReadStatusHost = document.getElementById('linked-read-status');
const quizzesManageLink = document.getElementById('quizzes-manage-link');
const diagramsListHost = document.getElementById('diagrams-list');
const ctx = await getPortalContext();

function parseDiagramPayload(diagramJson) {
  if (!diagramJson) return null;
  try {
    const parsed = typeof diagramJson === 'string' ? JSON.parse(diagramJson) : diagramJson;
    const board = parsed?.board ? parsed.board : parsed;
    const animation = parsed?.animation || null;
    return { board, animation };
  } catch (_) {
    return null;
  }
}

function getAnimationVideoUrl(payload) {
  const animation = payload?.animation;
  if (!animation?.baseState || !Array.isArray(animation?.keyframes) || animation.keyframes.length < 2) return '';
  return animation?.webm_url || animation?.webmUrl || '';
}

function scaleBoardJsonForPreview(board) {
  if (!board || !Array.isArray(board.objects)) return board;
  const baseW = Number(board.width || 1200) || 1200;
  const baseH = Number(board.height || 700) || 700;
  const targetW = 640;
  const targetH = 360;
  const sx = targetW / baseW;
  const sy = targetH / baseH;
  return {
    ...board,
    width: targetW,
    height: targetH,
    objects: board.objects.map(obj => ({
      ...obj,
      left: typeof obj.left === 'number' ? obj.left * sx : obj.left,
      top: typeof obj.top === 'number' ? obj.top * sy : obj.top,
      scaleX: typeof obj.scaleX === 'number' ? obj.scaleX * sx : sx,
      scaleY: typeof obj.scaleY === 'number' ? obj.scaleY * sy : sy,
      strokeWidth: typeof obj.strokeWidth === 'number' ? obj.strokeWidth * ((sx + sy) / 2) : obj.strokeWidth,
      rx: typeof obj.rx === 'number' ? obj.rx * sx : obj.rx,
      ry: typeof obj.ry === 'number' ? obj.ry * sy : obj.ry,
      radius: typeof obj.radius === 'number' ? obj.radius * ((sx + sy) / 2) : obj.radius,
      width: typeof obj.width === 'number' ? obj.width * sx : obj.width,
      height: typeof obj.height === 'number' ? obj.height * sy : obj.height,
      fontSize: typeof obj.fontSize === 'number' ? obj.fontSize * ((sx + sy) / 2) : obj.fontSize,
      objects: Array.isArray(obj.objects) ? obj.objects.map(child => ({
        ...child,
        left: typeof child.left === 'number' ? child.left * sx : child.left,
        top: typeof child.top === 'number' ? child.top * sy : child.top,
        scaleX: typeof child.scaleX === 'number' ? child.scaleX * sx : child.scaleX,
        scaleY: typeof child.scaleY === 'number' ? child.scaleY * sy : child.scaleY,
        strokeWidth: typeof child.strokeWidth === 'number' ? child.strokeWidth * ((sx + sy) / 2) : child.strokeWidth,
        rx: typeof child.rx === 'number' ? child.rx * sx : child.rx,
        ry: typeof child.ry === 'number' ? child.ry * sy : child.ry,
        radius: typeof child.radius === 'number' ? child.radius * ((sx + sy) / 2) : child.radius,
        width: typeof child.width === 'number' ? child.width * sx : child.width,
        height: typeof child.height === 'number' ? child.height * sy : child.height,
        fontSize: typeof child.fontSize === 'number' ? child.fontSize * ((sx + sy) / 2) : child.fontSize,
      })) : obj.objects
    }))
  };
}


function addPreviewFieldBackground(canvasEl, width = 640, height = 360) {
  if (!window.fabric || !canvasEl) return;
  const fabric = window.fabric;
  const markBg = (obj) => {
    obj.isFieldBg = true;
    obj.selectable = false;
    obj.evented = false;
    obj.hoverCursor = 'default';
    return obj;
  };
  (canvasEl.getObjects() || []).filter(obj => obj.isFieldBg).forEach(obj => canvasEl.remove(obj));
  const endZoneW = width * 0.1;
  canvasEl.add(markBg(new fabric.Rect({ left: 0, top: 0, width, height, fill: '#0f7c3d' })));
  canvasEl.add(markBg(new fabric.Line([width / 2, 0, width / 2, height], { stroke: '#ffffff', strokeWidth: 2, opacity: 0.85 })));
  canvasEl.add(markBg(new fabric.Rect({ left: 0, top: 0, width: endZoneW, height, fill: 'rgba(255,255,255,0.06)', stroke: '#fff', strokeWidth: 1.5 })));
  canvasEl.add(markBg(new fabric.Rect({ left: width - endZoneW, top: 0, width: endZoneW, height, fill: 'rgba(255,255,255,0.06)', stroke: '#fff', strokeWidth: 1.5 })));
  for (let i = 1; i < 10; i++) {
    const x = endZoneW + (((width - endZoneW * 2) / 10) * i);
    canvasEl.add(markBg(new fabric.Line([x, 0, x, height], { stroke: '#ffffff', strokeWidth: i === 5 ? 2 : 1.5, opacity: 0.7 })));
    for (let h = 0; h < 8; h++) {
      const yTop = 46 + h * 33;
      const yBottom = height - 46 - h * 33;
      canvasEl.add(markBg(new fabric.Line([x - 8, yTop, x + 8, yTop], { stroke: '#fff', strokeWidth: 1.25, opacity: 0.5 })));
      canvasEl.add(markBg(new fabric.Line([x - 8, yBottom, x + 8, yBottom], { stroke: '#fff', strokeWidth: 1.25, opacity: 0.5 })));
    }
  }
  for (let i = 1; i < 10; i++) {
    const yard = i * 10;
    const xLeft = endZoneW + (((width - endZoneW * 2) / 10) * i) - 13;
    const xRight = width - xLeft - 13;
    canvasEl.add(markBg(new fabric.Text(String(yard <= 50 ? yard : 100 - yard), { left: xLeft, top: 12, fontSize: 12, fill: 'rgba(255,255,255,0.45)', fontWeight: 700 })));
    canvasEl.add(markBg(new fabric.Text(String(yard <= 50 ? yard : 100 - yard), { left: xRight, top: height - 22, fontSize: 12, fill: 'rgba(255,255,255,0.45)', fontWeight: 700, angle: 180 })));
  }
  (canvasEl.getObjects() || []).filter(obj => obj.isFieldBg).forEach((obj, idx) => canvasEl.moveTo(obj, idx));
  canvasEl.renderAll();
}

function extractAnimatedItems(canvasEl) {
  return (canvasEl.getObjects() || []).filter(obj => ['offense','defense','ball'].includes(obj.pbType)).map(obj => ({
    animId: obj.animId,
    left: obj.left || 0,
    top: obj.top || 0,
    angle: obj.angle || 0,
    scaleX: obj.scaleX || 1,
    scaleY: obj.scaleY || 1
  }));
}

function interpolateDiagramFrame(keyframes, durationMs, timeMs) {
  if (!Array.isArray(keyframes) || !keyframes.length) return [];
  if (timeMs <= 0) return keyframes[0].items || [];
  if (timeMs >= durationMs) return keyframes[keyframes.length - 1].items || [];
  let prev = keyframes[0];
  let next = keyframes[keyframes.length - 1];
  for (let i = 1; i < keyframes.length; i++) {
    if (keyframes[i].time >= timeMs) {
      next = keyframes[i];
      prev = keyframes[i - 1] || next;
      break;
    }
  }
  if (!prev || !next || prev.time === next.time) return prev?.items || next?.items || [];
  const ratio = (timeMs - prev.time) / (next.time - prev.time);
  const nextMap = new Map((next.items || []).map(item => [item.animId, item]));
  return (prev.items || []).map(item => {
    const target = nextMap.get(item.animId) || item;
    return {
      animId: item.animId,
      left: item.left + ((target.left ?? item.left) - item.left) * ratio,
      top: item.top + ((target.top ?? item.top) - item.top) * ratio,
      angle: item.angle + ((target.angle ?? item.angle) - item.angle) * ratio,
      scaleX: item.scaleX + ((target.scaleX ?? item.scaleX) - item.scaleX) * ratio,
      scaleY: item.scaleY + ((target.scaleY ?? item.scaleY) - item.scaleY) * ratio
    };
  });
}

function applyDiagramFrame(canvasEl, items) {
  const map = new Map((items || []).map(item => [item.animId, item]));
  extractAnimatedItems(canvasEl); // ensure pbType exists on objects only
  (canvasEl.getObjects() || []).forEach(obj => {
    const state = map.get(obj.animId);
    if (!state) return;
    obj.set({ left: state.left, top: state.top, angle: state.angle, scaleX: state.scaleX, scaleY: state.scaleY });
    obj.setCoords();
  });
  canvasEl.renderAll();
}

function selectSupportedVideoMimeType() {
  const candidates = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return candidates.find(type => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || '';
}

async function generateDiagramPreviewWebM(payload, { width = 640, height = 360, fps = 20 } = {}) {
  if (!window.fabric) throw new Error('Fabric indisponible.');
  const mimeType = selectSupportedVideoMimeType();
  if (!mimeType) throw new Error('WebM non supporté.');
  const animation = payload?.animation;
  const offscreenEl = document.createElement('canvas');
  offscreenEl.width = width;
  offscreenEl.height = height;
  const previewCanvas = new window.fabric.StaticCanvas(offscreenEl, { backgroundColor: '#0f7c3d' });
  previewCanvas.setWidth(width);
  previewCanvas.setHeight(height);
  const scaledBoard = scaleBoardJsonForPreview(payload.board);
  await new Promise(resolve => previewCanvas.loadFromJSON(scaledBoard, resolve));
  addPreviewFieldBackground(previewCanvas, width, height);
  previewCanvas.renderAll();
  const baseItems = (animation.baseState?.items || animation.keyframes[0]?.items || []).map(item => ({ ...item }));
  const durationMs = Number(animation.durationMs || animation.keyframes[animation.keyframes.length - 1]?.time || 0);
  applyDiagramFrame(previewCanvas, baseItems);
  previewCanvas.renderAll();
  const stream = previewCanvas.lowerCanvasEl.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2500000 });
  const chunks = [];
  recorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start();
  const frameCount = Math.max(16, Math.round((Math.max(0.8, durationMs / 1000)) * fps));
  for (let i = 0; i < frameCount; i++) {
    const ratio = frameCount === 1 ? 1 : i / (frameCount - 1);
    const elapsed = durationMs * ratio;
    applyDiagramFrame(previewCanvas, interpolateDiagramFrame(animation.keyframes, durationMs, elapsed));
    previewCanvas.renderAll();
    await new Promise(resolve => setTimeout(resolve, Math.max(12, 1000 / fps)));
  }
  recorder.stop();
  stream.getTracks().forEach(track => track.stop());
  return stopped;
}

async function initAnimatedDiagramPreviews(diagrams = []) {
  if (!diagramsListHost) return;
  const previewCards = [...diagramsListHost.querySelectorAll('[data-diagram-preview-id]')];
  for (const hostEl of previewCards) {
    const id = hostEl.getAttribute('data-diagram-preview-id');
    const diagram = diagrams.find(item => String(item.id) === String(id));
    const payload = parseDiagramPayload(diagram?.diagram_json);
    const webmUrl = getAnimationVideoUrl(payload);
    const videoNode = hostEl.querySelector('video');
    const playBtn = hostEl.closest('.card')?.querySelector('[data-action="preview-play"]');
    if (!videoNode || !webmUrl) continue;
    try {
      videoNode.src = webmUrl;
      videoNode.muted = true;
      videoNode.loop = true;
      videoNode.playsInline = true;
      videoNode.autoplay = true;
      videoNode.controls = false;
      await videoNode.play().catch(() => {});
      let playing = true;
      playBtn?.addEventListener('click', () => {
        if (playing) {
          videoNode.pause();
          playBtn.textContent = tt('common.preview', 'Preview');
        } else {
          videoNode.currentTime = 0;
          videoNode.play().catch(() => {});
          playBtn.textContent = tt('common.pause', 'Pause');
        }
        playing = !playing;
      });
    } catch (err) {
      console.error(err);
      hostEl.innerHTML = `<div class="d-flex align-items-center justify-content-center h-100 text-muted small">${tt('common.preview', 'Preview')} indisponible</div>`;
      if (playBtn) playBtn.disabled = true;
    }
  }
}


function renderList(hostEl, items, formatter, emptyLabel) {
  hostEl.innerHTML = items?.length ? items.map(formatter).join('') : `<li class="list-group-item text-muted">${emptyLabel}</li>`;
}

if (!id) {
  showAlert(tt('tactic.no_id', 'Identifiant de tactique manquant.'), 'danger');
  host.innerHTML = `<div class="card"><div class="card-body">${tt('tactic.none_selected', 'Aucune tactique sélectionnée.')}</div></div>`;
} else {
  try {
    const [{ data: tactic, error }, { data: assignments, error: assignErr }, { data: sessionLinks, error: sessionsErr }, { data: matchLinks, error: matchesErr }, { data: quizLinks, error: quizzesErr }, { data: reads, error: readsErr }, { data: diagrams, error: diagramsErr }] = await Promise.all([
      supabase.from('tactics').select('*, teams(name)').eq('id', id).single(),
      supabase.from('tactic_assignments').select('position,instruction').eq('tactic_id', id).order('id'),
      supabase.from('session_tactics').select('priority, sessions(id,title,session_date,location)').eq('tactic_id', id),
      supabase.from('match_tactics').select('side,priority_order, matches(id,opponent,match_date,location)').eq('tactic_id', id),
      supabase.from('quizzes').select('id,title,description,status,quiz_attempts(id,score,total_questions,submitted_at)').eq('tactic_id', id).order('created_at', { ascending: false }),
      supabase.from('tactic_reads').select('profile_id,version_seen,read_at').eq('tactic_id', id),
      supabase.from('tactic_diagrams').select('*').eq('tactic_id', id).order('is_primary', { ascending: false }).order('updated_at', { ascending: false })
    ]);

    if (error) throw error;
    if (assignErr) throw assignErr;
    if (sessionsErr) throw sessionsErr;
    if (matchesErr) throw matchesErr;
    if (quizzesErr) throw quizzesErr;
    if (readsErr && !String(readsErr.message || '').includes('relation')) throw readsErr;
    if (diagramsErr && !String(diagramsErr.message || '').includes('relation')) throw diagramsErr;

    const myAssignments = ctx.role === 'player' ? matchAssignmentsForPlayer(assignments || [], ctx.membership) : [];
    const playerReadEntry = ctx.role === 'player' ? (reads || []).find(item => item.profile_id === ctx.user?.id) : null;
    const playerReadState = ctx.role === 'player' ? buildReadState(tactic, playerReadEntry) : null;

    if (ctx.role === 'player' && ctx.user?.id) {
      await markTacticRead(tactic.id, ctx.user.id, tactic.version || 1);
    }

    const canEditBoard = ['admin', 'coach'].includes(ctx.role);
    const primaryDiagram = (diagrams || []).find(diagram => diagram.is_primary) || (diagrams || [])[0] || null;
    const primaryDiagramVideoUrl = primaryDiagram
      ? (primaryDiagram.diagramVideoUrl || primaryDiagram.video_url || primaryDiagram.webm_url || tdWebmUrlFromDiagram(primaryDiagram) || '')
      : '';
    const primaryDiagramImageUrl = primaryDiagram
      ? (primaryDiagram.image_url || primaryDiagram.diagramImageUrl || tdImageUrlFromDiagram(primaryDiagram) || '')
      : (tactic.diagram_image_url || '');
    let tacticDiagramHtml = `<div class="text-muted">${tt('tactic.no_linked_image', 'Aucune image liée à cette tactique.')}</div>`;
    if (primaryDiagramVideoUrl) {
      const editBoardAction = canEditBoard
        ? `<a class="btn btn-outline-dark btn-sm" href="tactical-board.html?id=${tactic.id}${primaryDiagram?.id ? `&diagramId=${primaryDiagram.id}` : ''}">${tt('tactic.edit_board', 'Modifier dans Board')}</a>`
        : '';
      tacticDiagramHtml = `
        <video id="td-primary-video" class="img-fluid rounded border w-100" src="${primaryDiagramVideoUrl}" playsinline preload="metadata" controls></video>
        <div class="mt-3 d-flex flex-wrap gap-2 justify-content-center">
          <a class="btn btn-outline-secondary btn-sm" href="${primaryDiagramVideoUrl}" target="_blank">WebM</a>
          ${primaryDiagramImageUrl ? `<a class="btn btn-outline-primary btn-sm" href="${primaryDiagramImageUrl}" target="_blank">${tt('tactic.image', 'Image')}</a>` : ''}
          ${editBoardAction}
        </div>`;
    } else if (primaryDiagramImageUrl) {
      const openImageLabel = tt('tactic.open_image', "Ouvrir l'image");
      const editBoardAction = canEditBoard
        ? `<a class="btn btn-outline-dark btn-sm" href="tactical-board.html?id=${tactic.id}${primaryDiagram?.id ? `&diagramId=${primaryDiagram.id}` : ''}">${tt('tactic.edit_board', 'Modifier dans Board')}</a>`
        : '';
      tacticDiagramHtml = `<img src="${primaryDiagramImageUrl}" class="img-fluid rounded border" alt="Diagramme tactique"><div class="mt-3 d-flex flex-wrap gap-2 justify-content-center"><a class="btn btn-outline-primary btn-sm" href="${primaryDiagramImageUrl}" target="_blank">${openImageLabel}</a>${editBoardAction}</div>`;
    }

    document.getElementById('page-title').textContent = tactic.title || tt('page.tactic_detail', 'Détail tactique');
    document.getElementById('edit-link').href = `tactics.html?edit=${tactic.id}`;
    const boardLinkEl = document.getElementById('board-link');
    if (boardLinkEl) {
      const canOpenBoard = ['admin','coach'].includes(ctx.role);
      boardLinkEl.href = `tactical-board.html?id=${tactic.id}`;
      boardLinkEl.classList.toggle('d-none', !canOpenBoard);
    }

    host.innerHTML = `
      <div class="row">
        <div class="col-lg-8 mb-4">
          <div class="card h-100">
            <div class="card-header d-flex justify-content-between align-items-start gap-3 flex-wrap">
              <div>
                <h4 class="mb-1">${escapeHtml(tactic.title || '')}</h4>
                <div class="tactic-hero-meta">
                  <span class="badge bg-label-primary">${escapeHtml(tactic.phase || '—')}</span>
                  <span class="badge bg-label-secondary">${escapeHtml(tactic.category || tt('tactic.uncategorized', 'Sans catégorie'))}</span>
                  <span class="badge bg-label-info">${escapeHtml(tactic.formation || '—')}</span>
                  <span class="badge bg-label-dark">${tt('tactic.version', 'Version')} ${escapeHtml(tactic.version || 1)}</span>
                  <span class="badge bg-label-warning">MAJ ${escapeHtml(tactic.updated_at ? new Date(tactic.updated_at).toLocaleDateString() : '—')}</span>
                </div>
              </div>
              <div class="text-end small text-muted">
                <div>${tt('tactic.team', 'Équipe')}: ${escapeHtml(tactic.teams?.name || '—')}</div>
                <div>${tt('tactic.status', 'Statut')}: ${escapeHtml(tactic.status || '—')}</div>
              </div>
            </div>
            <div class="card-body">
              <div class="detail-stats mb-4">
                <div class="detail-stat"><div class="small text-muted">${tt('tactic.assignments', 'Assignments')}</div><div class="value">${assignments?.length || 0}</div></div>
                <div class="detail-stat"><div class="small text-muted">${tt('tactic.linked_sessions', 'Séances liées')}</div><div class="value">${sessionLinks?.length || 0}</div></div>
                <div class="detail-stat"><div class="small text-muted">${tt('tactic.linked_matches', 'Matchs liés')}</div><div class="value">${matchLinks?.length || 0}</div></div>
                <div class="detail-stat"><div class="small text-muted">${tt('tactic.linked_quizzes', 'Quiz liés')}</div><div class="value">${quizLinks?.length || 0}</div></div>
                ${ctx.role === 'player' ? `<div class="detail-stat"><div class="small text-muted">${tt('tactic.reading', 'Lecture')}</div><div class="value text-${playerReadState?.key === 'seen' ? 'success' : playerReadState?.key === 'outdated' ? 'warning' : 'danger'}">${escapeHtml(playerReadState?.label || tt('tactic.to_read', 'À lire'))}</div></div>` : ''}
              </div>
              <div class="mb-4">
                <h6 class="text-uppercase text-muted mb-2">${tt('tactic.objective', 'Objectif')}</h6>
                <p class="mb-0">${escapeHtml(tactic.objective || tt('tactic.no_objective', 'Aucun objectif saisi.'))}</p>
              </div>
              ${ctx.role === 'player' ? `<div class="card tactic-role-card mb-4"><div class="card-body"><h6 class="mb-3">${tt('tactic.my_role', 'Mon rôle')}</h6>${myAssignments.length ? myAssignments.map(item => `<div class="mb-2"><div class="fw-semibold text-primary small">${escapeHtml(item.position || '')}</div><div>${escapeHtml(item.instruction || '')}</div></div>`).join('') : `<div class="text-muted">${tt('tactic.no_role_instruction', 'Aucune consigne spécifique détectée pour ton poste')} (${escapeHtml(ctx.membership?.primary_position || '—')}).</div>`}</div></div>` : ''}
              <div class="row g-3 mb-4">
                <div class="col-md-6">
                  <div class="card border shadow-none h-100">
                    <div class="card-body">
                      <h6 class="mb-2">${tt('tactic.last_update', 'Dernière mise à jour')}</h6>
                      <div class="small text-muted mb-2">${escapeHtml(tactic.updated_at ? new Date(tactic.updated_at).toLocaleString() : tt('tactic.no_date', 'Aucune date'))}</div>
                      <div class="latest-update-note">${escapeHtml(tactic.change_note || tt('tactic.no_change_note', 'Aucune note de changement pour le moment.'))}</div>
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <div class="card border shadow-none h-100">
                    <div class="card-body">
                      <h6 class="mb-2">${tt('tactic.coach_notes', 'Notes coach')}</h6>
                      <div>${nl2br(tactic.coach_notes || tactic.notes || tt('tactic.no_coach_note', 'Aucune note coach pour le moment.'))}</div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <h6 class="text-uppercase text-muted mb-3">${tt('tactic.assignments_by_position', 'Assignments par poste')}</h6>
                ${assignments?.length ? `<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>${tt('x.6428339629062304400','Poste')}</th><th>Instruction</th></tr></thead><tbody>${assignments.map(item => `<tr class="${myAssignments.some(a => a.position === item.position && a.instruction === item.instruction) ? 'table-primary' : ''}"><td class="fw-semibold">${escapeHtml(item.position || '')}</td><td>${escapeHtml(item.instruction || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div class="alert alert-warning mb-0">${tt('tactic.no_assignment', 'Aucun assignment enregistré.')}</div>`}
              </div>
            </div>
          </div>
        </div>
        <div class="col-lg-4 mb-4">
          <div class="card mb-4">
            <div class="card-header"><h5 class="mb-0">${tt('tactic.diagram_image', 'Schéma / image')}</h5></div>
            <div class="card-body text-center">
              ${tacticDiagramHtml}
            </div>
          </div>
          <div class="card">
            <div class="card-header"><h5 class="mb-0">${tt('tactic.quick_read', 'Lecture rapide')}</h5></div>
            <div class="card-body small">
              <div class="mb-2"><strong>${tt('tactic.phase','Phase')}:</strong> ${escapeHtml(tactic.phase || '—')}</div>
              <div class="mb-2"><strong>${tt('tactic.category','Catégorie')}:</strong> ${escapeHtml(tactic.category || '—')}</div>
              <div class="mb-2"><strong>${tt('tactic.formation','Formation')}:</strong> ${escapeHtml(tactic.formation || '—')}</div>
              <div class="mb-0"><strong>${tt('tactic.version','Version')}:</strong> ${escapeHtml(tactic.version || 1)}</div>
            </div>
          </div>
        </div>
      </div>`;

    renderList(linkedSessionsHost, sessionLinks || [], link => `<li class="list-group-item d-flex justify-content-between align-items-start"><div><a href="sessions.html">${escapeHtml(link.sessions?.title || tt('tactic.session_default', 'Séance'))}</a><div class="small text-muted">${escapeHtml(link.sessions?.session_date || '')}${link.sessions?.location ? ` • ${escapeHtml(link.sessions.location)}` : ''}</div></div><span class="badge bg-label-primary">${escapeHtml(link.priority || 'normal')}</span></li>`, tt('tactic.no_linked_session', 'Aucune séance liée pour le moment.'));

    renderList(linkedMatchesHost, matchLinks || [], link => `<li class="list-group-item d-flex justify-content-between align-items-start"><div><a href="match-detail.html?id=${link.matches?.id}">${escapeHtml(link.matches?.opponent || tt('tactic.match_default', 'Match'))}</a><div class="small text-muted">${escapeHtml(link.matches?.match_date || '')}${link.matches?.location ? ` • ${escapeHtml(link.matches.location)}` : ''}</div></div><span class="badge bg-label-secondary">${escapeHtml(link.side || '—')}</span></li>`, tt('tactic.no_linked_match', 'Aucun match lié pour le moment.'));

    if (quizzesManageLink && ctx.role === 'player') {
      quizzesManageLink.href = 'my-quizzes.html';
      quizzesManageLink.textContent = tt('tactic.my_quizzes', 'Mes quiz');
    }

    const readProfileIds = [...new Set((reads || []).map(item => item.profile_id).filter(Boolean))];
    let profileRows = [];
    if (readProfileIds.length && ['admin', 'coach'].includes(ctx.role)) {
      const [{ data: playerProfiles }, { data: coachProfiles }, { data: profileBasics }] = await Promise.all([
        supabase.from('players').select('profile_id,full_name').in('profile_id', readProfileIds),
        supabase.from('coaches').select('profile_id,full_name').in('profile_id', readProfileIds),
        supabase.from('profiles').select('id,full_name,email').in('id', readProfileIds)
      ]);
      const names = new Map();
      (profileBasics || []).forEach(item => names.set(item.id, { full_name: item.full_name, email: item.email }));
      (playerProfiles || []).forEach(item => names.set(item.profile_id, { ...(names.get(item.profile_id) || {}), full_name: item.full_name || names.get(item.profile_id)?.full_name }));
      (coachProfiles || []).forEach(item => names.set(item.profile_id, { ...(names.get(item.profile_id) || {}), full_name: item.full_name || names.get(item.profile_id)?.full_name }));
      profileRows = (reads || []).map(item => ({ ...item, profile: names.get(item.profile_id) || null })).sort((a, b) => new Date(b.read_at) - new Date(a.read_at));
    }

    renderList(linkedQuizzesHost, quizLinks || [], link => {
      const actionHref = ctx.role === 'player' ? `take-quiz.html?id=${link.id}` : 'quizzes.html';
      const actionLabel = ctx.role === 'player' ? tt('quiz.take', 'Passer le quiz') : tt('tactic.manage', 'Gérer');
      const badgeClass = link.status === 'active' ? 'success' : link.status === 'draft' ? 'warning' : 'secondary';
      const attemptsCount = link.quiz_attempts?.length || 0;
      const latestAttempt = attemptsCount ? [...link.quiz_attempts].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at))[0] : null;
      return `<div class="list-group-item d-flex justify-content-between align-items-start gap-2"><div><div class="fw-semibold">${escapeHtml(link.title || tt('common.quiz', 'Quiz'))}</div><div class="small text-muted">${escapeHtml(link.description || tt('tactic.linked_quiz_desc', 'Quiz lié à cette tactique.'))}</div><div class="small text-muted mt-1">${window.t ? window.t('misc.attempts', 'Attempts') : 'Attempts'}: ${attemptsCount}${latestAttempt ? ` · ${tt('tactic.latest','Dernier')}: ${latestAttempt.score}/${latestAttempt.total_questions}` : ''}</div></div><div class="d-flex align-items-center gap-2"><span class="badge bg-label-${badgeClass}">${escapeHtml(link.status || 'draft')}</span><a class="btn btn-sm btn-outline-primary" href="${actionHref}">${actionLabel}</a></div></div>`;
    }, tt('tactic.no_linked_quiz', 'Aucun quiz lié pour le moment.'));

    if (linkedReadStatusHost) {
      if (ctx.role === 'player') {
        linkedReadStatusHost.innerHTML = `<li class="list-group-item d-flex justify-content-between align-items-start"><div><div class="fw-semibold">${escapeHtml(playerReadState?.label || tt('tactic.to_read', 'À lire'))}</div><div class="small text-muted">${playerReadEntry?.read_at ? `${tt('tactic.last_read','Dernière lecture')}: ${new Date(playerReadEntry.read_at).toLocaleString()}` : tt('tactic.auto_mark_read', 'Cette tactique sera marquée comme lue quand tu l’ouvres.')}</div></div><span class="badge bg-label-${playerReadState?.badge || 'danger'}">v${escapeHtml(playerReadEntry?.version_seen || tactic.version || 1)}</span></li>`;
      } else {
        renderList(linkedReadStatusHost, profileRows || [], row => {
          const upToDate = Number(row.version_seen || 0) >= Number(tactic.version || 1);
          return `<li class="list-group-item d-flex justify-content-between align-items-start gap-2"><div><div class="fw-semibold">${escapeHtml(row.profile?.full_name || row.profile?.email || row.profile_id || tt('tactic.profile', 'Profil'))}</div><div class="small text-muted">${row.profile?.email ? `${escapeHtml(row.profile.email)} • ` : ''}${new Date(row.read_at).toLocaleString()}</div></div><div class="text-end"><span class="badge bg-label-${upToDate ? 'success' : 'warning'}">${upToDate ? tt('tactic.up_to_date', 'À jour') : tt('tactic.old_version', 'Ancienne version')}</span><div class="small text-muted mt-1">v${escapeHtml(row.version_seen || 0)}</div></div></li>`;
        }, tt('tactic.no_reads', 'Aucune lecture enregistrée pour le moment.'));
      }
    }

    if (diagramsListHost) {
      if (diagrams && diagrams.length) {
        diagramsListHost.innerHTML = `<div class="row g-3">${diagrams.map(diagram => {
          const payload = parseDiagramPayload(diagram.diagram_json);
          const hasAnimation = !!(payload?.animation?.baseState && Array.isArray(payload?.animation?.keyframes) && payload.animation.keyframes.length >= 2 && Number(payload.animation.durationMs || 0) > 0);
          const diagramVideoUrl = getAnimationVideoUrl(payload);
          const mediaHtml = diagramVideoUrl
            ? `<div class="border-bottom bg-dark p-2">
                 <video id="td-linked-video-${diagram.id}" data-td-timeline="td-linked-${diagram.id}" class="w-100 rounded" style="display:block;aspect-ratio:16/9;object-fit:cover;background:#0f7c3d;" src="${diagramVideoUrl}" playsinline preload="metadata"></video>
                 ${tdTimelineHtml(`td-linked-${diagram.id}`)}
               </div>`
            : (diagram.image_url ? `<img src="${diagram.image_url}" class="card-img-top" alt="${escapeHtml(diagram.title || tt('tactic.diagram', 'Diagramme'))}" style="aspect-ratio:16/9;object-fit:cover;">` : '');
          return `
          <div class="col-md-6 col-xl-4">
            <div class="card border h-100">
              ${mediaHtml}
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                  <div class="fw-semibold">${escapeHtml(diagram.title || tt('tactic.diagram', 'Diagramme'))}</div>
                  <div class="d-flex align-items-center gap-2 flex-wrap justify-content-end">
                    ${hasAnimation ? `<span class="badge bg-label-info">Animé</span>` : ''}
                    ${diagram.is_primary ? `<span class="badge bg-label-warning">${tt('match.primary', 'Principal')}</span>` : ''}
                  </div>
                </div>
                <div class="small text-muted mb-2">${diagram.updated_at ? new Date(diagram.updated_at).toLocaleString() : '—'}</div>
                <div class="d-flex flex-wrap gap-2">
                  
                  ${['admin','coach'].includes(ctx.role) ? `<a class="btn btn-sm btn-outline-dark" href="tactical-board.html?id=${tactic.id}&diagramId=${diagram.id}">${tt('tactic.edit_board', 'Modifier dans Board')}</a>` : ''}
                  ${diagram.image_url ? `<a class="btn btn-sm btn-outline-primary" href="${diagram.image_url}" target="_blank">${tt('tactic.image', 'Image')}</a>` : ''}${diagramVideoUrl ? `<a class="btn btn-sm btn-outline-secondary" href="${diagramVideoUrl}" target="_blank">WebM</a>` : ''}
                </div>
              </div>
            </div>
          </div>`;
        }).join('')}</div>`;
        try { tdBindPrimaryAndLinkedTimelines(diagramsListHost); } catch (e) { console.warn(e); }
        await initAnimatedDiagramPreviews(diagrams);
      } else {
        diagramsListHost.innerHTML = `<div class="text-muted">${tt('tactic.no_linked_diagram', 'Aucun diagramme lié pour le moment.')}</div>`;
      }
    }

  } catch (err) {
    console.error(err);
    showAlert(err.message || tt('tactic.load_failed', 'Impossible de charger la tactique.'), 'danger');
    host.innerHTML = `<div class="card"><div class="card-body">${tt('tactic.load_error', 'Erreur de chargement de la tactique.')}</div></div>`;
  }
}


// ---- Shared Timeline Detail Player (v9.1) ----
function escapeHtmlDetail(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function buildDetailTimeline(idPrefix, mediaId, autoplay = false) {
  return `
    <div class="detail-timeline mt-2" data-timeline-root="${idPrefix}">
      <div class="detail-timeline-row">
        <button id="${idPrefix}-play" class="btn btn-sm btn-primary" type="button">▶</button>
        <button id="${idPrefix}-pause" class="btn btn-sm btn-outline-secondary" type="button">⏸</button>
        <span id="${idPrefix}-time" class="detail-timeline-time">0.0s / 0.0s</span>
        <input id="${idPrefix}-slider" class="detail-timeline-slider" type="range" min="0" max="1000" value="0" step="0.01">
        <select id="${idPrefix}-speed" class="form-select form-select-sm detail-timeline-speed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
    </div>
  `;
}

function bindDetailVideoTimeline(idPrefix, videoEl) {
  if (!videoEl) return;
  const playBtn = document.getElementById(`${idPrefix}-play`);
  const pauseBtn = document.getElementById(`${idPrefix}-pause`);
  const slider = document.getElementById(`${idPrefix}-slider`);
  const speed = document.getElementById(`${idPrefix}-speed`);
  const time = document.getElementById(`${idPrefix}-time`);

  const updateUi = () => {
    const duration = Number(videoEl.duration || 0);
    const current = Number(videoEl.currentTime || 0);
    if (time) time.textContent = `${current.toFixed(1)}s / ${duration.toFixed(1)}s`;
    if (slider) {
      slider.max = String(duration || 1000);
      slider.value = String(current);
    }
  };

  if (playBtn && !playBtn.dataset.bound) {
    playBtn.dataset.bound = '1';
    playBtn.onclick = () => videoEl.play().catch(() => {});
  }
  if (pauseBtn && !pauseBtn.dataset.bound) {
    pauseBtn.dataset.bound = '1';
    pauseBtn.onclick = () => videoEl.pause();
  }
  if (slider && !slider.dataset.bound) {
    slider.dataset.bound = '1';
    slider.oninput = (e) => {
      videoEl.currentTime = Number(e.target.value || 0);
      updateUi();
    };
  }
  if (speed && !speed.dataset.bound) {
    speed.dataset.bound = '1';
    speed.onchange = (e) => {
      videoEl.playbackRate = parseFloat(e.target.value) || 1;
    };
  }

  videoEl.addEventListener('loadedmetadata', updateUi);
  videoEl.addEventListener('timeupdate', updateUi);
  videoEl.addEventListener('ended', updateUi);
  updateUi();
}

function buildWebmDiagramCard(diagram, idPrefix, asSidePreview = false) {
  const webmUrl = diagram?.animation?.webm_url || diagram?.animation?.webmUrl || diagram?.webm_url || diagram?.webmUrl || '';
  if (!webmUrl) return '';
  const title = escapeHtmlDetail(diagram?.title || diagram?.name || 'Diagram');
  const mediaClass = asSidePreview ? 'w-100 rounded border' : 'w-100 rounded border';
  return `
    <div class="card mt-3">
      <div class="card-body">
        <div class="small text-uppercase text-muted fw-semibold mb-2">${asSidePreview ? 'Preview' : 'Diagram animé'}</div>
        <video id="${idPrefix}-video" class="${mediaClass}" src="${escapeHtmlDetail(webmUrl)}" playsinline preload="metadata" ${asSidePreview ? '' : ''}></video>
        ${buildDetailTimeline(idPrefix, `${idPrefix}-video`)}
      </div>
    </div>
  `;
}

function activateDetailVideoTimelines(scope = document) {
  scope.querySelectorAll('video[id$="-video"]').forEach((videoEl) => {
    const idPrefix = videoEl.id.replace(/-video$/, '');
    bindDetailVideoTimeline(idPrefix, videoEl);
  });
}


document.addEventListener('DOMContentLoaded', () => {
  try { activateDetailVideoTimelines(); } catch (e) { console.warn(e); }
});


function buildDiagramPrimaryMedia(diagram, idPrefix = 'tactic-main') {
  const webmUrl = diagram?.animation?.webm_url || diagram?.animation?.webmUrl || diagram?.webm_url || diagram?.webmUrl || '';
  const imageUrl = diagram?.image_url || diagram?.imageUrl || diagram?.preview_url || diagram?.previewUrl || '';
  if (webmUrl) {
    return `
      <div>
        <video id="${idPrefix}-video" class="w-100 rounded border" src="${escapeHtmlDetail(webmUrl)}" playsinline preload="metadata"></video>
        ${buildDetailTimeline(idPrefix, `${idPrefix}-video`)}
      </div>
    `;
  }
  if (imageUrl) {
    return `<img src="${escapeHtmlDetail(imageUrl)}" class="w-100 rounded border" alt="Diagram">`;
  }
  return '';
}

function buildDiagramSidePreview(diagram, idPrefix = 'tactic-side') {
  const webmUrl = diagram?.animation?.webm_url || diagram?.animation?.webmUrl || diagram?.webm_url || diagram?.webmUrl || '';
  const imageUrl = diagram?.image_url || diagram?.imageUrl || diagram?.preview_url || diagram?.previewUrl || '';
  if (webmUrl) {
    return `
      <div>
        <video id="${idPrefix}-video" class="w-100 rounded border" src="${escapeHtmlDetail(webmUrl)}" playsinline preload="metadata"></video>
        ${buildDetailTimeline(idPrefix, `${idPrefix}-video`)}
      </div>
    `;
  }
  if (imageUrl) {
    return `<img src="${escapeHtmlDetail(imageUrl)}" class="w-100 rounded border" alt="Preview">`;
  }
  return '';
}


// ---- Tactic Detail WebM Override (v9.1.1) ----
function tdEscape(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tdFindWebmUrl(diagram) {
  return diagram?.animation?.webm_url
    || diagram?.animation?.webmUrl
    || diagram?.webm_url
    || diagram?.webmUrl
    || '';
}

function tdFindImageUrl(diagram) {
  return diagram?.image_url
    || diagram?.imageUrl
    || diagram?.preview_url
    || diagram?.previewUrl
    || '';
}

function tdTimelineMarkup(prefix) {
  return `
    <div class="detail-timeline mt-2">
      <div class="detail-timeline-row">
        <button id="${prefix}-play" class="btn btn-sm btn-primary" type="button">▶</button>
        <button id="${prefix}-pause" class="btn btn-sm btn-outline-secondary" type="button">⏸</button>
        <span id="${prefix}-time" class="detail-timeline-time">0.0s / 0.0s</span>
        <input id="${prefix}-slider" class="detail-timeline-slider" type="range" min="0" max="1000" value="0" step="0.01">
        <select id="${prefix}-speed" class="form-select form-select-sm detail-timeline-speed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
    </div>
  `;
}

function tdBindVideoTimeline(prefix, videoEl) {
  if (!videoEl) return;
  const playBtn = document.getElementById(`${prefix}-play`);
  const pauseBtn = document.getElementById(`${prefix}-pause`);
  const slider = document.getElementById(`${prefix}-slider`);
  const speed = document.getElementById(`${prefix}-speed`);
  const time = document.getElementById(`${prefix}-time`);

  const updateUi = () => {
    const duration = Number(videoEl.duration || 0);
    const current = Number(videoEl.currentTime || 0);
    if (time) time.textContent = `${current.toFixed(1)}s / ${duration.toFixed(1)}s`;
    if (slider) {
      slider.max = String(duration || 1000);
      slider.value = String(current);
    }
  };

  if (playBtn && !playBtn.dataset.bound) {
    playBtn.dataset.bound = '1';
    playBtn.onclick = () => videoEl.play().catch(() => {});
  }
  if (pauseBtn && !pauseBtn.dataset.bound) {
    pauseBtn.dataset.bound = '1';
    pauseBtn.onclick = () => videoEl.pause();
  }
  if (slider && !slider.dataset.bound) {
    slider.dataset.bound = '1';
    slider.oninput = (e) => {
      videoEl.currentTime = Number(e.target.value || 0);
      updateUi();
    };
  }
  if (speed && !speed.dataset.bound) {
    speed.dataset.bound = '1';
    speed.onchange = (e) => {
      videoEl.playbackRate = parseFloat(e.target.value) || 1;
    };
  }

  videoEl.addEventListener('loadedmetadata', updateUi);
  videoEl.addEventListener('timeupdate', updateUi);
  updateUi();
}

function tdActivateAllVideoTimelines(scope = document) {
  scope.querySelectorAll('video[data-td-webm]').forEach((videoEl) => {
    const prefix = videoEl.dataset.timelinePrefix;
    if (prefix) tdBindVideoTimeline(prefix, videoEl);
  });
}

function tdBuildMainMedia(diagram) {
  const webm = tdFindWebmUrl(diagram);
  const image = tdFindImageUrl(diagram);
  if (webm) {
    return `
      <div class="card mt-3" id="td-main-media-card">
        <div class="card-body">
          <div class="small text-uppercase text-muted fw-semibold mb-2">Diagram animé</div>
          <video id="td-main-video" data-td-webm="1" data-timeline-prefix="td-main" class="w-100 rounded border" src="${tdEscape(webm)}" playsinline preload="metadata"></video>
          ${tdTimelineMarkup('td-main')}
        </div>
      </div>
    `;
  }
  if (image) {
    return `
      <div class="card mt-3" id="td-main-media-card">
        <div class="card-body">
          <img src="${tdEscape(image)}" class="w-100 rounded border" alt="Diagram">
        </div>
      </div>
    `;
  }
  return '';
}

function tdBuildSideMedia(diagram) {
  const webm = tdFindWebmUrl(diagram);
  const image = tdFindImageUrl(diagram);
  if (webm) {
    return `
      <div class="card mt-3" id="td-side-media-card">
        <div class="card-body">
          <div class="small text-uppercase text-muted fw-semibold mb-2">Preview</div>
          <video id="td-side-video" data-td-webm="1" data-timeline-prefix="td-side" class="w-100 rounded border" src="${tdEscape(webm)}" playsinline preload="metadata"></video>
          
        </div>
      </div>
    `;
  }
  if (image) {
    return `
      <div class="card mt-3" id="td-side-media-card">
        <div class="card-body">
          <img src="${tdEscape(image)}" class="w-100 rounded border" alt="Preview">
        </div>
      </div>
    `;
  }
  return '';
}

function tdInjectWebmMedia(diagram) {
  if (!diagram) return;
  const webm = tdFindWebmUrl(diagram);
  if (!webm) return;

  // Main area candidates
  const candidates = [
    document.querySelector('#diagram-media'),
    document.querySelector('#diagram-preview'),
    document.querySelector('#tactic-diagram-preview'),
    document.querySelector('#diagram-main-preview'),
    document.querySelector('[data-role="diagram-main-preview"]'),
    document.querySelector('.diagram-preview-container'),
    document.querySelector('.tactic-diagram-preview')
  ].filter(Boolean);

  if (candidates.length) {
    candidates[0].innerHTML = tdBuildMainMedia(diagram);
  }

  // Side area candidates
  const sideCandidates = [
    document.querySelector('#diagram-side-preview'),
    document.querySelector('#diagram-sidebar-preview'),
    document.querySelector('#diagram-preview-side'),
    document.querySelector('[data-role="diagram-side-preview"]'),
    document.querySelector('.diagram-side-preview'),
    document.querySelector('.tactic-diagram-side-preview')
  ].filter(Boolean);

  if (sideCandidates.length) {
    sideCandidates[0].innerHTML = tdBuildSideMedia(diagram);
  }

  // Fallbacks: append into right column and main content if specific ids not found
  if (!document.getElementById('td-main-video')) {
    const mainCardHost = document.querySelector('.col-lg-8, .col-xl-8, .col-md-8');
    if (mainCardHost) {
      const wrap = document.createElement('div');
      wrap.innerHTML = tdBuildMainMedia(diagram);
      mainCardHost.appendChild(wrap.firstElementChild);
    }
  }
  if (!document.getElementById('td-side-video')) {
    const sideHost = document.querySelector('.col-lg-4, .col-xl-4, .col-md-4');
    if (sideHost) {
      const wrap = document.createElement('div');
      wrap.innerHTML = tdBuildSideMedia(diagram);
      sideHost.appendChild(wrap.firstElementChild);
    }
  }

  tdActivateAllVideoTimelines(document);
}

function tdTryInjectFromGlobals() {
  const maybeDiagrams = [
    window.currentDiagram,
    window.selectedDiagram,
    window.activeDiagram,
    window.currentTacticDiagram
  ].filter(Boolean);
  const diag = maybeDiagrams.find(d => tdFindWebmUrl(d));
  if (diag) tdInjectWebmMedia(diag);
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    try { tdTryInjectFromGlobals(); } catch (e) { console.warn(e); }
  }, 300);
});


// ---- Tactic Detail Real WebM Media Fix (v9.1.2) ----
function tdWebmUrlFromDiagram(diagram) {
  const payload = parseDiagramPayload(diagram?.diagram_json);
  return getAnimationVideoUrl(payload) || diagram?.animation?.webm_url || diagram?.webm_url || '';
}

function tdImageUrlFromDiagram(diagram) {
  return diagram?.image_url || '';
}

function tdTimelineHtml(prefix) {
  return `
    <div class="detail-timeline mt-2">
      <div class="detail-timeline-row">
        <button id="${prefix}-play" class="btn btn-sm btn-primary" type="button">▶</button>
        <button id="${prefix}-pause" class="btn btn-sm btn-outline-secondary" type="button">⏸</button>
        <span id="${prefix}-time" class="detail-timeline-time">0.0s / 0.0s</span>
        <input id="${prefix}-slider" class="detail-timeline-slider" type="range" min="0" max="1000" value="0" step="0.01">
        <select id="${prefix}-speed" class="form-select form-select-sm detail-timeline-speed">
          <option value="0.5">0.5x</option>
          <option value="1" selected>1x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2x</option>
        </select>
      </div>
    </div>
  `;
}

function tdBindTimeline(prefix, videoEl) {
  if (!videoEl) return;
  const playBtn = document.getElementById(`${prefix}-play`);
  const pauseBtn = document.getElementById(`${prefix}-pause`);
  const slider = document.getElementById(`${prefix}-slider`);
  const speed = document.getElementById(`${prefix}-speed`);
  const time = document.getElementById(`${prefix}-time`);

  const update = () => {
    const duration = Number(videoEl.duration || 0);
    const current = Number(videoEl.currentTime || 0);
    if (time) time.textContent = `${current.toFixed(1)}s / ${duration.toFixed(1)}s`;
    if (slider) {
      slider.max = String(duration || 1000);
      slider.value = String(current);
    }
  };

  if (playBtn && !playBtn.dataset.bound) {
    playBtn.dataset.bound = '1';
    playBtn.onclick = () => videoEl.play().catch(() => {});
  }
  if (pauseBtn && !pauseBtn.dataset.bound) {
    pauseBtn.dataset.bound = '1';
    pauseBtn.onclick = () => videoEl.pause();
  }
  if (slider && !slider.dataset.bound) {
    slider.dataset.bound = '1';
    slider.oninput = (e) => {
      videoEl.currentTime = Number(e.target.value || 0);
      update();
    };
  }
  if (speed && !speed.dataset.bound) {
    speed.dataset.bound = '1';
    speed.onchange = (e) => {
      videoEl.playbackRate = parseFloat(e.target.value) || 1;
    };
  }

  videoEl.addEventListener('loadedmetadata', update);
  videoEl.addEventListener('timeupdate', update);
  update();
}

function tdBindAllTimelines(scope = document) {
  scope.querySelectorAll('video[data-td-timeline]').forEach((videoEl) => {
    const prefix = videoEl.dataset.tdTimeline;
    if (prefix) tdBindTimeline(prefix, videoEl);
  });
}


// ---- Tactic Detail Primary Timeline Metadata Fix (v9.1.3) ----
function tdForceLoadVideo(videoEl) {
  if (!videoEl) return;
  try {
    videoEl.preload = 'metadata';
    videoEl.load();
  } catch (e) {
    console.warn(e);
  }
}

function tdBindPrimaryAndLinkedTimelines(scope = document) {
  try { tdBindAllTimelines(scope); } catch (e) { console.warn(e); }
  const primaryVideo = scope.querySelector('#td-primary-video');
  if (primaryVideo) {
    tdForceLoadVideo(primaryVideo);
  }
  const sideVideo = scope.querySelector('#td-side-video');
  if (sideVideo) {
    tdForceLoadVideo(sideVideo);
  }
}
