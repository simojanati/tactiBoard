import { activateMenu, setAppTitle, showAlert, clearAlert, supabase, escapeHtml } from './common.js';
import { getUserContext } from './auth.js';
const tt = (key, fallback = '') => (window.t ? window.t(key, fallback) : fallback || key);

setAppTitle(tt('page.tactical_board', 'Tactical Board'));
activateMenu('tactical-board');
const userCtx = await getUserContext();

const fabricLib = window.fabric;
if (!fabricLib) {
  showAlert(tt('board.fabric_missing', 'Fabric.js n\'a pas pu être chargé. Vérifie ta connexion internet.'), 'danger');
  throw new Error('Fabric.js missing');
}

const canvasEl = document.getElementById('tactical-canvas');
const canvas = new fabricLib.Canvas(canvasEl, {
  preserveObjectStacking: true,
  selection: true,
  backgroundColor: '#0f7c3d'
});
let BASE_CANVAS_W = 1920;
let BASE_CANVAS_H = 1080;
let CANVAS_ASPECT = BASE_CANVAS_W / BASE_CANVAS_H;
const TERRAIN_IMAGE_URLS = { horizontal: '../assets/img/terrains/terrain-horizontal.png', vertical: '../assets/img/terrains/terrain-vertical.png' };
let BOARD_ORIENTATION = window.matchMedia('(max-width: 767.98px)').matches ? 'vertical' : 'horizontal';
const terrainImageCache = { horizontal: null, vertical: null };
let CANVAS_W = BASE_CANVAS_W;
let timelinePlaying = false;
let timelineTime = 0;
let timelineSpeed = 1;
let timelineDuration = 0;
let timelineRAF = null;

let timelineStartTs = 0;
let playerPaths = [];
let pathMode = false;
let currentPath = [];
let pathDrawing = false;
let pathPlayer = null;
let pathPoints = [];
let pathTempPolyline = null;
let CANVAS_H = BASE_CANVAS_H;
canvas.setWidth(CANVAS_W);
canvas.setHeight(CANVAS_H);

function updateBoardDimensionsForOrientation() {
  if (BOARD_ORIENTATION === 'vertical') {
    BASE_CANVAS_W = 1080;
    BASE_CANVAS_H = 1920;
  } else {
    BASE_CANVAS_W = 1920;
    BASE_CANVAS_H = 1080;
  }
  CANVAS_ASPECT = BASE_CANVAS_W / BASE_CANVAS_H;
}

updateBoardDimensionsForOrientation();
CANVAS_W = BASE_CANVAS_W;
CANVAS_H = BASE_CANVAS_H;
canvas.setWidth(CANVAS_W);
canvas.setHeight(CANVAS_H);

function preloadTerrainImage(orientation) {
  return new Promise((resolve, reject) => {
    const normalized = orientation === 'vertical' ? 'vertical' : 'horizontal';
    if (terrainImageCache[normalized]) {
      resolve(terrainImageCache[normalized]);
      return;
    }
    const img = new Image();
    img.onload = () => {
      terrainImageCache[normalized] = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = TERRAIN_IMAGE_URLS[normalized];
  });
}

async function applyTerrainBackground(targetCanvas = canvas, width = CANVAS_W, height = CANVAS_H, orientation = BOARD_ORIENTATION) {
  if (!targetCanvas) return;
  const normalized = orientation === 'vertical' ? 'vertical' : 'horizontal';
  targetCanvas.backgroundColor = '#0f7c3d';
  try {
    const raw = await preloadTerrainImage(normalized);
    const bgImg = new fabricLib.Image(raw, {
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      excludeFromExport: false
    });
    bgImg.set({
      scaleX: width / raw.width,
      scaleY: height / raw.height
    });
    targetCanvas.setBackgroundImage(bgImg, targetCanvas.renderAll.bind(targetCanvas), {
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0
    });
  } catch (e) {
    console.warn('Terrain image not loaded', e);
    targetCanvas.setBackgroundImage(null, targetCanvas.renderAll.bind(targetCanvas));
  }
}

async function setBoardOrientation(nextOrientation, { preserveObjects = true, silent = false } = {}) {
  const normalized = nextOrientation === 'vertical' ? 'vertical' : 'horizontal';
  if (normalized === BOARD_ORIENTATION && !silent) {
    await applyTerrainBackground(canvas, CANVAS_W, CANVAS_H, BOARD_ORIENTATION);
    updateTerrainOrientationButton();
    return;
  }
  if (normalized === BOARD_ORIENTATION && silent) {
    updateBoardDimensionsForOrientation();
    const size = computeResponsiveCanvasSize();
    CANVAS_W = size.width;
    CANVAS_H = size.height;
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);
    await applyTerrainBackground(canvas, CANVAS_W, CANVAS_H, BOARD_ORIENTATION);
    resetViewport();
    updateTerrainOrientationButton();
    return;
  }
  const previousW = CANVAS_W;
  const previousH = CANVAS_H;
  const previousOrientation = BOARD_ORIENTATION;
  const userJson = preserveObjects ? getUserObjectsJson() : null;
  const previousPlayerPaths = Array.isArray(playerPaths) ? JSON.parse(JSON.stringify(playerPaths)) : [];
  BOARD_ORIENTATION = normalized;
  updateBoardDimensionsForOrientation();
  const size = computeResponsiveCanvasSize();
  CANVAS_W = size.width;
  CANVAS_H = size.height;
  canvas.setWidth(CANVAS_W);
  canvas.setHeight(CANVAS_H);
  if (preserveObjects && userJson?.objects?.length) {
    userJson.boardWidth = previousW;
    userJson.boardHeight = previousH;
    userJson.boardOrientation = previousOrientation;
    const originalObjectsBeforeOrientation = Array.isArray(userJson.objects) ? JSON.parse(JSON.stringify(userJson.objects)) : [];
    const rotated = transformObjectsForOrientation(userJson, previousW, previousH, CANVAS_W, CANVAS_H, previousOrientation, normalized);
    const scaled = scaleDiagramJsonToCurrent(rotated);
    await restoreBoardState(scaled);
    try {
      postProcessObjectsAfterOrientationV935(originalObjectsBeforeOrientation, previousW, previousH, CANVAS_W, CANVAS_H, previousOrientation, normalized);
    } catch (e) {
      console.warn(e);
    }

    if (previousPlayerPaths.length) {
      const mapPathPoint = (x, y) => {
        const px = Number(x || 0) / Math.max(1, previousW);
        const py = Number(y || 0) / Math.max(1, previousH);
        if (previousOrientation === 'horizontal' && normalized === 'vertical') {
          return { x: py * CANVAS_W, y: (1 - px) * CANVAS_H };
        }
        if (previousOrientation === 'vertical' && normalized === 'horizontal') {
          return { x: (1 - py) * CANVAS_W, y: px * CANVAS_H };
        }
        return { x: px * CANVAS_W, y: py * CANVAS_H };
      };
      playerPaths = previousPlayerPaths.map((path) => ({
        ...path,
        points: Array.isArray(path.points) ? path.points.map((pt) => {
          const mapped = mapPathPoint(pt.x, pt.y);
          return { ...pt, x: mapped.x, y: mapped.y };
        }) : []
      }));
    }
  } else {
    canvas.clear();
    await renderFieldBackground();
    resetViewport();
  }
  updateTerrainOrientationButton();
}

function toggleBoardOrientation() {
  const next = BOARD_ORIENTATION === 'horizontal' ? 'vertical' : 'horizontal';
  setBoardOrientation(next, { preserveObjects: true }).catch(console.error);
}

function updateTerrainOrientationButton() {
  const btn = document.getElementById('terrain-orientation-btn');
  if (!btn) return;
  const label = btn.querySelector('.tool-label');
  const shortLabel = BOARD_ORIENTATION === 'horizontal' ? 'Horizontal' : 'Vertical';
  btn.setAttribute('title', BOARD_ORIENTATION === 'horizontal' ? tt('board.field.switch_vertical','Passer en terrain vertical') : tt('board.field.switch_horizontal','Passer en terrain horizontal'));
  btn.setAttribute('aria-label', shortLabel);
  btn.dataset.shortLabel = shortLabel;
  if (label) label.textContent = shortLabel;
}

const tacticSelect = document.getElementById('tactic-select');
const saveBtn = document.getElementById('save-btn');
const saveProgressChip = document.getElementById('save-progress-chip');
const exportBtn = document.getElementById('export-btn');
const clearBtn = document.getElementById('clear-btn');
const fullscreenBtn = document.getElementById('fullscreen-btn');
const deleteSelectedBtn = document.getElementById('delete-selected-btn');
const duplicateSelectedBtn = document.getElementById('duplicate-selected-btn');
const copySelectedBtn = document.getElementById('copy-selected-btn');
const pasteSelectedBtn = document.getElementById('paste-selected-btn');
const templateOffenseBtn = document.getElementById('template-offense-btn');
const templateDefenseBtn = document.getElementById('template-defense-btn');
const templateSpecialBtn = document.getElementById('template-special-btn');
const openTacticBtn = document.getElementById('open-tactic-btn');
const boardTeamLabel = document.getElementById('board-team-label');
const diagramDateLabel = document.getElementById('diagram-date-label');
const diagramSelect = document.getElementById('diagram-select');
const diagramNewBtn = document.getElementById('diagram-new-btn');
const diagramDeleteBtn = document.getElementById('diagram-delete-btn');
const diagramPrimaryBtn = document.getElementById('diagram-primary-btn');
const diagramTitleInput = document.getElementById('diagram-title-input');
const objectProps = document.getElementById('object-properties');
const objectEmpty = document.getElementById('object-empty-state');
const propLabel = document.getElementById('prop-label');
const propColor = document.getElementById('prop-color');
const propFontsize = document.getElementById('prop-fontsize');
const propStroke = document.getElementById('prop-stroke');
const propFontsizeValue = document.getElementById('prop-fontsize-value');
const propStrokeValue = document.getElementById('prop-stroke-value');
const boardFitBtn = document.getElementById('board-fit-btn');
const zoomInBtn = document.getElementById('zoom-in-btn');
const zoomOutBtn = document.getElementById('zoom-out-btn');
const zoomResetBtn = document.getElementById('zoom-reset-btn');
const overlayZoomInBtn = document.getElementById('overlay-zoom-in-btn');
const overlayZoomOutBtn = document.getElementById('overlay-zoom-out-btn');
const overlayZoomResetBtn = document.getElementById('overlay-zoom-reset-btn');
const zoomBadge = document.getElementById('zoom-badge');
const overlayZoomBadge = document.getElementById('overlay-zoom-badge');
const undoBtn = document.getElementById('undo-btn');
const redoBtn = document.getElementById('redo-btn');
const presentationBtn = document.getElementById('presentation-btn');
const presentationBar = document.getElementById('presentation-bar');
const presentationTitle = document.getElementById('presentation-title');
const presentationLaserBtn = document.getElementById('presentation-laser-btn');
const presentationLaser = document.getElementById('presentation-laser');
const presentationStage = document.getElementById('presentation-stage');
const presentationImage = document.getElementById('presentation-image');
const presentationZoomInBtn = document.getElementById('presentation-zoom-in-btn');
const presentationZoomOutBtn = document.getElementById('presentation-zoom-out-btn');
const presentationZoomResetBtn = document.getElementById('presentation-zoom-reset-btn');
const presentationZoomBadge = document.getElementById('presentation-zoom-badge');
const presentationExitBtn = document.getElementById('presentation-exit-btn');
const animationStartBtn = document.getElementById('animation-start-btn');
const animationStopBtn = document.getElementById('animation-stop-btn');
const animationPreviewBtn = document.getElementById('animation-preview-btn');
const animationResetBtn = document.getElementById('animation-reset-btn');
const animationExportGifBtn = document.getElementById('animation-export-gif-btn');
const animationStatusBadge = document.getElementById('animation-status-badge');
const animationHelpText = document.getElementById('animation-help-text');
const tacticalBoardHost = document.getElementById('tactical-board-host');
const toolButtons = [...document.querySelectorAll('.board-tool-btn')];
const boardToolbar = document.getElementById('board-toolbar');
const toolbarToggleBtn = document.getElementById('toolbar-toggle-btn');
const boardPropertiesSidebar = document.getElementById('board-properties-sidebar');
const boardToolbarCol = document.querySelector('.board-toolbar-col');
const boardCanvasWrap = document.getElementById('board-canvas-wrap');

let tactics = [];
let currentTactic = null;
let currentDiagrams = [];
let currentDiagram = null;
let currentTool = 'select';
let isDrawing = false;
let drawingStart = null;
let tempShape = null;
let drawingMeta = null;
let isPanning = false;
let lastPosX = 0;
let lastPosY = 0;
let spacePressed = false;
let isRestoringHistory = false;
const historyStack = [];
const redoStack = [];
let autoFitZoom = 1;
let presentationMode = false;
let laserEnabled = false;
let presentationScale = 1;
let presentationTranslateX = 0;
let presentationTranslateY = 0;
let presentationDragging = false;
let presentationDragStartX = 0;
let presentationDragStartY = 0;
let copiedObjectData = null;
let animationRecording = false;
let animationStartTs = 0;
let animationLastSampleTs = 0;
let animationKeyframes = [];
let animationBaseState = null;
let animationDurationMs = 0;
let animationPreviewRunning = false;
let animationRestoringState = false;
let animationCachedHash = '';
let animationCachedWebMBlob = null;
let animationCachedObjectUrl = '';
let animationCachedDownloadName = '';

function isCoachOrAdmin() {
  return ['admin', 'coach'].includes(userCtx?.role);
}

function generateAnimId() {
  return `anim-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function isAnimatableObject(obj) {
  return !!obj && !obj.isFieldBg;
}

function ensureAnimId(obj) {
  if (!isAnimatableObject(obj)) return null;
  if (!obj.animId) obj.animId = generateAnimId();
  return obj.animId;
}

function ensureAnimIdsOnCanvas() {
  const seen = new Set();
  canvas.getObjects().forEach(obj => {
    if (!isAnimatableObject(obj)) return;
    if (!obj.animId || seen.has(obj.animId)) obj.animId = generateAnimId();
    seen.add(obj.animId);
  });
}

function getAnimatableObjects(targetCanvas = canvas) {
  return targetCanvas.getObjects().filter(isAnimatableObject);
}

function serializeAnimatableObject(obj, order = 0) {
  ensureAnimId(obj);
  return {
    animId: ensureAnimId(obj),
    order: Number(order || 0),
    left: Number(obj.left || 0),
    top: Number(obj.top || 0),
    angle: Number(obj.angle || 0),
    scaleX: Number(obj.scaleX || 1),
    scaleY: Number(obj.scaleY || 1),
    objectData: obj.toObject(['pbType', 'labelText', 'animId', 'pbArrowKind', 'pbColor', 'pbStrokeWidth', 'pbCoords', 'pbCurveSide'])
  };
}

function snapshotAnimatableObjects(targetCanvas = canvas) {
  ensureAnimIdsOnCanvas();
  return getAnimatableObjects(targetCanvas)
    .map((obj, index) => serializeAnimatableObject(obj, index))
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

function frameSignature(frame) {
  return JSON.stringify((frame?.items || []).map(item => ({
    animId: item?.animId || '',
    left: Number(item?.left || 0),
    top: Number(item?.top || 0),
    angle: Number(item?.angle || 0),
    scaleX: Number(item?.scaleX || 1),
    scaleY: Number(item?.scaleY || 1),
    order: Number(item?.order || 0)
  })));
}

function hashString(value = '') {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildAnimationSignature(animation) {
  if (!animation?.baseState || !Array.isArray(animation?.keyframes) || animation.keyframes.length < 2) return '';
  const normalized = {
    durationMs: Number(animation.durationMs || 0),
    baseState: animation.baseState,
    keyframes: animation.keyframes.map(frame => ({
      time: Number(frame?.time || 0),
      items: (frame?.items || []).map(item => ({
        animId: String(item?.animId || ''),
        order: Number(item?.order || 0),
        left: Number(item?.left || 0),
        top: Number(item?.top || 0),
        angle: Number(item?.angle || 0),
        scaleX: Number(item?.scaleX || 1),
        scaleY: Number(item?.scaleY || 1),
        objectData: item?.objectData || null
      })).sort((a, b) => Number(a.order || 0) - Number(b.order || 0) || String(a.animId).localeCompare(String(b.animId)))
    }))
  };
  return hashString(JSON.stringify(normalized));
}

function slugifyFilename(value, fallback = 'diagram') {
  const slug = String(value || fallback)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || fallback;
}

function extractSavedAnimationMeta(diagramJson) {
  try {
    const payload = unwrapStoredDiagramPayload(diagramJson);
    const animation = payload?.animation || null;
    return {
      hash: animation?.hash || '',
      webmUrl: animation?.webm_url || '',
      webmPath: animation?.webm_path || ''
    };
  } catch (_) {
    return { hash: '', webmUrl: '', webmPath: '' };
  }
}

function revokeCachedAnimationObjectUrl() {
  if (animationCachedObjectUrl) {
    try { URL.revokeObjectURL(animationCachedObjectUrl); } catch (_) {}
  }
  animationCachedObjectUrl = '';
}

function clearAnimationWebMCache() {
  animationCachedHash = '';
  animationCachedWebMBlob = null;
  animationCachedDownloadName = '';
  revokeCachedAnimationObjectUrl();
}

function cacheGeneratedAnimationWebM(blob, hash, downloadName = '') {
  if (!blob || !hash) return;
  clearAnimationWebMCache();
  animationCachedHash = hash;
  animationCachedWebMBlob = blob;
  animationCachedDownloadName = downloadName || '';
}

function getCurrentAnimationHash() {
  const storedPayload = getStoredDiagramPayload();
  if (!storedPayload?.animation) return '';
  return buildAnimationSignature(storedPayload.animation);
}

function buildWebMDownloadName() {
  const exportName = slugifyFilename(diagramTitleInput?.value || currentDiagram?.title || currentTactic?.title || 'tactical-animation', 'tactical-animation');
  return `${exportName}.webm`;
}

function triggerBrowserDownload(url, filename) {
  const a = document.createElement('a');
  if (a) a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

async function fetchBlobFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Impossible de récupérer la vidéo WebM déjà générée.');
  return await response.blob();
}

async function resolveAnimationWebMForCurrentDiagram({ preferExistingSaved = false, onProgress = null } = {}) {
  const storedPayload = getStoredDiagramPayload();
  if (!storedPayload?.animation) throw new Error('Aucune animation à exporter.');
  const animationHash = buildAnimationSignature(storedPayload.animation);
  if (!animationHash) throw new Error('Animation invalide.');
  const downloadName = buildWebMDownloadName();
  const existingMeta = extractSavedAnimationMeta(currentDiagram?.diagram_json || currentTactic?.diagram_json || null);

  if (preferExistingSaved && existingMeta.hash === animationHash && existingMeta.webmUrl) {
    return { hash: animationHash, blob: null, url: existingMeta.webmUrl, path: existingMeta.webmPath || '', reused: true, downloadName };
  }

  if (animationCachedHash === animationHash && animationCachedWebMBlob) {
    revokeCachedAnimationObjectUrl();
    animationCachedObjectUrl = URL.createObjectURL(animationCachedWebMBlob);
    return { hash: animationHash, blob: animationCachedWebMBlob, url: animationCachedObjectUrl, path: '', reused: true, downloadName: animationCachedDownloadName || downloadName };
  }

  onProgress?.('Génération WebM...', 'warning');
  const webmBlob = await generateAnimationWebMBlob();
  cacheGeneratedAnimationWebM(webmBlob, animationHash, downloadName);
  animationCachedObjectUrl = URL.createObjectURL(webmBlob);
  return { hash: animationHash, blob: webmBlob, url: animationCachedObjectUrl, path: '', reused: false, downloadName };
}

function getStoredDiagramPayload() {
  ensureAnimIdsOnCanvas();
  const board = getUserObjectsJson();
  const hasAnimation = animationKeyframes.length >= 2 && animationDurationMs > 0 && animationBaseState;
  return {
    schema: 'tactiboard.diagram.v2',
    board,
    media: {
      boardOrientation: BOARD_ORIENTATION,
      previewAspectRatio: BOARD_ORIENTATION === 'vertical' ? '9/16' : '16/9'
    },
    animation: hasAnimation ? {
      version: 1,
      baseState: typeof animationBaseState === 'string' ? JSON.parse(animationBaseState) : animationBaseState,
      keyframes: animationKeyframes,
      durationMs: animationDurationMs,
      playerPaths: Array.isArray(playerPaths) ? playerPaths.map(path => ({
        playerId: path?.playerId || null,
        points: Array.isArray(path?.points) ? path.points.map(pt => ({
          x: Number(pt?.x || 0),
          y: Number(pt?.y || 0),
          time: Number(pt?.time || 0)
        })) : []
      })) : [],
      boardOrientation: BOARD_ORIENTATION,
      savedAt: new Date().toISOString()
    } : null
  };
}

function unwrapStoredDiagramPayload(diagramJson) {
  const parsed = typeof diagramJson === 'string' ? JSON.parse(diagramJson) : diagramJson;
  if (parsed && parsed.schema === 'tactiboard.diagram.v2' && parsed.board) {
    return {
      board: parsed.board,
      animation: parsed.animation || null
    };
  }
  return {
    board: parsed,
    animation: null
  };
}

function restoreAnimationFromStoredPayload(payloadAnimation) {
  if (payloadAnimation?.baseState && Array.isArray(payloadAnimation?.keyframes) && payloadAnimation.keyframes.length >= 2) {
    animationBaseState = JSON.stringify(payloadAnimation.baseState);
    animationKeyframes = payloadAnimation.keyframes.map(frame => ({
      time: Number(frame?.time || 0),
      items: Array.isArray(frame?.items) ? frame.items.map(item => ({
        animId: String(item?.animId || ''),
        order: Number(item?.order || 0),
        left: Number(item?.left || 0),
        top: Number(item?.top || 0),
        angle: Number(item?.angle || 0),
        scaleX: Number(item?.scaleX || 1),
        scaleY: Number(item?.scaleY || 1),
        objectData: item?.objectData || null
      })) : []
    })).filter(frame => frame.items.length);
    animationDurationMs = Number(payloadAnimation?.durationMs || animationKeyframes[animationKeyframes.length - 1]?.time || 0);
    syncTimelineFromAnimation();
    playerPaths = Array.isArray(payloadAnimation?.playerPaths) ? payloadAnimation.playerPaths.map(path => ({
      playerId: path?.playerId || null,
      points: Array.isArray(path?.points) ? path.points.map(pt => ({
        x: Number(pt?.x || 0),
        y: Number(pt?.y || 0),
        time: Number(pt?.time || 0)
      })) : []
    })) : [];
  } else {
    animationKeyframes = [];
    animationBaseState = null;
    animationDurationMs = 0;
    playerPaths = [];
    syncTimelineFromAnimation();
  }
  timelineTime = 0;
  timelineUpdateUI();
  updateAnimationControls();
}

function encodeGifFromFrames(frames, width, height, delayCs = 10) {
  if (!frames?.length) throw new Error('Aucune frame à exporter.');
  const bytes = [];
  const pushByte = v => bytes.push(v & 255);
  const pushWord = v => { pushByte(v); pushByte(v >> 8); };
  const pushAscii = txt => { for (let i = 0; i < txt.length; i++) pushByte(txt.charCodeAt(i)); };
  const palette = [];
  for (let r = 0; r < 8; r++) {
    for (let g = 0; g < 8; g++) {
      for (let b = 0; b < 4; b++) {
        palette.push(Math.round((r / 7) * 255), Math.round((g / 7) * 255), Math.round((b / 3) * 255));
      }
    }
  }

  const toIndexedPixels = (rgba) => {
    const out = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < rgba.length; i += 4, p++) {
      const a = rgba[i + 3];
      const r = a === 0 ? 255 : rgba[i];
      const g = a === 0 ? 255 : rgba[i + 1];
      const b = a === 0 ? 255 : rgba[i + 2];
      out[p] = ((r >> 5) << 5) | ((g >> 5) << 2) | (b >> 6);
    }
    return out;
  };

  const lzwEncode = (indices, minCodeSize = 8) => {
    const clearCode = 1 << minCodeSize;
    const endCode = clearCode + 1;
    let codeSize = minCodeSize + 1;
    let nextCode = endCode + 1;
    let dict = new Map();
    const resetDict = () => {
      dict = new Map();
      for (let i = 0; i < clearCode; i++) dict.set(String(i), i);
      codeSize = minCodeSize + 1;
      nextCode = endCode + 1;
    };
    resetDict();
    const dataBytes = [];
    let bitBuffer = 0;
    let bitCount = 0;
    const writeCode = (code) => {
      bitBuffer |= code << bitCount;
      bitCount += codeSize;
      while (bitCount >= 8) {
        dataBytes.push(bitBuffer & 255);
        bitBuffer >>= 8;
        bitCount -= 8;
      }
    };
    writeCode(clearCode);
    let prefix = String(indices[0]);
    for (let i = 1; i < indices.length; i++) {
      const k = indices[i];
      const combined = `${prefix},${k}`;
      if (dict.has(combined)) {
        prefix = combined;
      } else {
        writeCode(dict.get(prefix));
        if (nextCode < 4096) {
          dict.set(combined, nextCode++);
          if (nextCode === (1 << codeSize) && codeSize < 12) codeSize++;
        } else {
          writeCode(clearCode);
          resetDict();
        }
        prefix = String(k);
      }
    }
    writeCode(dict.get(prefix));
    writeCode(endCode);
    if (bitCount > 0) dataBytes.push(bitBuffer & 255);
    return dataBytes;
  };

  pushAscii('GIF89a');
  pushWord(width);
  pushWord(height);
  pushByte(0b11110111); // GCT flag + 8-bit color resolution + 256 colors
  pushByte(0);
  pushByte(0);
  palette.forEach(pushByte);

  pushByte(0x21); pushByte(0xFF); pushByte(11); pushAscii('NETSCAPE2.0'); pushByte(3); pushByte(1); pushWord(0); pushByte(0);

  const delay = Math.max(2, Math.round(delayCs));
  frames.forEach(rgba => {
    const indexed = toIndexedPixels(rgba);
    const imageData = lzwEncode(indexed, 8);
    pushByte(0x21); pushByte(0xF9); pushByte(4); pushByte(0); pushWord(delay); pushByte(0); pushByte(0);
    pushByte(0x2C); pushWord(0); pushWord(0); pushWord(width); pushWord(height); pushByte(0);
    pushByte(8);
    for (let i = 0; i < imageData.length; i += 255) {
      const block = imageData.slice(i, i + 255);
      pushByte(block.length);
      block.forEach(pushByte);
    }
    pushByte(0);
  });
  pushByte(0x3B);
  return new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
}

function updateAnimationControls() {
  const hasTimeline = animationKeyframes.length >= 2 && animationDurationMs > 0;
  if (animationStartBtn) animationStartBtn.disabled = !isCoachOrAdmin() || animationRecording || animationPreviewRunning;
  if (animationStopBtn) animationStopBtn.disabled = !animationRecording;
  if (animationPreviewBtn) animationPreviewBtn.disabled = animationRecording || animationPreviewRunning || !hasTimeline;
  if (animationResetBtn) animationResetBtn.disabled = animationRecording || animationPreviewRunning || (!hasTimeline && !animationBaseState);
  if (animationExportGifBtn) animationExportGifBtn.disabled = animationRecording || animationPreviewRunning || !hasTimeline;
  if (animationStatusBadge) {
    animationStatusBadge.className = `badge ${animationRecording ? 'bg-label-danger' : (hasTimeline ? 'bg-label-success' : 'bg-label-secondary')}`;
    animationStatusBadge.textContent = animationRecording ? 'Recording...' : (hasTimeline ? `Anim prête · ${Math.round(animationDurationMs / 100) / 10}s` : 'Prêt');
  }
  if (animationHelpText) {
    animationHelpText.textContent = animationRecording
      ? 'Déplace les objets du board (joueuses, ballon, flèches, zones, lignes, textes). Les positions sont enregistrées automatiquement.'
      : (hasTimeline
        ? ''
        : "Astuce: clique sur Start, bouge les objets du board sur le terrain, puis termine pour générer l'animation. Shift + tracé sur une flèche courbe = inversion du côté.");
  }
}

function recordAnimationFrame(force = false) {
  if (!animationRecording || animationRestoringState) return;
  const now = performance.now();
  if (!force && now - animationLastSampleTs < 90) return;
  const frame = { time: Math.max(0, Math.round(now - animationStartTs)), items: snapshotAnimatableObjects() };
  if (!frame.items.length) return;
  const previous = animationKeyframes[animationKeyframes.length - 1];
  if (!force && previous && frameSignature(previous) === frameSignature(frame)) return;
  animationKeyframes.push(frame);
  animationLastSampleTs = now;
  animationDurationMs = frame.time;
  updateAnimationControls();
}

function getInterpolatedFrameAt(timeMs) {
  if (!animationKeyframes.length) return [];
  if (timeMs <= 0) return animationKeyframes[0].items;
  if (timeMs >= animationDurationMs) return animationKeyframes[animationKeyframes.length - 1].items;
  let prev = animationKeyframes[0];
  let next = animationKeyframes[animationKeyframes.length - 1];
  for (let i = 1; i < animationKeyframes.length; i++) {
    if (animationKeyframes[i].time >= timeMs) {
      next = animationKeyframes[i];
      prev = animationKeyframes[i - 1] || next;
      break;
    }
  }
  if (!prev || !next || prev.time === next.time) return prev?.items || next?.items || [];
  const ratio = (timeMs - prev.time) / (next.time - prev.time);
  const prevMap = new Map((prev.items || []).map(item => [item.animId, item]));
  const nextMap = new Map((next.items || []).map(item => [item.animId, item]));
  const ids = new Set([...prevMap.keys(), ...nextMap.keys()]);
  return [...ids].map(animId => {
    const start = prevMap.get(animId);
    const target = nextMap.get(animId);
    if (start && target) {
      return {
        animId,
        order: Number(target.order ?? start.order ?? 0),
        left: start.left + ((target.left ?? start.left) - start.left) * ratio,
        top: start.top + ((target.top ?? start.top) - start.top) * ratio,
        angle: start.angle + ((target.angle ?? start.angle) - start.angle) * ratio,
        scaleX: start.scaleX + ((target.scaleX ?? start.scaleX) - start.scaleX) * ratio,
        scaleY: start.scaleY + ((target.scaleY ?? start.scaleY) - start.scaleY) * ratio,
        objectData: target.objectData || start.objectData || null
      };
    }
    const stable = target || start;
    return {
      animId,
      order: Number(stable?.order || 0),
      left: Number(stable?.left || 0),
      top: Number(stable?.top || 0),
      angle: Number(stable?.angle || 0),
      scaleX: Number(stable?.scaleX || 1),
      scaleY: Number(stable?.scaleY || 1),
      objectData: stable?.objectData || null
    };
  }).sort((a, b) => Number(a.order || 0) - Number(b.order || 0));
}

async function enlivenAnimationObjects(serializedObjects = []) {
  if (!serializedObjects.length) return [];
  return await new Promise(resolve => {
    fabricLib.util.enlivenObjects(serializedObjects, enlivened => resolve(enlivened || []));
  });
}

function applySerializedGeometryToObject(obj, state = {}) {
  const data = state?.objectData || null;
  if (!obj || !data) return;

  if (data.pbType === 'line' && typeof data.x1 === 'number' && typeof data.y1 === 'number' && typeof data.x2 === 'number' && typeof data.y2 === 'number') {
    obj.set({
      x1: data.x1,
      y1: data.y1,
      x2: data.x2,
      y2: data.y2,
      stroke: data.stroke ?? obj.stroke,
      strokeWidth: data.strokeWidth ?? obj.strokeWidth
    });
  } else if (data.pbType === 'zone') {
    obj.set({
      left: typeof data.left === 'number' ? data.left : state.left,
      top: typeof data.top === 'number' ? data.top : state.top,
      width: typeof data.width === 'number' ? data.width : obj.width,
      height: typeof data.height === 'number' ? data.height : obj.height,
      rx: typeof data.rx === 'number' ? data.rx : obj.rx,
      ry: typeof data.ry === 'number' ? data.ry : obj.ry,
      fill: data.fill ?? obj.fill,
      stroke: data.stroke ?? obj.stroke,
      strokeWidth: data.strokeWidth ?? obj.strokeWidth,
      scaleX: typeof data.scaleX === 'number' ? data.scaleX : state.scaleX,
      scaleY: typeof data.scaleY === 'number' ? data.scaleY : state.scaleY
    });
  } else if ((data.type === 'i-text' || data.type === 'text' || data.pbType === 'text')) {
    obj.set({
      text: data.text ?? obj.text,
      fontSize: data.fontSize ?? obj.fontSize,
      fill: data.fill ?? obj.fill,
      fontWeight: data.fontWeight ?? obj.fontWeight
    });
  }
}

async function applyAnimationFrameItems(items, targetCanvas = canvas) {
  const map = new Map(items.map(item => [item.animId, item]));
  const currentObjects = getAnimatableObjects(targetCanvas);
  const currentMap = new Map(currentObjects.map(obj => [ensureAnimId(obj), obj]));

  currentObjects.forEach(obj => {
    const animId = ensureAnimId(obj);
    if (!map.has(animId)) targetCanvas.remove(obj);
  });

  const missing = items.filter(item => !currentMap.has(item.animId) && item.objectData);
  if (missing.length) {
    const enlivened = await enlivenAnimationObjects(missing.map(item => item.objectData));
    enlivened.forEach((obj, index) => {
      const item = missing[index];
      if (!obj || !item) return;
      obj.animId = item.animId;
      applySerializedGeometryToObject(obj, item);
      targetCanvas.add(obj);
    });
  }

  getAnimatableObjects(targetCanvas).forEach(obj => {
    const state = map.get(ensureAnimId(obj));
    if (!state) return;
    applySerializedGeometryToObject(obj, state);
    obj.set({ left: state.left, top: state.top, angle: state.angle, scaleX: state.scaleX, scaleY: state.scaleY });
    obj.setCoords();
    if (typeof state.order === 'number') targetCanvas.moveTo(obj, targetCanvas.getObjects().filter(o => o.isFieldBg).length + Math.max(0, Math.round(state.order)));
  });
  targetCanvas.renderAll();
}

async function restoreAnimationBaseState() {
  if (!animationBaseState) return;
  animationRestoringState = true;
  await restoreBoardState(animationBaseState);
  ensureAnimIdsOnCanvas();
  animationRestoringState = false;
}

async function startAnimationRecording() {
  if (!isCoachOrAdmin()) {
    showAlert('Seuls les coachs et admins peuvent enregistrer une animation.', 'warning');
    return;
  }
  if (animationPreviewRunning) return;
  clearAlert();
  ensureAnimIdsOnCanvas();
  animationBaseState = JSON.stringify(getUserObjectsJson());
  animationKeyframes = [];
  animationDurationMs = 0;
  clearAnimationWebMCache();
  animationRecording = true;
  animationStartTs = performance.now();
  animationLastSampleTs = 0;
  setTool('select');
  canvas.discardActiveObject();
  updateSelectionUI();
  recordAnimationFrame(true);
  showAlert("Recording démarré. Déplace les objets du board (joueuses, ballon, flèches, zones, lignes, textes) puis clique sur Terminer. Astuce: maintiens Shift pendant le tracé d'une flèche courbe pour inverser son côté.", 'info');
  updateAnimationControls();
}

function stopAnimationRecording() {
  if (!animationRecording) return;
  recordAnimationFrame(true);
  animationRecording = false;
  animationDurationMs = animationKeyframes[animationKeyframes.length - 1]?.time || 0;
  syncTimelineFromAnimation();
  if (animationKeyframes.length < 2 || animationDurationMs <= 0) {
    showAlert('Animation trop courte. Fais au moins un déplacement avant de terminer.', 'warning');
  } else {
  }
  updateAnimationControls();
}

async function previewAnimation() {
  if (animationRecording || animationPreviewRunning || animationKeyframes.length < 2) return;
  animationPreviewRunning = true;
  updateAnimationControls();
  clearAlert();
  const previousTool = currentTool;
  await restoreAnimationBaseState();
  setTool('select');
  const startedAt = performance.now();
  await new Promise(resolve => {
    const tick = (now) => {
      const elapsed = Math.min(animationDurationMs, now - startedAt);
      Promise.resolve(applyAnimationFrameItems(getInterpolatedFrameAt(elapsed))).then(() => {
        try { applyPlayerPathsAtTime(elapsed); } catch (e) { console.warn(e); }
        canvas.renderAll();
        canvas.requestRenderAll();
        if (elapsed >= animationDurationMs) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }).catch(error => {
        console.error(error);
        resolve();
      });
    };
    requestAnimationFrame(tick);
  });
  await restoreAnimationBaseState();
  animationPreviewRunning = false;
  setTool(previousTool);
  updateAnimationControls();
}

async function resetAnimationToStart() {
  if (animationRecording || animationPreviewRunning) return;
  await restoreAnimationBaseState();
  try { applyPlayerPathsAtTime(0); canvas.requestRenderAll(); } catch (e) {}
  showAlert("Board remis à la position initiale de l'animation.", 'info');
  updateAnimationControls();
}

async function createRenderCanvasFromBaseState() {
  const offscreenEl = document.createElement('canvas');
  offscreenEl.width = CANVAS_W;
  offscreenEl.height = CANVAS_H;
  const renderCanvas = new fabricLib.StaticCanvas(offscreenEl, { backgroundColor: '#0f7c3d' });
  renderCanvas.setWidth(CANVAS_W);
  renderCanvas.setHeight(CANVAS_H);
  const parsed = typeof animationBaseState === 'string' ? JSON.parse(animationBaseState) : animationBaseState;
  const sourceBoard = parsed?.board ? parsed.board : parsed;
  const sourceOrientation = sourceBoard?.boardOrientation || BOARD_ORIENTATION;
  const scaled = scaleDiagramJsonToCurrent(sourceBoard);
  await new Promise(resolve => renderCanvas.loadFromJSON(scaled, resolve));
  await drawFieldBackgroundOnCanvas(renderCanvas, CANVAS_W, CANVAS_H, sourceOrientation);
  renderCanvas.renderAll();
  return renderCanvas;
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

async function recordCanvasAnimationToWebM(renderCanvas, { width, height, fps = 24 } = {}) {
  const mimeType = selectSupportedVideoMimeType();
  if (!mimeType) throw new Error('WebM non supporté sur ce navigateur.');
  const sourceEl = renderCanvas?.lowerCanvasEl;
  if (!sourceEl?.captureStream) throw new Error('Capture vidéo du canvas indisponible.');
  const stream = sourceEl.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 4_000_000 });
  const chunks = [];
  recorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) chunks.push(event.data);
  };
  const stopped = new Promise(resolve => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
  });
  recorder.start();
  const durationSec = Math.max(0.8, animationDurationMs / 1000);
  const frameCount = Math.max(12, Math.round(durationSec * fps));
  for (let i = 0; i < frameCount; i++) {
    const ratio = frameCount === 1 ? 1 : i / (frameCount - 1);
    const elapsed = animationDurationMs * ratio;
    await applyAnimationFrameItems(getInterpolatedFrameAt(elapsed), renderCanvas);
    try { applyPlayerPathsAtTimeForCanvas(elapsed, renderCanvas); } catch (e) { console.warn(e); }
    renderCanvas.renderAll();
    await new Promise(resolve => setTimeout(resolve, Math.max(12, 1000 / fps)));
  }
  recorder.stop();
  stream.getTracks().forEach(track => track.stop());
  return stopped;
}

async function exportAnimationGif() {
  if (animationRecording || animationPreviewRunning || animationKeyframes.length < 2) return;
  animationPreviewRunning = true;
  updateAnimationControls();
  clearAlert();
  const prevLabel = animationExportGifBtn?.innerHTML;
  if (animationExportGifBtn) animationExportGifBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>WebM...';
  try {
    const resolved = await resolveAnimationWebMForCurrentDiagram({ preferExistingSaved: true });
    let downloadBlob = resolved.blob || null;
    if (!downloadBlob && resolved.url) {
      downloadBlob = await fetchBlobFromUrl(resolved.url);
      cacheGeneratedAnimationWebM(downloadBlob, resolved.hash, resolved.downloadName);
    }
    if (!downloadBlob) throw new Error('Impossible de préparer la vidéo WebM à télécharger.');
    const downloadUrl = URL.createObjectURL(downloadBlob);
    triggerBrowserDownload(downloadUrl, resolved.downloadName || buildWebMDownloadName());
    window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
    if (resolved.blob) {
      window.setTimeout(() => revokeCachedAnimationObjectUrl(), 4000);
      showAlert('Vidéo WebM générée avec succès.', 'success');
    } else {
      showAlert('Vidéo WebM déjà générée. Téléchargement lancé.', 'success');
    }
    await restoreAnimationBaseState();
  } catch (err) {
    console.error(err);
    showAlert(err.message || 'Impossible de générer la vidéo WebM.', 'danger');
  } finally {
    animationPreviewRunning = false;
    if (animationExportGifBtn && prevLabel) animationExportGifBtn.innerHTML = prevLabel;
    updateAnimationControls();
  }
}

function isMobileBoardMode() {
  return window.matchMedia('(max-width: 767.98px)').matches;
}

function getWrapMetrics() {
  if (!boardCanvasWrap) return { width: BASE_CANVAS_W, height: BASE_CANVAS_H };
  const styles = window.getComputedStyle(boardCanvasWrap);
  const padX = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
  const padY = (parseFloat(styles.paddingTop) || 0) + (parseFloat(styles.paddingBottom) || 0);
  return {
    width: Math.max(boardCanvasWrap.clientWidth - padX - 4, 320),
    height: Math.max(boardCanvasWrap.clientHeight - padY - 4, 260)
  };
}

function computeResponsiveCanvasSize() {
  const viewport = getWrapMetrics();
  let width = Math.max(320, Math.round(viewport.width || BASE_CANVAS_W));
  let height = width / Math.max(0.0001, CANVAS_ASPECT);

  const hardMaxHeight = window.matchMedia('(max-width: 991.98px)').matches
    ? Math.max(360, Math.round(window.innerHeight * 0.72))
    : Math.max(260, viewport.height || Math.round(window.innerHeight * 0.72));

  if (height > hardMaxHeight) {
    height = hardMaxHeight;
    width = height * CANVAS_ASPECT;
  }

  width = Math.max(320, Math.round(width));
  height = Math.max(220, Math.round(height));
  return { width, height };
}

function scaleSerializedNode(node, sx, sy) {
  if (!node || typeof node !== 'object') return node;
  const numKeysX = ['left', 'x1', 'x2', 'width', 'rx', 'radius'];
  const numKeysY = ['top', 'y1', 'y2', 'height', 'ry'];
  for (const key of numKeysX) {
    if (typeof node[key] === 'number') node[key] *= sx;
  }
  for (const key of numKeysY) {
    if (typeof node[key] === 'number') node[key] *= sy;
  }
  if (typeof node.fontSize === 'number') node.fontSize *= Math.min(sx, sy);
  if (typeof node.strokeWidth === 'number') node.strokeWidth *= Math.min(sx, sy);
  if (typeof node.scaleX === 'number') node.scaleX *= sx;
  if (typeof node.scaleY === 'number') node.scaleY *= sy;
  if (Array.isArray(node.points)) {
    node.points = node.points.map(pt => ({ ...pt, x: typeof pt.x === 'number' ? pt.x * sx : pt.x, y: typeof pt.y === 'number' ? pt.y * sy : pt.y }));
  }
  if (Array.isArray(node.objects)) node.objects = node.objects.map(child => scaleSerializedNode(child, sx, sy));
  return node;
}

function transformObjectsForOrientation(json, prevW, prevH, newW, newH, fromOrientation = 'horizontal', toOrientation = 'vertical') {
  if (!json || !Array.isArray(json.objects) || fromOrientation === toOrientation) return json;
  const cloned = JSON.parse(JSON.stringify(json));

  const mapPoint = (x, y) => {
    const px = Number(x || 0) / Math.max(1, prevW);
    const py = Number(y || 0) / Math.max(1, prevH);

    if (fromOrientation === 'horizontal' && toOrientation === 'vertical') {
      return { x: py * newW, y: (1 - px) * newH };
    }
    if (fromOrientation === 'vertical' && toOrientation === 'horizontal') {
      return { x: (1 - py) * newW, y: px * newH };
    }
    return { x: px * newW, y: py * newH };
  };

  const angleDelta = fromOrientation === 'horizontal' && toOrientation === 'vertical' ? 90
    : fromOrientation === 'vertical' && toOrientation === 'horizontal' ? -90
    : 0;

  cloned.objects = cloned.objects.map((obj) => {
    const o = { ...obj };

    if (typeof o.left === 'number' && typeof o.top === 'number') {
      const pt = mapPoint(o.left, o.top);
      o.left = pt.x;
      o.top = pt.y;
    }

    if (typeof o.angle === 'number') {
      o.angle = (o.angle + angleDelta + 360) % 360;
    }

    if (Array.isArray(o.points)) {
      o.points = o.points.map((pt) => {
        const mapped = mapPoint(pt.x, pt.y);
        return { ...pt, x: mapped.x, y: mapped.y };
      });
    }

    if (typeof o.x1 === 'number' && typeof o.y1 === 'number') {
      const pt1 = mapPoint(o.x1, o.y1);
      o.x1 = pt1.x;
      o.y1 = pt1.y;
    }
    if (typeof o.x2 === 'number' && typeof o.y2 === 'number') {
      const pt2 = mapPoint(o.x2, o.y2);
      o.x2 = pt2.x;
      o.y2 = pt2.y;
    }

    if (typeof o.pathOffset?.x === 'number' && typeof o.pathOffset?.y === 'number') {
      const po = mapPoint(o.pathOffset.x, o.pathOffset.y);
      o.pathOffset = { ...o.pathOffset, x: po.x, y: po.y };
    }

    return o;
  });

  cloned.boardWidth = newW;
  cloned.boardHeight = newH;
  cloned.boardOrientation = toOrientation;
  return cloned;
}

function scaleDiagramJsonToCurrent(parsed) {
  const sourceW = Number(parsed?.boardWidth || parsed?.canvasWidth || BASE_CANVAS_W) || BASE_CANVAS_W;
  const sourceH = Number(parsed?.boardHeight || parsed?.canvasHeight || BASE_CANVAS_H) || BASE_CANVAS_H;
  const sx = CANVAS_W / sourceW;
  const sy = CANVAS_H / sourceH;
  if (Math.abs(sx - 1) < 0.001 && Math.abs(sy - 1) < 0.001) return parsed;
  const cloned = JSON.parse(JSON.stringify(parsed));
  if (Array.isArray(cloned.objects)) cloned.objects = cloned.objects.map(obj => scaleSerializedNode(obj, sx, sy));
  cloned.boardWidth = CANVAS_W;
  cloned.boardHeight = CANVAS_H;
  return cloned;
}

function resizeBoardCanvas({ preserveObjects = true } = {}) {
  const previousW = CANVAS_W;
  const previousH = CANVAS_H;
  const userJson = preserveObjects ? getUserObjectsJson() : null;
  const size = computeResponsiveCanvasSize();
  CANVAS_W = size.width;
  CANVAS_H = size.height;
  canvas.setWidth(CANVAS_W);
  canvas.setHeight(CANVAS_H);

function updateBoardDimensionsForOrientation() {
  if (BOARD_ORIENTATION === 'vertical') {
    BASE_CANVAS_W = 1080;
    BASE_CANVAS_H = 1920;
  } else {
    BASE_CANVAS_W = 1920;
    BASE_CANVAS_H = 1080;
  }
  CANVAS_ASPECT = BASE_CANVAS_W / BASE_CANVAS_H;
}

updateBoardDimensionsForOrientation();
CANVAS_W = BASE_CANVAS_W;
CANVAS_H = BASE_CANVAS_H;
canvas.setWidth(CANVAS_W);
canvas.setHeight(CANVAS_H);

function preloadTerrainImage(orientation) {
  return new Promise((resolve, reject) => {
    const normalized = orientation === 'vertical' ? 'vertical' : 'horizontal';
    if (terrainImageCache[normalized]) {
      resolve(terrainImageCache[normalized]);
      return;
    }
    const img = new Image();
    img.onload = () => {
      terrainImageCache[normalized] = img;
      resolve(img);
    };
    img.onerror = reject;
    img.src = TERRAIN_IMAGE_URLS[normalized];
  });
}

async function applyTerrainBackground(targetCanvas = canvas, width = CANVAS_W, height = CANVAS_H, orientation = BOARD_ORIENTATION) {
  if (!targetCanvas) return;
  const normalized = orientation === 'vertical' ? 'vertical' : 'horizontal';
  targetCanvas.backgroundColor = '#0f7c3d';
  try {
    const raw = await preloadTerrainImage(normalized);
    const bgImg = new fabricLib.Image(raw, {
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0,
      selectable: false,
      evented: false,
      excludeFromExport: false
    });
    bgImg.set({
      scaleX: width / raw.width,
      scaleY: height / raw.height
    });
    targetCanvas.setBackgroundImage(bgImg, targetCanvas.renderAll.bind(targetCanvas), {
      originX: 'left',
      originY: 'top',
      left: 0,
      top: 0
    });
  } catch (e) {
    console.warn('Terrain image not loaded', e);
    targetCanvas.setBackgroundImage(null, targetCanvas.renderAll.bind(targetCanvas));
  }
}

async function setBoardOrientation(nextOrientation, { preserveObjects = true, silent = false } = {}) {
  const normalized = nextOrientation === 'vertical' ? 'vertical' : 'horizontal';
  if (normalized === BOARD_ORIENTATION && !silent) {
    await applyTerrainBackground(canvas, CANVAS_W, CANVAS_H, BOARD_ORIENTATION);
    updateTerrainOrientationButton();
    return;
  }
  if (normalized === BOARD_ORIENTATION && silent) {
    updateBoardDimensionsForOrientation();
    const size = computeResponsiveCanvasSize();
    CANVAS_W = size.width;
    CANVAS_H = size.height;
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);
    await applyTerrainBackground(canvas, CANVAS_W, CANVAS_H, BOARD_ORIENTATION);
    resetViewport();
    updateTerrainOrientationButton();
    return;
  }
  const previousW = CANVAS_W;
  const previousH = CANVAS_H;
  const previousOrientation = BOARD_ORIENTATION;
  const userJson = preserveObjects ? getUserObjectsJson() : null;
  const previousPlayerPaths = Array.isArray(playerPaths) ? JSON.parse(JSON.stringify(playerPaths)) : [];
  BOARD_ORIENTATION = normalized;
  updateBoardDimensionsForOrientation();
  const size = computeResponsiveCanvasSize();
  CANVAS_W = size.width;
  CANVAS_H = size.height;
  canvas.setWidth(CANVAS_W);
  canvas.setHeight(CANVAS_H);
  if (preserveObjects && userJson?.objects?.length) {
    userJson.boardWidth = previousW;
    userJson.boardHeight = previousH;
    userJson.boardOrientation = previousOrientation;
    const originalObjectsBeforeOrientation = Array.isArray(userJson.objects) ? JSON.parse(JSON.stringify(userJson.objects)) : [];
    const rotated = transformObjectsForOrientation(userJson, previousW, previousH, CANVAS_W, CANVAS_H, previousOrientation, normalized);
    const scaled = scaleDiagramJsonToCurrent(rotated);
    await restoreBoardState(scaled);
    try {
      postProcessObjectsAfterOrientationV935(originalObjectsBeforeOrientation, previousW, previousH, CANVAS_W, CANVAS_H, previousOrientation, normalized);
    } catch (e) {
      console.warn(e);
    }

    if (previousPlayerPaths.length) {
      const mapPathPoint = (x, y) => {
        const px = Number(x || 0) / Math.max(1, previousW);
        const py = Number(y || 0) / Math.max(1, previousH);
        if (previousOrientation === 'horizontal' && normalized === 'vertical') {
          return { x: py * CANVAS_W, y: (1 - px) * CANVAS_H };
        }
        if (previousOrientation === 'vertical' && normalized === 'horizontal') {
          return { x: (1 - py) * CANVAS_W, y: px * CANVAS_H };
        }
        return { x: px * CANVAS_W, y: py * CANVAS_H };
      };
      playerPaths = previousPlayerPaths.map((path) => ({
        ...path,
        points: Array.isArray(path.points) ? path.points.map((pt) => {
          const mapped = mapPathPoint(pt.x, pt.y);
          return { ...pt, x: mapped.x, y: mapped.y };
        }) : []
      }));
    }
  } else {
    canvas.clear();
    await renderFieldBackground();
    resetViewport();
  }
  updateTerrainOrientationButton();
}

function toggleBoardOrientation() {
  const next = BOARD_ORIENTATION === 'horizontal' ? 'vertical' : 'horizontal';
  setBoardOrientation(next, { preserveObjects: true }).catch(console.error);
}

function updateTerrainOrientationButton() {
  const btn = document.getElementById('terrain-orientation-btn');
  if (!btn) return;
  const label = btn.querySelector('.tool-label');
  const shortLabel = BOARD_ORIENTATION === 'horizontal' ? 'Horizontal' : 'Vertical';
  btn.setAttribute('title', BOARD_ORIENTATION === 'horizontal' ? tt('board.field.switch_vertical','Passer en terrain vertical') : tt('board.field.switch_horizontal','Passer en terrain horizontal'));
  btn.setAttribute('aria-label', shortLabel);
  btn.dataset.shortLabel = shortLabel;
  if (label) label.textContent = shortLabel;
}

  if (preserveObjects && userJson?.objects?.length) {
    const sx = CANVAS_W / previousW;
    const sy = CANVAS_H / previousH;
    userJson.boardWidth = previousW;
    userJson.boardHeight = previousH;
    const scaled = scaleDiagramJsonToCurrent(userJson);
    restoreBoardState(scaled).catch(console.error);
    return;
  }
  renderFieldBackground().then(() => resetViewport());
}

function getCanvasViewportSize() {
  return getWrapMetrics();
}

function applyAutoFitZoom(forceCenter = false) {
  if (!boardCanvasWrap) return;
  const viewport = getCanvasViewportSize();
  const zoomX = viewport.width / CANVAS_W;
  const zoomY = viewport.height / CANVAS_H;
  autoFitZoom = Math.min(1, zoomX, zoomY);
  if (!Number.isFinite(autoFitZoom) || autoFitZoom <= 0) autoFitZoom = 1;
  const offsetX = presentationMode ? Math.max(0, (viewport.width - (CANVAS_W * autoFitZoom)) / 2) : 0;
  const offsetY = presentationMode ? Math.max(0, (viewport.height - (CANVAS_H * autoFitZoom)) / 2) : 0;
  canvas.setViewportTransform([autoFitZoom, 0, 0, autoFitZoom, offsetX, offsetY]);
  setZoomBadge();
  try { applyPlayerPathsAtTime(animationElapsed || currentTimeMs || playheadMs || 0); } catch (e) {}
  canvas.requestRenderAll();
  centerBoardScroll(forceCenter);
}

function centerBoardScroll(force = false) {
  if (!boardCanvasWrap) return;

  const alignBoard = () => {
    const canvasContainer = boardCanvasWrap.querySelector('.canvas-container') || boardCanvasWrap.querySelector('canvas') || boardCanvasWrap.firstElementChild;
    if (canvasContainer && canvasContainer.style) {
      canvasContainer.style.marginLeft = '0';
      canvasContainer.style.marginRight = '0';
    }
    boardCanvasWrap.scrollLeft = 0;
    boardCanvasWrap.scrollTop = 0;
  };

  if (force) {
    alignBoard();
    requestAnimationFrame(alignBoard);
    setTimeout(alignBoard, 40);
    return;
  }

  requestAnimationFrame(alignBoard);
}

function setZoomBadge() {
  const boardValue = `${Math.round(canvas.getZoom() * 100)}%`;
  if (zoomBadge) zoomBadge.textContent = boardValue;
  if (overlayZoomBadge) overlayZoomBadge.textContent = boardValue;
  const presentationValue = `${Math.round((presentationMode ? presentationScale : canvas.getZoom()) * 100)}%`;
  if (presentationZoomBadge) presentationZoomBadge.textContent = presentationValue;
}

function updateHistoryButtons() {
  if (undoBtn) undoBtn.disabled = historyStack.length <= 1;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function serializeBoardState() {
  return JSON.stringify(getUserObjectsJson());
}

function pushHistoryState() {
  if (isRestoringHistory) return;
  const state = serializeBoardState();
  if (historyStack.length && historyStack[historyStack.length - 1] === state) {
    updateHistoryButtons();
    return;
  }
  historyStack.push(state);
  if (historyStack.length > 80) historyStack.shift();
  redoStack.length = 0;
  updateHistoryButtons();
}

async function restoreBoardState(state) {
  isRestoringHistory = true;
  canvas.clear();
  await renderFieldBackground();
  resetViewport();
  if (state) {
    const parsed = typeof state === 'string' ? JSON.parse(state) : state;
    await new Promise(resolve => canvas.loadFromJSON(parsed, resolve));
  }
  await renderFieldBackground();
  canvas.discardActiveObject();
  ensureAnimIdsOnCanvas();
  canvas.renderAll();
  updateSelectionUI();
  isRestoringHistory = false;
  updateHistoryButtons();
}

async function undoBoard() {
  if (historyStack.length <= 1) return;
  const current = historyStack.pop();
  redoStack.push(current);
  await restoreBoardState(historyStack[historyStack.length - 1]);
}

async function redoBoard() {
  if (!redoStack.length) return;
  const state = redoStack.pop();
  historyStack.push(state);
  await restoreBoardState(state);
}

function resetViewport() {
  if (presentationMode) {
    fitPresentationImage();
    return;
  }
  applyAutoFitZoom(true);
}

function zoomToPoint(point, delta) {
  let zoom = canvas.getZoom();
  zoom *= delta;
  if (zoom > 2.5) zoom = 2.5;
  if (zoom < 0.55) zoom = 0.55;
  canvas.zoomToPoint(point, zoom);
  setZoomBadge();
}

function zoomStep(delta) {
  if (presentationMode) {
    zoomPresentation(delta);
    return;
  }
  zoomToPoint(new fabricLib.Point(CANVAS_W / 2, CANVAS_H / 2), delta);
  centerBoardScroll();
}

function setTool(tool) {
  if (currentTool === 'path' && tool !== 'path') finishPlayerPath();
  currentTool = tool;
  toolButtons.forEach(btn => {
    if (btn.classList.contains('board-toolbar-action') || btn.dataset.noToolActive === '1') {
      btn.classList.remove('active');
      return;
    }
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });
  canvas.isDrawingMode = false;
  canvas.selection = tool === 'select';
  if (tool === 'pan') canvas.defaultCursor = 'grab';
  else canvas.defaultCursor = tool === 'select' ? 'default' : 'crosshair';
}

if (boardToolbar) boardToolbar.classList.remove('collapsed');
if (boardToolbarCol) boardToolbarCol.classList.add('is-expanded');
if (toolbarToggleBtn) toolbarToggleBtn.classList.add('d-none');

if (toolbarToggleBtn && boardToolbar) {
  toolbarToggleBtn?.addEventListener('click', () => {
    boardToolbar.classList.toggle('collapsed');
    boardToolbarCol?.classList.toggle('is-expanded', !boardToolbar.classList.contains('collapsed'));
    const icon = toolbarToggleBtn.querySelector('i');
    if (icon) {
      icon.className = boardToolbar.classList.contains('collapsed') ? 'bx bx-chevrons-right' : 'bx bx-chevrons-left';
    }
    centerBoardScroll(true);
  });
}

canvas.on('mouse:wheel', function(opt) {
  if (presentationMode) return;
  opt.e.preventDefault();
  opt.e.stopPropagation();
  const delta = opt.e.deltaY;
  let zoom = canvas.getZoom();
  zoom *= 0.999 ** delta;
  if (zoom > 2.5) zoom = 2.5;
  if (zoom < 0.55) zoom = 0.55;
  canvas.zoomToPoint({ x: opt.e.offsetX, y: opt.e.offsetY }, zoom);
  setZoomBadge();
});

window?.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    spacePressed = true;
    if (currentTool !== 'pan') canvas.defaultCursor = 'grab';
  }
});
window?.addEventListener('keyup', (e) => {
  if (e.code === 'Space') {
    spacePressed = false;
    if (currentTool !== 'pan') canvas.defaultCursor = currentTool === 'select' ? 'default' : 'crosshair';
  }
});

function capturePresentationSnapshot() {
  if (!presentationImage) return;
  const previousVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1,0,0,1,0,0];
  const previousSelection = canvas.selection;
  const active = canvas.getActiveObject();
  if (active) canvas.discardActiveObject();
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.renderAll();
  presentationImage.src = canvas.toDataURL({ format: 'png', multiplier: 1 });
  canvas.setViewportTransform(previousVpt);
  canvas.selection = previousSelection;
  canvas.renderAll();
}

function updatePresentationTransform() {
  if (!presentationImage) return;
  presentationImage.style.transform = `translate(${presentationTranslateX}px, ${presentationTranslateY}px) scale(${presentationScale})`;
}

function fitPresentationImage() {
  if (!presentationStage || !presentationImage) return;
  const vw = Math.max(320, presentationStage.clientWidth || 0);
  const vh = Math.max(220, presentationStage.clientHeight || 0);
  const scaleX = vw / CANVAS_W;
  const scaleY = vh / CANVAS_H;
  presentationScale = Math.min(scaleX, scaleY);
  const fittedW = CANVAS_W * presentationScale;
  const fittedH = CANVAS_H * presentationScale;
  presentationTranslateX = (vw - fittedW) / 2;
  presentationTranslateY = (vh - fittedH) / 2;
  updatePresentationTransform();
  setZoomBadge();
}

function zoomPresentation(delta) {
  if (!presentationStage || !presentationImage) return;
  const rect = presentationStage.getBoundingClientRect();
  const centerX = rect.width / 2;
  const centerY = rect.height / 2;
  const prevScale = presentationScale;
  presentationScale = Math.max(0.2, Math.min(3, presentationScale * delta));
  presentationTranslateX = centerX - ((centerX - presentationTranslateX) * (presentationScale / prevScale));
  presentationTranslateY = centerY - ((centerY - presentationTranslateY) * (presentationScale / prevScale));
  updatePresentationTransform();
  setZoomBadge();
}

function togglePresentationMode(force = null) {
  presentationMode = force === null ? !presentationMode : Boolean(force);
  document.body.classList.toggle('board-presentation-mode', presentationMode);
  presentationBar?.classList.toggle('d-none', !presentationMode);
  presentationStage?.classList.toggle('d-none', !presentationMode);
  canvasEl.classList.toggle('d-none', presentationMode);
  const canvasContainer = boardCanvasWrap?.querySelector('.canvas-container');
  canvasContainer?.classList.toggle('d-none', presentationMode);
  if (presentationTitle) presentationTitle.textContent = currentTactic?.title || 'Tactical Board';
  if (!presentationMode) {
    laserEnabled = false;
    presentationLaser?.classList.add('d-none');
    boardCanvasWrap?.classList.remove('laser-active');
    setZoomBadge();
    return;
  }
  capturePresentationSnapshot();
  requestAnimationFrame(() => {
    fitPresentationImage();
  });
}

function toggleLaser() {
  laserEnabled = !laserEnabled;
  presentationLaser?.classList.toggle('d-none', !laserEnabled);
  boardCanvasWrap?.classList.toggle('laser-active', laserEnabled);
}

function moveLaser(clientX, clientY) {
  if (!presentationMode || !laserEnabled || !boardCanvasWrap || !presentationLaser) return;
  const rect = boardCanvasWrap.getBoundingClientRect();
  presentationLaser.style.left = `${clientX - rect.left}px`;
  presentationLaser.style.top = `${clientY - rect.top}px`;
}

function fieldBg(obj) {
  obj.isFieldBg = true;
  obj.selectable = false;
  obj.evented = false;
  obj.hoverCursor = 'default';
  return obj;
}

async function drawFieldBackgroundOnCanvas(targetCanvas, width, height, orientation = BOARD_ORIENTATION) {
  if (!targetCanvas) return;
  targetCanvas.getObjects().filter(obj => obj.isFieldBg).forEach(obj => targetCanvas.remove(obj));
  await applyTerrainBackground(targetCanvas, width, height, orientation);
  targetCanvas.renderAll();
}

async function renderFieldBackground() {
  canvas.getObjects().filter(obj => obj.isFieldBg).forEach(obj => canvas.remove(obj));
  await applyTerrainBackground(canvas, CANVAS_W, CANVAS_H, BOARD_ORIENTATION);
  canvas.renderAll();
}

function getUserObjectsJson() {
  return {
    version: fabricLib.version,
    boardWidth: CANVAS_W,
    boardHeight: CANVAS_H,
    boardOrientation: BOARD_ORIENTATION,
    objects: canvas.getObjects().filter(obj => !obj.isFieldBg).map(obj => { ensureAnimId(obj); return obj.toObject(['pbType', 'labelText', 'animId', 'pbArrowKind', 'pbColor', 'pbStrokeWidth', 'pbCoords', 'pbCurveSide']); })
  };
}

function updateSelectionUI() {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) {
    objectProps.classList.add('d-none');
    objectEmpty.classList.remove('d-none');
    boardPropertiesSidebar?.classList.add('is-empty');
    return;
  }
  objectProps.classList.remove('d-none');
  objectEmpty.classList.add('d-none');
  boardPropertiesSidebar?.classList.remove('is-empty');
  propLabel.value = active.labelText || active.text || '';
  propColor.value = normalizeColor(active.stroke || active.fill || '#696cff');
  propFontsize.value = active.fontSize || 16;
  propStroke.value = active.strokeWidth || 3;
  if (propFontsizeValue) propFontsizeValue.textContent = String(propFontsize.value);
  if (propStrokeValue) propStrokeValue.textContent = String(propStroke.value);
}

function normalizeColor(color) {
  if (!color || typeof color !== 'string') return '#696cff';
  if (color.startsWith('#')) return color;
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return '#696cff';
  return '#' + [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('');
}

// orientationAwareTemplatePositionsV941
function getTemplateMarkerPositionsV941(type = 'offense') {
  const isVertical = BOARD_ORIENTATION === 'vertical';
  if (isVertical) {
    if (type === 'offense') {
      return [
        { x: CANVAS_W * 0.50, y: CANVAS_H * 0.72, label: 'QB' },
        { x: CANVAS_W * 0.36, y: CANVAS_H * 0.76, label: 'L' },
        { x: CANVAS_W * 0.64, y: CANVAS_H * 0.76, label: 'R' },
        { x: CANVAS_W * 0.50, y: CANVAS_H * 0.80, label: 'K' },
        { x: CANVAS_W * 0.50, y: CANVAS_H * 0.86, label: 'B' }
      ];
    }
    if (type === 'defense') {
      return [
        { x: CANVAS_W * 0.34, y: CANVAS_H * 0.60, label: 'X' },
        { x: CANVAS_W * 0.66, y: CANVAS_H * 0.60, label: 'X' },
        { x: CANVAS_W * 0.34, y: CANVAS_H * 0.50, label: 'G' },
        { x: CANVAS_W * 0.66, y: CANVAS_H * 0.50, label: 'G' }
      ];
    }
    return [
      { x: CANVAS_W * 0.50, y: CANVAS_H * 0.22, label: 'K' },
      { x: CANVAS_W * 0.50, y: CANVAS_H * 0.30, label: 'P' },
      { x: CANVAS_W * 0.36, y: CANVAS_H * 0.38, label: 'L' },
      { x: CANVAS_W * 0.64, y: CANVAS_H * 0.38, label: 'R' }
    ];
  }

  if (type === 'offense') {
    return [
      { x: CANVAS_W * 0.25, y: CANVAS_H * 0.50, label: 'QB' },
      { x: CANVAS_W * 0.18, y: CANVAS_H * 0.40, label: 'L' },
      { x: CANVAS_W * 0.18, y: CANVAS_H * 0.60, label: 'R' },
      { x: CANVAS_W * 0.25, y: CANVAS_H * 0.60, label: 'TE' },
      { x: CANVAS_W * 0.14, y: CANVAS_H * 0.50, label: 'B' }
    ];
  }
  if (type === 'defense') {
    return [
      { x: CANVAS_W * 0.50, y: CANVAS_H * 0.35, label: 'X' },
      { x: CANVAS_W * 0.50, y: CANVAS_H * 0.65, label: 'X' },
      { x: CANVAS_W * 0.46, y: CANVAS_H * 0.50, label: 'G' },
      { x: CANVAS_W * 0.62, y: CANVAS_H * 0.50, label: 'G' }
    ];
  }
  return [
    { x: CANVAS_W * 0.32, y: CANVAS_H * 0.50, label: 'K' },
    { x: CANVAS_W * 0.20, y: CANVAS_H * 0.50, label: 'B' },
    { x: CANVAS_W * 0.12, y: CANVAS_H * 0.42, label: 'L' },
    { x: CANVAS_W * 0.12, y: CANVAS_H * 0.58, label: 'R' }
  ];
}
function addMarker(type, x, y, labelOverride = null) {
  const fill = type === 'offense' ? '#696cff' : type === 'defense' ? '#ff3e1d' : '#8b5e3c';
  const radius = type === 'ball' ? 18 : 24;
  const label = type === 'offense' ? 'O' : type === 'defense' ? 'X' : 'B';
  const shape = type === 'ball'
    ? new fabricLib.Ellipse({ rx: radius, ry: 14, fill, stroke: '#ffffff', strokeWidth: 2, originX: 'center', originY: 'center' })
    : new fabricLib.Circle({ radius, fill, stroke: '#ffffff', strokeWidth: 2, originX: 'center', originY: 'center' });
  const text = new fabricLib.Text(label, { originX: 'center', originY: 'center', fontSize: 18, fill: '#fff', fontWeight: 700 });
  const group = new fabricLib.Group([shape, text], { left: x, top: y, originX: 'center', originY: 'center' });
  group.pbType = type;
  group.labelText = label;
  ensureAnimId(group);
  canvas.add(group).setActiveObject(group);
  canvas.renderAll();
}

function addText(x, y) {
  const text = new fabricLib.IText('Texte', { left: x, top: y, fill: '#ffffff', fontSize: 20, fontWeight: 600 });
  text.pbType = 'text';
  text.labelText = 'Texte';
  canvas.add(text).setActiveObject(text);
  text.enterEditing();
  canvas.renderAll();
}

function buildArrowGroup(objects, pbType, meta = {}) {
  const group = new fabricLib.Group(objects, {});
  group.pbType = pbType;
  group.labelText = '';
  Object.entries(meta).forEach(([key, value]) => { group[key] = value; });
  return group;
}

function buildArrow(x1, y1, x2, y2, color = '#ffab00', width = 4) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = 18;
  const line = new fabricLib.Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width, selectable: false, evented: false, originX: 'center', originY: 'center' });
  const triangle = new fabricLib.Triangle({ left: x2, top: y2, originX: 'center', originY: 'center', angle: (angle * 180 / Math.PI) + 90, width: 18, height: headLength, fill: color, selectable: false, evented: false });
  return buildArrowGroup([line, triangle], 'arrow', { pbArrowKind: 'straight', pbColor: color, pbStrokeWidth: width, pbCoords: { x1, y1, x2, y2 } });
}

function buildPassArrow(x1, y1, x2, y2, color = '#00d4ff', width = 4) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const headLength = 18;
  const line = new fabricLib.Line([x1, y1, x2, y2], { stroke: color, strokeWidth: width, strokeDashArray: [12, 10], selectable: false, evented: false, originX: 'center', originY: 'center' });
  const triangle = new fabricLib.Triangle({ left: x2, top: y2, originX: 'center', originY: 'center', angle: (angle * 180 / Math.PI) + 90, width: 18, height: headLength, fill: color, selectable: false, evented: false });
  return buildArrowGroup([line, triangle], 'pass-arrow', { pbArrowKind: 'pass', pbColor: color, pbStrokeWidth: width, pbCoords: { x1, y1, x2, y2 } });
}

function getQuadraticPoint(t, x1, y1, cx, cy, x2, y2) {
  const mt = 1 - t;
  return {
    x: mt * mt * x1 + 2 * mt * t * cx + t * t * x2,
    y: mt * mt * y1 + 2 * mt * t * cy + t * t * y2
  };
}

function buildCurvedArrow(x1, y1, x2, y2, color = '#ff5f6d', width = 4, curveSide = 1) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const length = Math.max(30, Math.hypot(dx, dy));
  const nx = -dy / length;
  const ny = dx / length;
  const curvature = Math.min(120, Math.max(36, length * 0.22));
  const side = Number(curveSide || 1) >= 0 ? 1 : -1;
  const cx = mx + nx * curvature * side;
  const cy = my + ny * curvature * side;
  const path = new fabricLib.Path(`M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`, {
    fill: '',
    stroke: color,
    strokeWidth: width,
    selectable: false,
    evented: false,
    objectCaching: false
  });
  const p1 = getQuadraticPoint(0.92, x1, y1, cx, cy, x2, y2);
  const p2 = getQuadraticPoint(1, x1, y1, cx, cy, x2, y2);
  const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
  const triangle = new fabricLib.Triangle({ left: x2, top: y2, originX: 'center', originY: 'center', angle: (angle * 180 / Math.PI) + 90, width: 18, height: 18, fill: color, selectable: false, evented: false });
  return buildArrowGroup([path, triangle], 'curved-arrow', { pbArrowKind: 'curved', pbColor: color, pbStrokeWidth: width, pbCurveSide: side, pbCoords: { x1, y1, x2, y2, cx, cy } });
}

function buildToolShape(tool, x1, y1, x2, y2, meta = {}) {
  if (tool === 'line') return new fabricLib.Line([x1, y1, x2, y2], { stroke: '#ffffff', strokeWidth: 4, pbType: 'line', pbCoords: { x1, y1, x2, y2 } });
  if (tool === 'zone') return new fabricLib.Rect({ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1), fill: 'rgba(255,0,0,0.22)', stroke: '#ff4d4f', strokeWidth: 3, rx: 10, ry: 10, pbType: 'zone' });
  if (tool === 'arrow') return buildArrow(x1, y1, x2, y2);
  if (tool === 'pass-arrow') return buildPassArrow(x1, y1, x2, y2);
  if (tool === 'curved-arrow') return buildCurvedArrow(x1, y1, x2, y2, undefined, undefined, Number(meta.curveSide || 1));
  return null;
}

function refreshTempShape(tool, shape, x1, y1, x2, y2, meta = {}) {
  if (tool === 'line') {
    shape.set({ x1, y1, x2, y2, pbCoords: { x1, y1, x2, y2 } });
  } else if (tool === 'zone') {
    shape.set({ left: Math.min(x1, x2), top: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) });
  } else if (['arrow', 'pass-arrow', 'curved-arrow'].includes(tool)) {
    canvas.remove(shape);
    tempShape = buildToolShape(tool, x1, y1, x2, y2, meta);
    canvas.add(tempShape);
  }
  canvas.renderAll();
}

canvas.on('mouse:down', opt => {
  if (currentTool === 'pan' || spacePressed) {
    isPanning = true;
    lastPosX = opt.e.clientX;
    lastPosY = opt.e.clientY;
    canvas.selection = false;
    canvas.defaultCursor = 'grabbing';
    return;
  }
  const pointer = canvas.getPointer(opt.e);
  if (['offense', 'defense', 'ball'].includes(currentTool)) {
    addMarker(currentTool, pointer.x, pointer.y);
    updateSelectionUI();
    return;
  }
  if (currentTool === 'text') {
    addText(pointer.x, pointer.y);
    updateSelectionUI();
    return;
  }
  if (currentTool === 'path') {
    const activeObj = canvas.getActiveObject();
    if (!pathDrawing) {
      if (!isPlayerMarkerObject(activeObj)) {
        showAlert(tt('board.warning.select_player_path', 'Choisissez d\'abord une joueuse pour tracer un path.'), 'warning');
        return;
      }
      pathDrawing = true;
      pathPlayer = activeObj;
      const center = getObjectCenter(activeObj);
      const nowMs = animationRecording ? Math.max(0, performance.now() - animationStartTs) : 0;
      pathPoints = [{ x: center.x, y: center.y, time: nowMs }, { x: pointer.x, y: pointer.y, time: nowMs + 300 }];
      pathTempPolyline = buildPathPolyline(pathPoints, true);
      canvas.add(pathTempPolyline);
      return;
    }
    pathPoints.push({ x: pointer.x, y: pointer.y, time: animationRecording ? Math.max(0, performance.now() - animationStartTs) : (pathPoints.length ? (Number(pathPoints[pathPoints.length - 1].time || 0) + 600) : 600) });
    if (pathTempPolyline) {
      canvas.remove(pathTempPolyline);
    }
    pathTempPolyline = buildPathPolyline(pathPoints, true);
    canvas.add(pathTempPolyline);
    return;
  }
  if (['line', 'arrow', 'zone', 'pass-arrow', 'curved-arrow'].includes(currentTool)) {
    isDrawing = true;
    drawingStart = pointer;
    drawingMeta = { curveSide: opt.e.shiftKey ? -1 : 1 };
    tempShape = buildToolShape(currentTool, pointer.x, pointer.y, pointer.x, pointer.y, drawingMeta);
    canvas.add(tempShape);
    return;
  }
});

canvas.on('mouse:move', opt => {
  if (isPanning) {
    const e = opt.e;
    const vpt = canvas.viewportTransform;
    vpt[4] += e.clientX - lastPosX;
    vpt[5] += e.clientY - lastPosY;
    lastPosX = e.clientX;
    lastPosY = e.clientY;
    canvas.requestRenderAll();
    return;
  }
  if (!isDrawing || !tempShape || !drawingStart) return;
  const pointer = canvas.getPointer(opt.e);
  refreshTempShape(currentTool, tempShape, drawingStart.x, drawingStart.y, pointer.x, pointer.y, drawingMeta || {});
});

canvas.on('mouse:up', () => {
  if (isPanning) {
    isPanning = false;
    canvas.defaultCursor = (currentTool === 'pan' || spacePressed) ? 'grab' : (currentTool === 'select' ? 'default' : 'crosshair');
    if (currentTool === 'select') canvas.selection = true;
    return;
  }
  if (!isDrawing) return;
  isDrawing = false;
  if (tempShape) {
    tempShape.set({ selectable: true, evented: true });
    if (tempShape.type === 'group') {
      tempShape.getObjects().forEach(obj => obj.set({ selectable: false, evented: false }));
    }
    tempShape.setCoords();
    canvas.setActiveObject(tempShape);
    if (animationRecording && isAnimatableObject(tempShape)) {
      recordAnimationFrame(true);
    }
  }
  tempShape = null;
  drawingStart = null;
  drawingMeta = null;
  updateSelectionUI();
});

canvas.on('mouse:dblclick', () => { if (currentTool === 'path') finishPlayerPath(); });

canvas.on('selection:created', updateSelectionUI);
canvas.on('selection:updated', updateSelectionUI);
canvas.on('selection:cleared', updateSelectionUI);
canvas.on('object:moving', (e) => { if (isAnimatableObject(e.target)) recordAnimationFrame(false); });
canvas.on('object:modified', (e) => { updateSelectionUI(); if (isAnimatableObject(e.target)) recordAnimationFrame(true); pushHistoryState(); });
canvas.on('object:added', (e) => {
  if (!e.target?.isFieldBg) {
    ensureAnimId(e.target);
    if (animationRecording) recordAnimationFrame(true);
    pushHistoryState();
  }
});
canvas.on('object:removed', (e) => {
  if (!e.target?.isFieldBg) {
    if (animationRecording) recordAnimationFrame(true);
    pushHistoryState();
  }
});

propLabel?.addEventListener('input', () => {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  if (active.type === 'i-text' || active.type === 'text') {
    active.set({ text: propLabel.value || 'Texte' });
  } else if (active.type === 'group' && ['offense','defense','ball'].includes(active.pbType)) {
    const text = active.item(1);
    text.set({ text: propLabel.value || active.labelText || 'O' });
    active.labelText = propLabel.value || text.text;
  } else {
    active.labelText = propLabel.value;
  }
  canvas.renderAll();
});

propColor?.addEventListener('input', () => {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  if (active.type === 'i-text' || active.type === 'text') active.set({ fill: propColor.value });
  else if (active.type === 'group' && ['offense','defense','ball'].includes(active.pbType)) active.item(0).set({ fill: propColor.value });
  else if (active.type === 'group' && ['arrow','pass-arrow','curved-arrow'].includes(active.pbType)) {
    active.item(0).set({ stroke: propColor.value });
    active.item(1).set({ fill: propColor.value });
  } else active.set({ stroke: propColor.value, fill: active.pbType === 'zone' ? 'rgba(255,77,79,0.22)' : active.fill });
  canvas.renderAll();
});

propFontsize?.addEventListener('input', () => {
  if (propFontsizeValue) propFontsizeValue.textContent = String(propFontsize.value);
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  if (active.type === 'i-text' || active.type === 'text') active.set({ fontSize: Number(propFontsize.value) });
  else if (active.type === 'group' && ['offense','defense','ball'].includes(active.pbType)) active.item(1).set({ fontSize: Number(propFontsize.value) });
  canvas.renderAll();
});

propStroke?.addEventListener('input', () => {
  if (propStrokeValue) propStrokeValue.textContent = String(propStroke.value);
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  const width = Number(propStroke.value);
  if (active.type === 'group' && ['offense','defense','ball'].includes(active.pbType)) active.item(0).set({ strokeWidth: width });
  else if (active.type === 'group' && ['arrow','pass-arrow','curved-arrow'].includes(active.pbType)) active.item(0).set({ strokeWidth: width });
  else active.set({ strokeWidth: width });
  canvas.renderAll();
});

function getDiagramLabel(diagram) {
  const base = (diagram?.title || 'Diagramme').trim();
  return `${base}${diagram?.is_primary ? ' · Principal' : ''}`;
}

function renderDiagramSelector() {
  if (!diagramSelect) return;
  const options = [`<option value="" data-board-new-diagram-option="1" ${!currentDiagram ? 'selected' : ''}>Nouveau diagramme</option>`];
  options.push(...currentDiagrams.map(diagram => `
    <option value="${diagram.id}" ${currentDiagram?.id === diagram.id ? 'selected' : ''}>
      ${escapeHtml(diagram.title || 'Sans titre')}${diagram.is_primary ? ' · Principal' : ''}
    </option>
  `));
  diagramSelect.innerHTML = options.join('');
}

async function loadDiagramsForTactic(tacticId) {
  if (!tacticId) {
    currentDiagrams = [];
    currentDiagram = null;
    renderDiagramSelector();
    return [];
  }
  const { data, error } = await supabase.from('tactic_diagrams').select('*').eq('tactic_id', tacticId).order('is_primary', { ascending: false }).order('updated_at', { ascending: false });
  if (error) throw error;
  currentDiagrams = data || [];
  renderDiagramSelector();
  return currentDiagrams;
}

async function loadCurrentDiagramOrFallback(preferredDiagramId = null) {
  if (!currentTactic) return;

  // If a specific diagram is requested explicitly, load it.
  let target = null;
  if (preferredDiagramId) {
    target = currentDiagrams.find(d => String(d.id) === String(preferredDiagramId)) || null;
  }

  // Default board entry from menu: start with a fresh horizontal board and no selected saved diagram.
  if (!target) {
    currentDiagram = null;
    BOARD_ORIENTATION = 'horizontal';
    updateBoardDimensionsForOrientation();
    const size = computeResponsiveCanvasSize();
    CANVAS_W = size.width;
    CANVAS_H = size.height;
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);
    updateTerrainOrientationButton();
    renderDiagramSelector();
    canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    await renderFieldBackground();
    resetViewport();
    canvas.renderAll();
    pushHistoryState();
    return;
  }

  currentDiagram = target;
  renderDiagramSelector();

  const payloadJson = target?.diagram_json || currentTactic?.diagram_json || null;
  try {
    const parsed = payloadJson ? unwrapStoredDiagramPayload(payloadJson) : null;
    const targetOrientation = parsed?.board?.boardOrientation
      ? (parsed.board.boardOrientation === 'vertical' ? 'vertical' : 'horizontal')
      : 'horizontal';
    BOARD_ORIENTATION = targetOrientation;
    updateBoardDimensionsForOrientation();
    const size = computeResponsiveCanvasSize();
    CANVAS_W = size.width;
    CANVAS_H = size.height;
    canvas.setWidth(CANVAS_W);
    canvas.setHeight(CANVAS_H);
    updateTerrainOrientationButton();
    await renderFieldBackground();
    resetViewport();
  } catch (e) {
    console.warn(e);
  }

  await loadDiagramJson(payloadJson);
}

function beginNewDiagram() {
  currentDiagram = null;
  animationKeyframes = [];
  animationBaseState = null;
  animationDurationMs = 0;
  clearAnimationWebMCache();
  updateAnimationControls();
  renderDiagramSelector();
  canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  renderFieldBackground().then(() => resetViewport());
  canvas.renderAll();
  pushHistoryState();
  showAlert('Nouveau diagramme prêt. Dessine puis sauvegarde.', 'info');
}

async function deleteCurrentDiagram() {
  if (!currentTactic || !currentDiagram) return;
  if (!confirm('Supprimer ce diagramme ?')) return;
  const wasPrimary = !!currentDiagram.is_primary;
  const deleteId = currentDiagram.id;
  const { error } = await supabase.from('tactic_diagrams').delete().eq('id', deleteId);
  if (error) throw error;
  currentDiagrams = currentDiagrams.filter(d => d.id !== deleteId);
  currentDiagram = null;
  if (wasPrimary && currentDiagrams.length) {
    const replacement = currentDiagrams[0];
    await supabase.from('tactic_diagrams').update({ is_primary: true, updated_at: new Date().toISOString() }).eq('id', replacement.id);
  }
  await loadDiagramsForTactic(currentTactic.id);
  await loadCurrentDiagramOrFallback();
  if (!currentDiagrams.length) {
    await supabase.from('tactics').update({ diagram_json: null, diagram_image_url: null, diagram_updated_at: null }).eq('id', currentTactic.id);
  }
  showAlert('Diagramme supprimé.', 'success');
}

async function markCurrentAsPrimary() {
  if (!currentTactic || !currentDiagram) return;
  const now = new Date().toISOString();
  const { error: e1 } = await supabase.from('tactic_diagrams').update({ is_primary: false, updated_at: now }).eq('tactic_id', currentTactic.id);
  if (e1) throw e1;
  const { error: e2 } = await supabase.from('tactic_diagrams').update({ is_primary: true, updated_at: now }).eq('id', currentDiagram.id);
  if (e2) throw e2;
  currentDiagram.is_primary = true;
  await syncPrimaryDiagramToTactic(currentDiagram);
  await loadDiagramsForTactic(currentTactic.id);
  renderDiagramSelector();
  showAlert('Diagramme principal mis à jour.', 'success');
}

async function syncPrimaryDiagramToTactic(diagram) {
  if (!currentTactic || !diagram) return;
  const payload = {
    diagram_json: diagram.diagram_json || null,
    diagram_image_url: diagram.image_url || null,
    diagram_updated_at: diagram.updated_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
    change_note: 'Diagramme principal mis à jour'
  };
  const { error } = await supabase.from('tactics').update(payload).eq('id', currentTactic.id);
  if (error) throw error;
  currentTactic = { ...currentTactic, ...payload };
}

function selectedTacticId() {
  return tacticSelect.value ? Number(tacticSelect.value) : null;
}

async function loadTactics() {
  const { data, error } = await supabase.from('tactics').select('id,title,team_id,diagram_json,diagram_updated_at,diagram_image_url,teams(name)').order('title');
  if (error) throw error;
  tactics = data || [];
  const queryId = Number(new URLSearchParams(location.search).get('id')) || null;
  tacticSelect.innerHTML = `<option value="">Choisir une tactique</option>` + tactics.map(t => `<option value="${t.id}">${escapeHtml(t.title)}${t.teams?.name ? ` · ${escapeHtml(t.teams.name)}` : ''}</option>`).join('');
  const target = tactics.find(t => t.id === queryId) || tactics[0] || null;
  if (target) {
    tacticSelect.value = String(target.id);
    const queryDiagramId = new URLSearchParams(location.search).get('diagramId');
    await applyTactic(target.id, queryDiagramId);
  }
}

async function applyTactic(id, preferredDiagramId = null) {
  currentTactic = tactics.find(t => String(t.id) === String(id)) || null;
  if (!currentTactic) {
    boardTeamLabel.textContent = '—';
    currentDiagrams = [];
    currentDiagram = null;
    renderDiagramSelector();
    if (openTacticBtn) openTacticBtn && (openTacticBtn.href = 'tactics.html');
    await renderFieldBackground();
    resetViewport();
    canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
    canvas.discardActiveObject();
    ensureAnimIdsOnCanvas();
    canvas.renderAll();
    pushHistoryState();
    return;
  }
  boardTeamLabel.textContent = currentTactic.teams?.name || '—';
  if (presentationTitle) presentationTitle.textContent = currentTactic.title || 'Tactical Board';
  if (openTacticBtn) openTacticBtn && (openTacticBtn.href = `tactic-detail.html?id=${currentTactic.id}`);
  await loadDiagramsForTactic(currentTactic.id);
  await loadCurrentDiagramOrFallback(preferredDiagramId);
}

async function loadDiagramJson(diagramJson) {
  animationKeyframes = [];
  animationBaseState = null;
  animationDurationMs = 0;
  clearAnimationWebMCache();
  updateAnimationControls();

  let payload = null;
  try {
    payload = diagramJson ? unwrapStoredDiagramPayload(diagramJson) : null;
  } catch (_) {
    payload = null;
  }

  const targetOrientation = payload?.board?.boardOrientation
    ? (payload.board.boardOrientation === 'vertical' ? 'vertical' : 'horizontal')
    : BOARD_ORIENTATION;

  BOARD_ORIENTATION = targetOrientation;
  updateBoardDimensionsForOrientation();
  const size = computeResponsiveCanvasSize();
  CANVAS_W = size.width;
  CANVAS_H = size.height;
  canvas.setWidth(CANVAS_W);
  canvas.setHeight(CANVAS_H);
  updateTerrainOrientationButton();

  canvas.clear();
  await renderFieldBackground();
  resetViewport();

  if (!diagramJson || !payload) {
    pushHistoryState();
    return;
  }

  try {
    const scaled = scaleDiagramJsonToCurrent(payload.board);
    await new Promise(resolve => canvas.loadFromJSON(scaled, resolve));
    await renderFieldBackground();
    resetViewport();
    canvas.getObjects().filter(o => o.isFieldBg).forEach((o, idx) => canvas.moveTo(o, idx));
    ensureAnimIdsOnCanvas();
    restoreAnimationFromStoredPayload(payload.animation);
    if (animationBaseState) {
      await restoreAnimationBaseState();
    }
    canvas.discardActiveObject();
    canvas.renderAll();
    pushHistoryState();
  } catch (err) {
    console.error(err);
    showAlert('Impossible de relire le diagramme sauvegardé. Un nouveau terrain vide a été chargé.', 'warning');
    canvas.clear();
    await renderFieldBackground();
    resetViewport();
    pushHistoryState();
  }
}

async function exportCanvasBlob() {
  const hasAnimation = animationKeyframes.length >= 2 && animationDurationMs > 0 && animationBaseState;
  if (hasAnimation) {
    const renderCanvas = await createRenderCanvasFromBaseState();
    const dataUrl = renderCanvas.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: true });
    const response = await fetch(dataUrl);
    return await response.blob();
  }
  const prevVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0];
  canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
  canvas.renderAll();
  const dataUrl = canvas.toDataURL({ format: 'png', multiplier: 1, enableRetinaScaling: true });
  canvas.setViewportTransform(prevVpt);
  canvas.renderAll();
  const response = await fetch(dataUrl);
  return await response.blob();
}

async function uploadBoardAsset(blob, path, contentType) {
  const { error } = await supabase.storage.from(window.APP_CONFIG.defaultBucket).upload(path, blob, { contentType, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(window.APP_CONFIG.defaultBucket).getPublicUrl(path);
  return { path, publicUrl: data.publicUrl };
}

async function uploadBoardImage(blob, tacticId) {
  const path = `board-${tacticId}-${Date.now()}.png`;
  const uploaded = await uploadBoardAsset(blob, path, 'image/png');
  return uploaded.publicUrl;
}

async function generateAnimationWebMBlob() {
  const renderCanvas = await createRenderCanvasFromBaseState();
  return await recordCanvasAnimationToWebM(renderCanvas, { width: CANVAS_W, height: CANVAS_H, fps: 24 });
}

let saveProgressInterval = null;

function estimateAnimationGenerationSeconds() {
  const durationSeconds = Math.max(1, Math.ceil((Number(animationDurationMs || 0) || 0) / 1000));
  const keyframeCount = Array.isArray(animationKeyframes) ? animationKeyframes.length : 0;
  return Math.max(6, Math.min(90, Math.ceil(durationSeconds * 1.5 + keyframeCount * 0.35 + 4)));
}

function updateSaveProgressChip(message, kind = 'secondary') {
  if (!saveProgressChip) return;
  saveProgressChip.className = `badge bg-label-${kind}`;
  if (!message) {
    saveProgressChip.textContent = '';
    saveProgressChip.classList.add('d-none');
    saveProgressChip.style.display = 'none';
    return;
  }
  saveProgressChip.textContent = message;
  saveProgressChip.classList.remove('d-none');
  saveProgressChip.style.display = 'inline-flex';
  saveProgressChip.style.alignItems = 'center';
}

function startSaveProgressCountdown() {
  const hasAnimation = animationKeyframes.length >= 2 && animationDurationMs > 0 && animationBaseState;
  if (!hasAnimation) {
    updateSaveProgressChip('Sauvegarde...','secondary');
    return null;
  }
  const estimatedSeconds = estimateAnimationGenerationSeconds();
  let remaining = estimatedSeconds;
  updateSaveProgressChip(`Génération WebM ~ ${remaining}s`, 'warning');
  const intervalId = window.setInterval(() => {
    remaining -= 1;
    if (remaining > 0) {
      updateSaveProgressChip(`Génération WebM ~ ${remaining}s`, 'warning');
    } else {
      updateSaveProgressChip('Finalisation WebM...', 'warning');
    }
  }, 1000);
  saveProgressInterval = intervalId;
  return intervalId;
}

function stopSaveProgressCountdown(intervalId, success = false) {
  const activeId = intervalId || saveProgressInterval;
  if (activeId) window.clearInterval(activeId);
  saveProgressInterval = null;
  if (success) {
    updateSaveProgressChip('Terminé ✓', 'success');
    window.setTimeout(() => updateSaveProgressChip('', 'secondary'), 3500);
  } else {
    updateSaveProgressChip('', 'secondary');
  }
}

async function saveBoard() {
  clearAlert();
  const tacticId = selectedTacticId();
  if (!tacticId) {
    showAlert("Choisis d'abord une tactique à lier au board.", 'warning');
    return;
  }
  saveBtn.disabled = true;
  const prev = saveBtn.innerHTML;
  const saveProgressHandle = startSaveProgressCountdown();
  saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sauvegarde...';
  try {
    const blob = await exportCanvasBlob();
    const imageUrl = await uploadBoardImage(blob, tacticId);
    const now = new Date().toISOString();
    const title = (diagramTitleInput?.value || currentDiagram?.title || 'Diagramme').trim() || 'Diagramme';
    const storedPayload = getStoredDiagramPayload();
    const hasAnimation = !!(storedPayload?.animation?.baseState && Array.isArray(storedPayload?.animation?.keyframes) && storedPayload.animation.keyframes.length >= 2 && Number(storedPayload.animation.durationMs || 0) > 0);
    if (hasAnimation) {
      const animationHash = buildAnimationSignature(storedPayload.animation);
      const existingMeta = extractSavedAnimationMeta(currentDiagram?.diagram_json || currentTactic?.diagram_json || null);
      if (existingMeta.hash === animationHash && existingMeta.webmUrl) {
        storedPayload.animation = { ...storedPayload.animation, hash: animationHash, webm_url: existingMeta.webmUrl, webm_path: existingMeta.webmPath || '', generated_at: now };
      } else {
        const resolved = await resolveAnimationWebMForCurrentDiagram({
          preferExistingSaved: false,
          onProgress: updateSaveProgressChip
        });
        const fileSlug = slugifyFilename(title, 'diagram');
        const webmPath = `animations/tactic-${tacticId}/${fileSlug}-${animationHash}.webm`;
        let uploadedWebm = null;
        if (resolved.blob) {
          uploadedWebm = await uploadBoardAsset(resolved.blob, webmPath, resolved.blob.type || 'video/webm');
        } else if (resolved.url) {
          const fetchedBlob = await fetchBlobFromUrl(resolved.url);
          uploadedWebm = await uploadBoardAsset(fetchedBlob, webmPath, fetchedBlob.type || 'video/webm');
          cacheGeneratedAnimationWebM(fetchedBlob, animationHash, resolved.downloadName || buildWebMDownloadName());
        }
        if (!uploadedWebm) throw new Error('Impossible de préparer la vidéo WebM du diagramme.');
        storedPayload.animation = { ...storedPayload.animation, hash: animationHash, webm_url: uploadedWebm.publicUrl, webm_path: uploadedWebm.path, generated_at: now };
      }
    } else if (storedPayload?.animation) {
      storedPayload.animation = null;
    }
    const diagramPayload = {
      tactic_id: tacticId,
      title,
      diagram_json: JSON.stringify(storedPayload),
      image_url: imageUrl,
      updated_at: now
    };

    let savedDiagram = null;
    if (currentDiagram?.id) {
      const { data, error } = await supabase.from('tactic_diagrams').update(diagramPayload).eq('id', currentDiagram.id).select().single();
      if (error) throw error;
      savedDiagram = data;
    } else {
      diagramPayload.is_primary = currentDiagrams.length === 0;
      const { data, error } = await supabase.from('tactic_diagrams').insert(diagramPayload).select().single();
      if (error) throw error;
      savedDiagram = data;
    }

    currentDiagram = savedDiagram;
    await loadDiagramsForTactic(tacticId);
    currentDiagram = currentDiagrams.find(d => d.id === savedDiagram.id) || savedDiagram;
    renderDiagramSelector();

    if (currentDiagram.is_primary || currentDiagrams.length === 1) {
      await syncPrimaryDiagramToTactic(currentDiagram);
    }

    if (diagramDateLabel) diagramDateLabel.textContent = new Date(currentDiagram.updated_at).toLocaleString();
    stopSaveProgressCountdown(saveProgressHandle, true);
    showAlert('Diagramme sauvegardé.', 'success');
  } catch (err) {
    console.error(err);
    stopSaveProgressCountdown(saveProgressHandle, false);
    showAlert(err.message || 'Impossible de sauvegarder le board.', 'danger');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = prev;
  }
}

async function exportPng() {
  const blob = await exportCanvasBlob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  if (a) a.href = url;
  a.download = `${(currentTactic?.title || 'tactical-board').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase()}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function cloneSelected(offsetX = 24, offsetY = 24) {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  active.clone(cloned => {
    canvas.discardActiveObject();
    if (cloned.type === 'activeSelection') {
      cloned.canvas = canvas;
      cloned.forEachObject(obj => {
        obj.set({ left: (obj.left || 0) + offsetX, top: (obj.top || 0) + offsetY });
        if (isAnimatableObject(obj)) obj.animId = generateAnimId();
        canvas.add(obj);
      });
      cloned.setCoords();
    } else {
      cloned.set({ left: (cloned.left || 0) + offsetX, top: (cloned.top || 0) + offsetY, evented: true, selectable: true });
      if (cloned.type === 'group') cloned.getObjects().forEach(obj => obj.set({ selectable: false, evented: false }));
      if (isAnimatableObject(cloned)) cloned.animId = generateAnimId();
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
    }
    canvas.requestRenderAll();
    updateSelectionUI();
  });
}

function copySelected() {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  active.clone(cloned => {
    copiedObjectData = cloned;
    showAlert('Élément copié.', 'info');
  });
}

function pasteCopied() {
  if (!copiedObjectData) return;
  copiedObjectData.clone(cloned => {
    canvas.discardActiveObject();
    cloned.set({ left: (cloned.left || 0) + 28, top: (cloned.top || 0) + 28, evented: true, selectable: true });
    if (cloned.type === 'activeSelection') {
      cloned.canvas = canvas;
      cloned.forEachObject(obj => {
        obj.set({ left: (obj.left || 0) + 28, top: (obj.top || 0) + 28 });
        if (isAnimatableObject(obj)) obj.animId = generateAnimId();
        canvas.add(obj);
      });
      cloned.setCoords();
    } else {
      if (cloned.type === 'group') cloned.getObjects().forEach(obj => obj.set({ selectable: false, evented: false }));
      if (isAnimatableObject(cloned)) cloned.animId = generateAnimId();
      canvas.add(cloned);
      canvas.setActiveObject(cloned);
    }
    canvas.requestRenderAll();
    updateSelectionUI();
  });
}

function addTemplateMarker(type, x, y, label = null) {
  addMarker(type, x, y);
  const active = canvas.getActiveObject();
  if (active && label) {
    const text = active.type === 'group' ? active.item(1) : null;
    if (text) text.set({ text: label });
    active.labelText = label;
  }
}

function applyTemplate(kind) {
  if (!confirm(`Charger le template ${kind} ? Les éléments actuels du board seront supprimés.`)) return;
  animationKeyframes = [];
  animationBaseState = null;
  animationDurationMs = 0;
  clearAnimationWebMCache();
  updateAnimationControls();
  canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
  renderFieldBackground();
  const midY = CANVAS_H / 2;
  if (kind === 'offense') {
    addTemplateMarker('offense', 220, midY, 'QB');
    addTemplateMarker('offense', 300, midY - 70, 'WR');
    addTemplateMarker('offense', 300, midY + 70, 'WR');
    addTemplateMarker('offense', 365, midY - 35, 'RB');
    addTemplateMarker('offense', 365, midY + 35, 'TE');
    addTemplateMarker('ball', 170, midY, 'B');
  } else if (kind === 'defense') {
    addTemplateMarker('defense', 250, midY, 'MLB');
    addTemplateMarker('defense', 325, midY - 90, 'CB');
    addTemplateMarker('defense', 325, midY + 90, 'CB');
    addTemplateMarker('defense', 385, midY - 30, 'S');
    addTemplateMarker('defense', 385, midY + 30, 'S');
    addTemplateMarker('ball', 170, midY, 'B');
  } else if (kind === 'special') {
    addTemplateMarker('offense', 230, midY - 110, 'L');
    addTemplateMarker('offense', 230, midY, 'K');
    addTemplateMarker('offense', 230, midY + 110, 'R');
    addTemplateMarker('defense', 430, midY - 70, 'G');
    addTemplateMarker('defense', 430, midY + 70, 'G');
    addTemplateMarker('ball', 170, midY, 'B');
  }
  canvas.discardActiveObject();
  canvas.requestRenderAll();
  updateSelectionUI();
  pushHistoryState();
  showAlert(`Template ${kind} chargé.`, 'success');
}

function clearBoard() {
  if (!confirm('Vider le board courant ?')) return;
  animationKeyframes = [];
  animationBaseState = null;
  animationDurationMs = 0;
  clearAnimationWebMCache();
  updateAnimationControls();
  canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
  canvas.discardActiveObject();
  canvas.renderAll();
  updateSelectionUI();
}

function deleteSelected() {
  const active = canvas.getActiveObject();
  if (!active || active.isFieldBg) return;
  if (active.type === 'activeSelection') active.getObjects().forEach(obj => canvas.remove(obj));
  else canvas.remove(active);
  canvas.discardActiveObject();
  canvas.renderAll();
  updateSelectionUI();
}

async function toggleFullscreen() {
  const wrap = document.getElementById('board-canvas-wrap');
  if (!document.fullscreenElement) await wrap.requestFullscreen?.();
  else await document.exitFullscreen?.();
}

toolButtons.forEach(btn => btn?.addEventListener('click', () => setTool(btn.dataset.tool)));
tacticSelect?.addEventListener('change', async () => applyTactic(selectedTacticId()));
diagramSelect?.addEventListener('change', async () => {
  const id = diagramSelect.value;
  if (!id) { beginNewDiagram(); return; }
  currentDiagram = currentDiagrams.find(d => String(d.id) === String(id)) || null;
  renderDiagramSelector();
  await loadCurrentDiagramOrFallback(id);
});
diagramNewBtn?.addEventListener('click', beginNewDiagram);
diagramDeleteBtn?.addEventListener('click', async () => { try { await deleteCurrentDiagram(); } catch (err) { console.error(err); showAlert(err.message || 'Suppression impossible.', 'danger'); } });
diagramPrimaryBtn?.addEventListener('click', async () => { try { await markCurrentAsPrimary(); } catch (err) { console.error(err); showAlert(err.message || 'Impossible de définir ce diagramme en principal.', 'danger'); } });
saveBtn?.addEventListener('click', saveBoard);
animationStartBtn?.addEventListener('click', startAnimationRecording);
animationStopBtn?.addEventListener('click', stopAnimationRecording);
animationPreviewBtn?.addEventListener('click', previewAnimation);
animationResetBtn?.addEventListener('click', resetAnimationToStart);
animationExportGifBtn?.addEventListener('click', exportAnimationGif);
exportBtn?.addEventListener('click', exportPng);
clearBtn?.addEventListener('click', clearBoard);
deleteSelectedBtn?.addEventListener('click', deleteSelected);
duplicateSelectedBtn?.addEventListener('click', () => cloneSelected());
copySelectedBtn?.addEventListener('click', copySelected);
pasteSelectedBtn?.addEventListener('click', pasteCopied);
templateOffenseBtn?.addEventListener('click', () => applyTemplate('offense'));
templateDefenseBtn?.addEventListener('click', () => applyTemplate('defense'));
templateSpecialBtn?.addEventListener('click', () => applyTemplate('special'));
fullscreenBtn?.addEventListener('click', toggleFullscreen);

presentationStage?.addEventListener('wheel', (e) => {
  if (!presentationMode) return;
  e.preventDefault();
  zoomPresentation(e.deltaY < 0 ? 1.08 : 1 / 1.08);
}, { passive: false });

presentationStage?.addEventListener('mousedown', (e) => {
  if (!presentationMode) return;
  presentationDragging = true;
  presentationDragStartX = e.clientX - presentationTranslateX;
  presentationDragStartY = e.clientY - presentationTranslateY;
});
window?.addEventListener('mousemove', (e) => {
  if (!presentationDragging || !presentationMode) return;
  presentationTranslateX = e.clientX - presentationDragStartX;
  presentationTranslateY = e.clientY - presentationDragStartY;
  updatePresentationTransform();
});
window?.addEventListener('mouseup', () => {
  presentationDragging = false;
});

presentationBtn?.addEventListener('click', () => togglePresentationMode(true));
presentationExitBtn?.addEventListener('click', () => togglePresentationMode(false));
presentationLaserBtn?.addEventListener('click', toggleLaser);
presentationZoomInBtn?.addEventListener('click', () => zoomStep(1.15));
presentationZoomOutBtn?.addEventListener('click', () => zoomStep(1 / 1.15));
presentationZoomResetBtn?.addEventListener('click', resetViewport);
boardCanvasWrap?.addEventListener('mousemove', e => moveLaser(e.clientX, e.clientY));
boardCanvasWrap?.addEventListener('touchmove', e => { if (e.touches?.[0]) moveLaser(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
boardFitBtn?.addEventListener('click', resetViewport);
if (propFontsizeValue) propFontsizeValue.textContent = String(propFontsize.value);
if (propStrokeValue) propStrokeValue.textContent = String(propStroke.value);

resizeBoardCanvas({ preserveObjects: false });
updateSelectionUI();
setZoomBadge();
updateHistoryButtons();
updateAnimationControls();
await loadTactics();

zoomInBtn?.addEventListener('click', () => zoomStep(1.15));
zoomOutBtn?.addEventListener('click', () => zoomStep(1 / 1.15));
zoomResetBtn?.addEventListener('click', resetViewport);
overlayZoomInBtn?.addEventListener('click', () => zoomStep(1.15));
overlayZoomOutBtn?.addEventListener('click', () => zoomStep(1 / 1.15));
overlayZoomResetBtn?.addEventListener('click', resetViewport);
undoBtn?.addEventListener('click', undoBoard);
redoBtn?.addEventListener('click', redoBoard);
window?.addEventListener('resize', () => { if (presentationMode) { fitPresentationImage(); return; } resizeBoardCanvas({ preserveObjects: true }); });

window?.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && presentationMode) { togglePresentationMode(false); return; }
  if (presentationMode) return;
  const ctrl = e.ctrlKey || e.metaKey;
  if ((e.key === 'Delete' || e.key === 'Backspace') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
    e.preventDefault();
    deleteSelected();
    return;
  }
  if (ctrl && e.key.toLowerCase() === 'd') { e.preventDefault(); cloneSelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'c') { e.preventDefault(); copySelected(); return; }
  if (ctrl && e.key.toLowerCase() === 'v') { e.preventDefault(); pasteCopied(); return; }
});

// ---- Animated Arrows Engine (v8.7) ----
function drawAnimatedArrow(ctx, x1, y1, x2, y2, progress){
  const dx = x2 - x1;
  const dy = y2 - y1;
  const px = x1 + dx * progress;
  const py = y1 + dy * progress;

  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(px, py);
  ctx.stroke();

  // arrow head
  const angle = Math.atan2(dy, dx);
  const head = 10;
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.lineTo(px - head * Math.cos(angle - Math.PI/6), py - head * Math.sin(angle - Math.PI/6));
  ctx.lineTo(px - head * Math.cos(angle + Math.PI/6), py - head * Math.sin(angle + Math.PI/6));
  ctx.closePath();
  ctx.fill();
}

// ---- Player Path Engine (v8.8) ----
function enablePathMode(){
  pathMode = true;
  currentPath = [];
}

function disablePathMode(){
  pathMode = false;
}

function addPathPoint(x,y){
  if(!pathMode) return;
  currentPath.push({x,y,time:performance.now()});
}

function finalizePath(playerId){
  if(!currentPath.length) return;
  playerPaths.push({
    playerId: playerId && playerId.animId ? playerId.animId : playerId,
    points:[...currentPath]
  });
  currentPath=[];
  pathMode=false;
}

function renderPlayerPaths(ctx){
  playerPaths.forEach(p=>{
    ctx.beginPath();
    p.points.forEach((pt,i)=>{
      if(i===0) ctx.moveTo(pt.x,pt.y);
      else ctx.lineTo(pt.x,pt.y);
    });
    ctx.strokeStyle="#ffffff";
    ctx.lineWidth=2;
    ctx.stroke();
  });
}

// ---- Path UI Fix (v8.8.1) ----
function isPlayerMarkerObject(obj) {
  return !!obj && obj.type === 'group' && ['offense','defense'].includes(obj.pbType);
}

function getObjectCenter(obj) {
  const center = obj.getCenterPoint ? obj.getCenterPoint() : { x: (obj.left || 0), y: (obj.top || 0) };
  return { x: Number(center.x || 0), y: Number(center.y || 0) };
}

function buildPathPolyline(points, temporary = false) {
  const polyline = new fabricLib.Polyline(points, {
    fill: '',
    stroke: '#ffffff',
    strokeWidth: 3,
    selectable: !temporary,
    evented: !temporary,
    objectCaching: false,
    pbType: 'player-path',
    isPlayerPath: true,
    strokeDashArray: [8, 6],
    pathPlayerAnimId: pathPlayer?.animId || null,
    pbAbsPoints: Array.isArray(points) ? points.map(pt => ({ x: Number(pt.x || 0), y: Number(pt.y || 0), time: Number(pt.time || 0) })) : []
  });
  ensureAnimId(polyline);
  return polyline;
}

function finishPlayerPath() {
  if (!pathDrawing || !pathPlayer || pathPoints.length < 2) {
    if (pathTempPolyline) canvas.remove(pathTempPolyline);
    pathDrawing = false;
    pathPlayer = null;
    pathPoints = [];
    pathTempPolyline = null;
    canvas.requestRenderAll();
    return;
  }
  if (pathTempPolyline) {
    pathTempPolyline.set({ selectable: true, evented: true });
    pathTempPolyline.setCoords();
    pathTempPolyline.pathPlayerAnimId = pathPlayer?.animId || null;
    pathTempPolyline.labelText = 'Path';
    canvas.setActiveObject(pathTempPolyline);
    const finishMs = animationRecording ? Math.max(0, performance.now() - animationStartTs) : Number(pathPoints[pathPoints.length - 1]?.time || 0);
    const normalizedPath = normalizePlayerPathTimings({
      playerId: pathPlayer?.animId || null,
      points: pathPoints.map((pt, idx, arr) => ({
        x: pt.x,
        y: pt.y,
        time: idx === arr.length - 1 ? Math.max(Number(pt.time || 0), finishMs) : Number(pt.time || 0)
      }))
    });
    playerPaths.push(normalizedPath);
    if (animationRecording && isAnimatableObject(pathTempPolyline)) {
      recordAnimationFrame(true);
    }
    capturePathOnFinish();
  }
  pathDrawing = false;
  pathPlayer = null;
  pathPoints = [];
  pathTempPolyline = null;
  updateSelectionUI();
  canvas.requestRenderAll();
}

// ---- Player Follow Path Engine (v8.9) ----
function getPathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += Math.hypot(points[i].x - points[i-1].x, points[i].y - points[i-1].y);
  }
  return total;
}

function getPointOnPath(points, progress) {
  if (!points || !points.length) return null;
  if (points.length === 1) return { x: points[0].x, y: points[0].y };
  const total = getPathLength(points);
  if (total <= 0) return { x: points[0].x, y: points[0].y };
  let target = total * Math.max(0, Math.min(1, progress));
  for (let i = 1; i < points.length; i++) {
    const a = points[i-1], b = points[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (target <= seg) {
      const t = seg ? target / seg : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    target -= seg;
  }
  return { x: points[points.length-1].x, y: points[points.length-1].y };
}

function normalizeAnimId(val) {
  return String(val == null ? '' : val);
}

function getPathTiming(pathObj) {
  const pts = Array.isArray(pathObj.points) ? pathObj.points : [];
  const times = pts.map(p => Number(p.time)).filter(n => Number.isFinite(n));
  if (!times.length) return { start: 0, end: 0, duration: 0 };
  const start = Math.min(...times);
  const end = Math.max(...times);
  return { start, end, duration: Math.max(1, end - start) };
}

function applyPlayerPathsAtTimeForCanvas(playheadMs, targetCanvas = canvas) {
  if (!Array.isArray(playerPaths) || !playerPaths.length || !targetCanvas?.getObjects) return;
  const objs = targetCanvas.getObjects();
  playerPaths.forEach(pathObj => {
    const pid = normalizeAnimId(pathObj.playerId);
    const target = objs.find(o => normalizeAnimId(o.animId || o.pathPlayerAnimId) === pid || normalizeAnimId(o.pathPlayerAnimId) === pid);
    if (!target || !Array.isArray(pathObj.points) || pathObj.points.length < 2) return;
    const timing = getPathTiming(pathObj);
    let prog = 0;
    if (playheadMs <= timing.start) prog = 0;
    else if (playheadMs >= timing.end) prog = 1;
    else prog = (playheadMs - timing.start) / timing.duration;
    const pt = getPointOnPath(pathObj.points, prog);
    if (!pt) return;
    if (typeof target.setPositionByOrigin === 'function') {
      target.setPositionByOrigin(new fabricLib.Point(pt.x, pt.y), 'center', 'center');
    } else {
      target.left = pt.x;
      target.top = pt.y;
    }
    if (typeof target.setCoords === 'function') target.setCoords();
  });
}

function applyPlayerPathsAtTime(playheadMs) {
  applyPlayerPathsAtTimeForCanvas(playheadMs, canvas);
}

function capturePathOnFinish() {
  if (!Array.isArray(playerPaths) || !playerPaths.length) return;
  if (typeof recordAnimationFrame === 'function') {
    try { recordAnimationFrame(true); } catch (e) {}
  }
}

function normalizePlayerPathTimings(pathObj) {
  if (!pathObj || !Array.isArray(pathObj.points) || pathObj.points.length < 2) return pathObj;
  const pts = pathObj.points.map(pt => ({
    x: Number(pt?.x || 0),
    y: Number(pt?.y || 0),
    time: Number(pt?.time || 0)
  }));
  const first = Number(pts[0].time || 0);
  const last = Number(pts[pts.length - 1].time || 0);
  const duration = Math.max(0, last - first);
  if (duration >= 400) {
    return { ...pathObj, points: pts };
  }
  const minStep = Math.max(300, Math.round(1200 / Math.max(1, pts.length - 1)));
  const rebased = pts.map((pt, index) => ({
    x: pt.x,
    y: pt.y,
    time: first + (index * minStep)
  }));
  return { ...pathObj, points: rebased };
}

// ---- Timeline Editor (v9.0) ----

// ---- Timeline Runtime Fix (v9.0.4) ----
function ensureTimelineControlsBound() {
  const playBtn = document.getElementById('timeline-play');
  const pauseBtn = document.getElementById('timeline-pause');
  const slider = document.getElementById('timeline-slider');
  const speed = document.getElementById('timeline-speed');

  if (playBtn && !playBtn.dataset.boundTimeline) {
    playBtn.dataset.boundTimeline = '1';
    playBtn.onclick = () => timelinePlay();
  }
  if (pauseBtn && !pauseBtn.dataset.boundTimeline) {
    pauseBtn.dataset.boundTimeline = '1';
    pauseBtn.onclick = () => timelinePause();
  }
  if (slider && !slider.dataset.boundTimeline) {
    slider.dataset.boundTimeline = '1';
    slider.oninput = (e) => timelineSeek(Number(e.target.value || 0));
  }
  if (speed && !speed.dataset.boundTimeline) {
    speed.dataset.boundTimeline = '1';
    speed.onchange = (e) => {
      timelineSpeed = parseFloat(e.target.value) || 1;
    };
  }
}

function syncTimelineFromAnimation() {
  timelineDuration = Number(animationDurationMs || 0);
  timelineTime = 0;
  const slider = document.getElementById('timeline-slider');
  if (slider) {
    slider.max = String(Math.max(1000, Number(timelineDuration || 1000)));
    slider.value = '0';
  }
  ensureTimelineControlsBound();
  timelineUpdateUI();
}

function timelineUpdateUI(){
  const timeLabel=document.getElementById("timeline-time");
  const slider=document.getElementById("timeline-slider");
  const currentSec = (Number(timelineTime || 0) / 1000).toFixed(1);
  const totalSec = (Number(timelineDuration || animationDurationMs || 0) / 1000).toFixed(1);
  if(timeLabel) timeLabel.textContent = `${currentSec}s / ${totalSec}s`;
  if(slider){
    const maxVal = Number(slider.max || 1000);
    slider.value = String(Math.max(0, Math.min(maxVal, Number(timelineTime || 0))));
  }
}

async function timelineRender(){
  const effectiveDuration = Number(timelineDuration || animationDurationMs || 0);
  const safeTime = Math.max(0, Math.min(Number(timelineTime || 0), effectiveDuration > 0 ? effectiveDuration : Number(timelineTime || 0)));
  timelineTime = safeTime;
  if (animationBaseState) {
    try { await restoreAnimationBaseState(); } catch (e) { console.warn(e); }
  }
  if (Array.isArray(animationKeyframes) && animationKeyframes.length >= 2) {
    try { await Promise.resolve(applyAnimationFrameItems(getInterpolatedFrameAt(safeTime))); } catch (e) { console.warn(e); }
  }
  try { applyPlayerPathsAtTime(safeTime); } catch (e) { console.warn(e); }
  if(typeof canvas!=="undefined" && canvas?.renderAll) canvas.renderAll();
}

function timelineLoop(now){
  if (!timelinePlaying) return;
  const effectiveDuration = Number(timelineDuration || animationDurationMs || 0);
  const speed = Math.max(0.0001, Number(timelineSpeed || 1));
  const elapsed = (now - timelineStartTs) * speed;
  timelineTime = Math.min(elapsed, effectiveDuration);
  timelineUpdateUI();

  try {
    const frame = typeof getInterpolatedFrameAt === 'function' ? getInterpolatedFrameAt(timelineTime) : null;
    if (typeof applyAnimationFrameItems === 'function' && frame) {
      Promise.resolve(applyAnimationFrameItems(frame)).then(() => {
        try { if (typeof applyPlayerPathsAtTime === 'function') applyPlayerPathsAtTime(timelineTime); } catch (e) { console.warn(e); }
        if (typeof canvas !== 'undefined' && canvas?.renderAll) canvas.renderAll();
      }).catch(console.warn);
    } else {
      try { if (typeof applyPlayerPathsAtTime === 'function') applyPlayerPathsAtTime(timelineTime); } catch (e) { console.warn(e); }
      if (typeof canvas !== 'undefined' && canvas?.renderAll) canvas.renderAll();
    }
  } catch (e) {
    console.warn(e);
  }

  if (timelineTime >= effectiveDuration) {
    timelinePause();
    return;
  }
  timelineRAF = requestAnimationFrame(timelineLoop);
}

function timelinePlay(){
  ensureTimelineControlsBound();
  const effectiveDuration = Number(timelineDuration || animationDurationMs || 0);
  if (timelinePlaying || effectiveDuration <= 0) return;
  if (timelineTime >= effectiveDuration) timelineTime = 0;
  timelinePlaying = true;
  timelineStartTs = performance.now() - (timelineTime / Math.max(0.0001, timelineSpeed || 1));
  timelineRAF = requestAnimationFrame(timelineLoop);
}

function timelinePause(){
  timelinePlaying = false;
  if (timelineRAF) {
    cancelAnimationFrame(timelineRAF);
    timelineRAF = null;
  }
}

function timelineSeek(ms){
  timelineTime = Math.max(0, Number(ms) || 0);
  timelineStartTs = performance.now() - (timelineTime / Math.max(0.0001, timelineSpeed || 1));
  timelineUpdateUI();

  try {
    const frame = typeof getInterpolatedFrameAt === 'function' ? getInterpolatedFrameAt(timelineTime) : null;
    if (typeof applyAnimationFrameItems === 'function' && frame) {
      Promise.resolve(applyAnimationFrameItems(frame)).then(() => {
        try { if (typeof applyPlayerPathsAtTime === 'function') applyPlayerPathsAtTime(timelineTime); } catch (e) { console.warn(e); }
        if (typeof canvas !== 'undefined' && canvas?.renderAll) canvas.renderAll();
      }).catch(console.warn);
    } else {
      try { if (typeof applyPlayerPathsAtTime === 'function') applyPlayerPathsAtTime(timelineTime); } catch (e) { console.warn(e); }
      if (typeof canvas !== 'undefined' && canvas?.renderAll) canvas.renderAll();
    }
  } catch (e) {
    console.warn(e);
  }
}

document?.addEventListener("DOMContentLoaded",()=>{

  const playBtn=document.getElementById("timeline-play");
  const pauseBtn=document.getElementById("timeline-pause");
  const slider=document.getElementById("timeline-slider");
  const speed=document.getElementById("timeline-speed");

  if(playBtn) playBtn.onclick=timelinePlay;
  if(pauseBtn) pauseBtn.onclick=timelinePause;

  if(slider){
    slider.max = String(Math.max(1000, Number(timelineDuration || animationDurationMs || 1000)));
    slider.oninput=(e)=>{
      timelineSeek(Number(e.target.value || 0));
    };
  }

  if(speed){
    speed.onchange=(e)=>{
      timelineSpeed=parseFloat(e.target.value)||1;
    };
  }

  timelineTime = 0;
  timelineUpdateUI();
});

queueMicrotask(() => {
  ensureTimelineControlsBound();
  syncTimelineFromAnimation();
});
document?.addEventListener('DOMContentLoaded', () => {
  ensureTimelineControlsBound();
  syncTimelineFromAnimation();
});

// mobileResponsiveBoardEnhanceV915
function mobileResponsiveBoardEnhanceV915() {
  try {
    const isMobile = window.matchMedia('(max-width: 767.98px)').matches;
    document.querySelectorAll('.board-tool-btn').forEach((btn) => {
      const label = btn.querySelector('.tool-label');
      if (isMobile) {
        if (label) label.style.display = 'none';
        const title = btn.getAttribute('title') || btn.dataset.shortLabel || btn.textContent.trim();
        btn.setAttribute('aria-label', title);
      } else {
        if (label) label.style.display = '';
      }
    });

    const propsCol = document.querySelector('.board-props-col');
    if (propsCol && isMobile) {
      propsCol.style.display = 'block';
      propsCol.hidden = false;
      propsCol.classList.remove('d-none');
    }
  } catch (e) {
    console.warn(e);
  }
}

window?.addEventListener('resize', mobileResponsiveBoardEnhanceV915);
document?.addEventListener('DOMContentLoaded', mobileResponsiveBoardEnhanceV915);
queueMicrotask(() => mobileResponsiveBoardEnhanceV915());

// relayoutMobileBoardActionsV916
function relayoutMobileBoardActionsV916() {
  try {
    const isMobile = window.matchMedia('(max-width: 767.98px)').matches;
    const mobileBar = document.getElementById('mobile-board-actions-bar');
    if (!mobileBar) return;

    if (!isMobile) {
      mobileBar.innerHTML = '';
      return;
    }

    const actionContainers = [
      document.querySelector('.board-props-col .quick-actions'),
      document.querySelector('.board-props-col .board-actions'),
      document.querySelector('.board-props-col .board-props-actions')
    ].filter(Boolean);

    const buttons = [];
    actionContainers.forEach((container) => {
      container.querySelectorAll('button, a.btn').forEach((btn) => {
        buttons.push(btn);
      });
    });

    mobileBar.innerHTML = '';
    const seen = new Set();
    buttons.forEach((btn) => {
      const key = btn.getAttribute('data-action') || btn.id || btn.textContent.trim();
      if (seen.has(key)) return;
      seen.add(key);
      const clone = btn.cloneNode(true);
      clone.classList.add('btn-sm');
      clone.querySelectorAll('.btn-label').forEach((el) => el.remove());
      const textNodes = Array.from(clone.childNodes).filter((n) => n.nodeType === Node.TEXT_NODE);
      textNodes.forEach((n) => { if (n.textContent.trim()) n.textContent = ''; });
      const title = btn.getAttribute('title') || btn.getAttribute('aria-label') || btn.textContent.trim();
      if (title) {
        clone.setAttribute('title', title);
        clone.setAttribute('aria-label', title);
      }
      // Forward clicks to original
      clone?.addEventListener('click', (e) => {
        e.preventDefault();
        if (typeof btn.click === 'function') btn.click();
      });
      mobileBar.appendChild(clone);
    });
  } catch (e) {
    console.warn(e);
  }
}

window?.addEventListener('resize', relayoutMobileBoardActionsV916);
document?.addEventListener('DOMContentLoaded', relayoutMobileBoardActionsV916);
queueMicrotask(() => relayoutMobileBoardActionsV916());

// mobileBoardActionsPlacementFixV917
function mobileBoardActionsPlacementFixV917() {
  try {
    const isCompact = window.matchMedia('(max-width: 991.98px)').matches;
    const bar = document.getElementById('mobile-board-actions-bar');
    const boardLayout = document.querySelector('.board-layout, .tactical-board-layout');
    if (!bar || !boardLayout || !boardLayout.parentNode) return;

    if (boardLayout.previousElementSibling !== bar) {
      boardLayout.parentNode.insertBefore(bar, boardLayout);
    }

    if (!isCompact) {
      bar.innerHTML = '';
      return;
    }

    const actionContainers = [
      document.querySelector('.board-props-col .quick-actions'),
      document.querySelector('.board-props-col .board-actions'),
      document.querySelector('.board-props-col .board-props-actions')
    ].filter(Boolean);

    const buttons = [];
    actionContainers.forEach((container) => {
      container.querySelectorAll('button, a.btn').forEach((btn) => buttons.push(btn));
    });

    bar.innerHTML = '';
    const seen = new Set();

    buttons.forEach((btn) => {
      const key = btn.getAttribute('data-action') || btn.id || btn.textContent.trim();
      if (seen.has(key)) return;
      seen.add(key);

      const clone = btn.cloneNode(true);
      clone.classList.add('btn-sm');

      clone.querySelectorAll('.btn-label').forEach((el) => el.remove());
      Array.from(clone.childNodes).forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE && n.textContent.trim()) {
          n.textContent = '';
        }
      });

      const title = btn.getAttribute('title') || btn.getAttribute('aria-label') || btn.textContent.trim();
      if (title) {
        clone.setAttribute('title', title);
        clone.setAttribute('aria-label', title);
      }

      clone?.addEventListener('click', (e) => {
        e.preventDefault();
        if (btn.tagName.toLowerCase() === 'a' && btn.href) {
          window.window.location.href = btn.href;
          return;
        }
        if (typeof btn.click === 'function') btn.click();
      });

      bar.appendChild(clone);
    });
  } catch (e) {
    console.warn(e);
  }
}

window?.addEventListener('resize', mobileBoardActionsPlacementFixV917);
document?.addEventListener('DOMContentLoaded', mobileBoardActionsPlacementFixV917);
queueMicrotask(() => mobileBoardActionsPlacementFixV917());

// toolbarActionsMoveFromPropsV919
function resetBoardCompletelyV919() {
  try {
    if (!window.canvas || typeof canvas.getObjects !== 'function') return;

    timelinePause?.();

    const objects = canvas.getObjects().slice();
    objects.forEach((obj) => {
      try {
        canvas.remove(obj);
      } catch (e) {
        console.warn(e);
      }
    });

    try { canvas.discardActiveObject?.(); } catch (e) {}

    // Clear animation/path/runtime states
    if (typeof playerPaths !== 'undefined') playerPaths = [];
    if (typeof animationKeyframes !== 'undefined') animationKeyframes = [];
    if (typeof animationBaseState !== 'undefined') animationBaseState = null;
    if (typeof animationDurationMs !== 'undefined') animationDurationMs = 0;
    if (typeof animationRecording !== 'undefined') animationRecording = false;
    if (typeof animationStartTs !== 'undefined') animationStartTs = 0;
    if (typeof currentPath !== 'undefined') currentPath = [];
    if (typeof pathPoints !== 'undefined') pathPoints = [];
    if (typeof pathDrawing !== 'undefined') pathDrawing = false;
    if (typeof pathPlayer !== 'undefined') pathPlayer = null;
    if (typeof pathTempPolyline !== 'undefined') pathTempPolyline = null;
    if (typeof timelineDuration !== 'undefined') timelineDuration = 0;
    if (typeof timelineTime !== 'undefined') timelineTime = 0;

    // Reset persisted/working board payloads if present
    if (typeof currentDiagramJson !== 'undefined') currentDiagramJson = null;
    if (typeof currentDiagramState !== 'undefined') currentDiagramState = null;

    // Re-render empty field only
    canvas.renderAll?.();
    timelineUpdateUI?.();
    updateSelectionUI?.();

    showAlert?.('Terrain réinitialisé.', 'success');
  } catch (e) {
    console.warn(e);
    showAlert?.('Réinitialisation impossible.', 'danger');
  }
}

function bindToolbarActionsV919() {
  const resetBtn = document.getElementById('toolbar-reset-board-btn');
  const duplicateBtn = document.getElementById('toolbar-duplicate-btn');
  const copyBtn = document.getElementById('toolbar-copy-btn');
  const pasteBtn = document.getElementById('toolbar-paste-btn');
  const deleteBtn = document.getElementById('toolbar-delete-btn');

  const forwardClick = (selector, fallback) => {
    const original = document.querySelector(selector);
    if (original) {
      original.click();
      return;
    }
    if (typeof fallback === 'function') fallback();
  };

  if (duplicateBtn && !duplicateBtn.dataset.bound) {
    duplicateBtn.dataset.bound = '1';
    duplicateBtn?.addEventListener('click', () => {
      forwardClick('.board-props-col [data-action="duplicate"], .board-props-col .quick-actions .btn-outline-info, .board-props-col .board-actions .btn-outline-info');
    });
  }

  if (copyBtn && !copyBtn.dataset.bound) {
    copyBtn.dataset.bound = '1';
    copyBtn?.addEventListener('click', () => {
      forwardClick('.board-props-col [data-action="copy"], .board-props-col .quick-actions .btn-outline-primary, .board-props-col .board-actions .btn-outline-primary');
    });
  }

  if (pasteBtn && !pasteBtn.dataset.bound) {
    pasteBtn.dataset.bound = '1';
    pasteBtn?.addEventListener('click', () => {
      forwardClick('.board-props-col [data-action="paste"], .board-props-col .quick-actions .btn-outline-success, .board-props-col .board-actions .btn-outline-success');
    });
  }

  if (deleteBtn && !deleteBtn.dataset.bound) {
    deleteBtn.dataset.bound = '1';
    deleteBtn?.addEventListener('click', () => {
      forwardClick('.board-props-col [data-action="delete"], .board-props-col .quick-actions .btn-outline-danger, .board-props-col .board-actions .btn-outline-danger', () => {
        const active = canvas?.getActiveObject?.();
        if (active) {
          try { canvas.remove(active); canvas.renderAll(); } catch (e) {}
        }
      });
    });
  }

  if (resetBtn && !resetBtn.dataset.bound) {
    resetBtn.dataset.bound = '1';
    resetBtn?.addEventListener('click', () => {
      resetBoardCompletelyV919();
    });
  }
}

document?.addEventListener('DOMContentLoaded', bindToolbarActionsV919);
queueMicrotask(() => bindToolbarActionsV919());

// toolbarActionsVisualFixV920
function toolbarActionsVisualFixV920() {
  try {
    const actionBtns = document.querySelectorAll('.board-toolbar-action');
    actionBtns.forEach((btn) => {
      btn.classList.remove('active');
      btn.setAttribute('data-no-tool-active', '1');
      btn?.addEventListener('mousedown', () => btn.classList.remove('active'));
      btn?.addEventListener('mouseup', () => btn.classList.remove('active'));
      btn?.addEventListener('click', () => {
        setTimeout(() => btn.classList.remove('active'), 0);
      });
    });
  } catch (e) {
    console.warn(e);
  }
}

document?.addEventListener('DOMContentLoaded', toolbarActionsVisualFixV920);
queueMicrotask(() => toolbarActionsVisualFixV920());

// toolbarActionsDirectHandlersV924
function getSelectedBoardObjectV924() {
  try {
    return canvas?.getActiveObject?.() || null;
  } catch (e) {
    return null;
  }
}

async function duplicateSelectedObjectV924() {
  try {
    const active = getSelectedBoardObjectV924();
    if (!active) {
      showAlert?.('Sélectionnez un élément à dupliquer.', 'warning');
      return;
    }
    if (typeof active.clone === 'function') {
      active.clone((cloned) => {
        if (!cloned) return;
        cloned.set({
          left: Number(active.left || 0) + 20,
          top: Number(active.top || 0) + 20
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll?.();
      });
    } else {
      showAlert?.('Duplication non disponible pour cet élément.', 'warning');
    }
  } catch (e) {
    console.warn(e);
  }
}

function deleteSelectedObjectV924() {
  try {
    const active = getSelectedBoardObjectV924();
    if (!active) {
      showAlert?.('Sélectionnez un élément à supprimer.', 'warning');
      return;
    }
    canvas.remove?.(active);
    canvas.discardActiveObject?.();
    canvas.renderAll?.();
  } catch (e) {
    console.warn(e);
  }
}

function copySelectedObjectV924() {
  try {
    const active = getSelectedBoardObjectV924();
    if (!active) {
      showAlert?.('Sélectionnez un élément à copier.', 'warning');
      return;
    }
    if (typeof active.clone === 'function') {
      active.clone((cloned) => {
        window.__tacticBoardClipboard = cloned;
        showAlert?.('Élément copié.', 'success');
      });
    }
  } catch (e) {
    console.warn(e);
  }
}

function pasteSelectedObjectV924() {
  try {
    const clip = window.__tacticBoardClipboard;
    if (!clip) {
      showAlert?.('Aucun élément copié.', 'warning');
      return;
    }
    if (typeof clip.clone === 'function') {
      clip.clone((cloned) => {
        cloned.set({
          left: Number(clip.left || 0) + 20,
          top: Number(clip.top || 0) + 20
        });
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll?.();
      });
    } else {
      const cloned = fabricLib.util.object.clone(clip);
      if (cloned) {
        canvas.add(cloned);
        canvas.setActiveObject(cloned);
        canvas.renderAll?.();
      }
    }
  } catch (e) {
    console.warn(e);
  }
}

function bindToolbarActionsDirectV924() {
  const duplicateBtn = document.getElementById('toolbar-duplicate-btn');
  const copyBtn = document.getElementById('toolbar-copy-btn');
  const pasteBtn = document.getElementById('toolbar-paste-btn');
  const deleteBtn = document.getElementById('toolbar-delete-btn');

  if (duplicateBtn && !duplicateBtn.dataset.directBound) {
    duplicateBtn.dataset.directBound = '1';
    duplicateBtn.addEventListener('click', (e) => {
      e.preventDefault();
      duplicateSelectedObjectV924();
    });
  }
  if (copyBtn && !copyBtn.dataset.directBound) {
    copyBtn.dataset.directBound = '1';
    copyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      copySelectedObjectV924();
    });
  }
  if (pasteBtn && !pasteBtn.dataset.directBound) {
    pasteBtn.dataset.directBound = '1';
    pasteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      pasteSelectedObjectV924();
    });
  }
  if (deleteBtn && !deleteBtn.dataset.directBound) {
    deleteBtn.dataset.directBound = '1';
    deleteBtn.addEventListener('click', (e) => {
      e.preventDefault();
      deleteSelectedObjectV924();
    });
  }
}

document.addEventListener('DOMContentLoaded', bindToolbarActionsDirectV924);
queueMicrotask(() => bindToolbarActionsDirectV924());

function bindTerrainOrientationButtonV930() {
  const btn = document.getElementById('terrain-orientation-btn');
  if (btn && !btn.dataset.boundTerrainOrientation) {
    btn.dataset.boundTerrainOrientation = '1';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleBoardOrientation();
    });
  }
  updateTerrainOrientationButton();
}

document.addEventListener('DOMContentLoaded', () => {
  bindTerrainOrientationButtonV930();
  updateTerrainOrientationButton();
});
queueMicrotask(() => {
  bindTerrainOrientationButtonV930();
  updateTerrainOrientationButton();
});

// orientationSmartConstraintsV935
function makeOrientationPointMapper(prevW, prevH, newW, newH, fromOrientation = 'horizontal', toOrientation = 'vertical') {
  return (x, y) => {
    const px = Number(x || 0) / Math.max(1, prevW);
    const py = Number(y || 0) / Math.max(1, prevH);
    if (fromOrientation === 'horizontal' && toOrientation === 'vertical') {
      return { x: py * newW, y: (1 - px) * newH };
    }
    if (fromOrientation === 'vertical' && toOrientation === 'horizontal') {
      return { x: (1 - py) * newW, y: px * newH };
    }
    return { x: px * newW, y: py * newH };
  };
}

function transformSerializedObjectByTypeV935(obj, prevW, prevH, newW, newH, fromOrientation, toOrientation) {
  const mapPoint = makeOrientationPointMapper(prevW, prevH, newW, newH, fromOrientation, toOrientation);
  const angleDelta = fromOrientation === 'horizontal' && toOrientation === 'vertical' ? 90
    : fromOrientation === 'vertical' && toOrientation === 'horizontal' ? -90
    : 0;
  const o = JSON.parse(JSON.stringify(obj || {}));

  if (o.pbType === 'zone') {
    const p1 = mapPoint(Number(o.left || 0), Number(o.top || 0));
    const p2 = mapPoint(Number(o.left || 0) + Number(o.width || 0), Number(o.top || 0) + Number(o.height || 0));
    o.left = Math.min(p1.x, p2.x);
    o.top = Math.min(p1.y, p2.y);
    o.width = Math.abs(p2.x - p1.x);
    o.height = Math.abs(p2.y - p1.y);
    return o;
  }

  if (o.pbType === 'line' || (typeof o.x1 === 'number' && typeof o.y1 === 'number' && typeof o.x2 === 'number' && typeof o.y2 === 'number')) {
    const p1 = mapPoint(o.x1, o.y1);
    const p2 = mapPoint(o.x2, o.y2);
    o.x1 = p1.x; o.y1 = p1.y; o.x2 = p2.x; o.y2 = p2.y;
    return o;
  }

  if (o.pbType === 'player-path' && Array.isArray(o.points)) {
    o.points = o.points.map((pt) => {
      const p = mapPoint(pt.x, pt.y);
      return { ...pt, x: p.x, y: p.y };
    });
    return o;
  }

  if (['arrow','pass-arrow','curved-arrow'].includes(o.pbType) && o.pbCoords) {
    const p1 = mapPoint(o.pbCoords.x1, o.pbCoords.y1);
    const p2 = mapPoint(o.pbCoords.x2, o.pbCoords.y2);
    const pc = (typeof o.pbCoords.cx === 'number' && typeof o.pbCoords.cy === 'number') ? mapPoint(o.pbCoords.cx, o.pbCoords.cy) : null;
    o.pbCoords = {
      ...o.pbCoords,
      x1: p1.x, y1: p1.y,
      x2: p2.x, y2: p2.y,
      cx: pc ? pc.x : o.pbCoords.cx,
      cy: pc ? pc.y : o.pbCoords.cy
    };
    return o;
  }

  if (Array.isArray(o.points)) {
    o.points = o.points.map((pt) => {
      const p = mapPoint(pt.x, pt.y);
      return { ...pt, x: p.x, y: p.y };
    });
  }

  if (typeof o.left === 'number' && typeof o.top === 'number') {
    const p = mapPoint(o.left, o.top);
    o.left = p.x;
    o.top = p.y;
  }

  if (typeof o.angle === 'number') {
    o.angle = (o.angle + angleDelta + 360) % 360;
  }

  return o;
}

function applySmartConstraintsToObjectV935(obj) {
  if (!obj || obj.isFieldBg) return;
  try {
    if (obj.pbType === 'line' && typeof obj.x1 === 'number' && typeof obj.y1 === 'number' && typeof obj.x2 === 'number' && typeof obj.y2 === 'number') {
      const minX = Math.min(obj.x1, obj.x2), maxX = Math.max(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2), maxY = Math.max(obj.y1, obj.y2);
      let dx = 0, dy = 0;
      if (minX < 0) dx = -minX;
      if (maxX > CANVAS_W) dx = CANVAS_W - maxX;
      if (minY < 0) dy = -minY;
      if (maxY > CANVAS_H) dy = CANVAS_H - maxY;
      if (dx || dy) obj.set({ x1: obj.x1 + dx, x2: obj.x2 + dx, y1: obj.y1 + dy, y2: obj.y2 + dy });
      obj.setCoords?.();
      return;
    }

    if (obj.pbType === 'zone') {
      const rect = obj.getBoundingRect ? obj.getBoundingRect(true, true) : null;
      if (!rect) return;
      let dx = 0, dy = 0;
      if (rect.left < 0) dx = -rect.left;
      if (rect.top < 0) dy = -rect.top;
      if (rect.left + rect.width > CANVAS_W) dx = CANVAS_W - (rect.left + rect.width);
      if (rect.top + rect.height > CANVAS_H) dy = CANVAS_H - (rect.top + rect.height);
      if (dx || dy) {
        obj.left = Number(obj.left || 0) + dx;
        obj.top = Number(obj.top || 0) + dy;
        obj.setCoords?.();
      }
      return;
    }

    if (obj.pbType === 'player-path' && Array.isArray(obj.points)) {
      obj.points = obj.points.map((pt) => ({
        ...pt,
        x: Math.max(0, Math.min(CANVAS_W, Number(pt.x || 0))),
        y: Math.max(0, Math.min(CANVAS_H, Number(pt.y || 0)))
      }));
      obj.set({ points: obj.points });
      obj.setCoords?.();
      return;
    }

    const rect = obj.getBoundingRect ? obj.getBoundingRect(true, true) : null;
    if (!rect) return;
    let dx = 0, dy = 0;
    if (rect.left < 0) dx = -rect.left;
    if (rect.top < 0) dy = -rect.top;
    if (rect.left + rect.width > CANVAS_W) dx = CANVAS_W - (rect.left + rect.width);
    if (rect.top + rect.height > CANVAS_H) dy = CANVAS_H - (rect.top + rect.height);
    if (dx || dy) {
      obj.left = Number(obj.left || 0) + dx;
      obj.top = Number(obj.top || 0) + dy;
      obj.setCoords?.();
    }
  } catch (e) {
    console.warn(e);
  }
}

function rebuildPathPolylineForOrientationV938(orig, mappedPoints, existingTarget) {
  const rebuilt = buildPathPolyline(mappedPoints, false);
  rebuilt.animId = existingTarget?.animId || orig?.animId || rebuilt.animId;
  rebuilt.labelText = existingTarget?.labelText || orig?.labelText || 'Path';
  rebuilt.pathPlayerAnimId = existingTarget?.pathPlayerAnimId || orig?.pathPlayerAnimId || null;
  rebuilt.pbAbsPoints = mappedPoints.map(pt => ({ x: pt.x, y: pt.y, time: Number(pt.time || 0) }));
  return rebuilt;
}

function postProcessObjectsAfterOrientationV935(originalObjects, prevW, prevH, newW, newH, fromOrientation, toOrientation) {
  if (!Array.isArray(originalObjects)) return;
  const byAnimId = new Map((canvas.getObjects?.() || []).map((o) => [String(o.animId || ''), o]).filter(([id]) => id));

  const mapPoint = makeOrientationPointMapper(prevW, prevH, newW, newH, fromOrientation, toOrientation);
  const angleDelta = fromOrientation === 'horizontal' && toOrientation === 'vertical' ? 90
    : fromOrientation === 'vertical' && toOrientation === 'horizontal' ? -90
    : 0;

  originalObjects.forEach((orig) => {
    const animId = String(orig?.animId || '');
    let target = byAnimId.get(animId);
    if (!target) return;

    // Rebuild grouped arrows from coords
    if (['arrow','pass-arrow','curved-arrow'].includes(orig.pbType) && orig.pbCoords) {
      try {
        const transformed = transformSerializedObjectByTypeV935(orig, prevW, prevH, newW, newH, fromOrientation, toOrientation);
        const color = transformed.pbColor || '#ffab00';
        const width = Number(transformed.pbStrokeWidth || 4);
        let rebuilt = null;
        if (orig.pbType === 'arrow') rebuilt = buildArrow(transformed.pbCoords.x1, transformed.pbCoords.y1, transformed.pbCoords.x2, transformed.pbCoords.y2, color, width);
        if (orig.pbType === 'pass-arrow') rebuilt = buildPassArrow(transformed.pbCoords.x1, transformed.pbCoords.y1, transformed.pbCoords.x2, transformed.pbCoords.y2, color, width);
        if (orig.pbType === 'curved-arrow') rebuilt = buildCurvedArrow(transformed.pbCoords.x1, transformed.pbCoords.y1, transformed.pbCoords.x2, transformed.pbCoords.y2, color, width, Number(transformed.pbCurveSide || 1));
        if (rebuilt) {
          rebuilt.animId = target.animId || transformed.animId || orig.animId;
          rebuilt.labelText = target.labelText || transformed.labelText || '';
          canvas.remove(target);
          canvas.add(rebuilt);
          byAnimId.set(animId, rebuilt);
          target = rebuilt;
        }
        applySmartConstraintsToObjectV935(target);
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    // Rebuild line from mapped endpoints using stored absolute coords when available
    if (orig.pbType === 'line') {
      try {
        const source = orig.pbCoords && typeof orig.pbCoords.x1 === 'number'
          ? orig.pbCoords
          : { x1: orig.x1, y1: orig.y1, x2: orig.x2, y2: orig.y2 };
        const p1 = mapPoint(source.x1, source.y1);
        const p2 = mapPoint(source.x2, source.y2);
        const rebuilt = new fabricLib.Line([p1.x, p1.y, p2.x, p2.y], {
          stroke: orig.stroke || target.stroke || '#ffffff',
          strokeWidth: Number(orig.strokeWidth || target.strokeWidth || 4),
          opacity: typeof orig.opacity === 'number' ? orig.opacity : (typeof target.opacity === 'number' ? target.opacity : 1),
          pbType: 'line',
          pbCoords: { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }
        });
        rebuilt.animId = target.animId || orig.animId;
        rebuilt.labelText = target.labelText || orig.labelText || '';
        canvas.remove(target);
        canvas.add(rebuilt);
        byAnimId.set(animId, rebuilt);
        target = rebuilt;
        applySmartConstraintsToObjectV935(target);
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    // Keep zone centered and swap dimensions so it visually rotates without drift
    if (orig.pbType === 'zone') {
      try {
        const left = Number(orig.left || 0);
        const top = Number(orig.top || 0);
        const width0 = Number(orig.width || 0) * Number(orig.scaleX || 1);
        const height0 = Number(orig.height || 0) * Number(orig.scaleY || 1);
        const centerX = left + (width0 / 2);
        const centerY = top + (height0 / 2);
        const mappedCenter = mapPoint(centerX, centerY);

        const widthScaled = (width0 / Math.max(1, prevW)) * newW;
        const heightScaled = (height0 / Math.max(1, prevH)) * newH;

        const finalWidth = fromOrientation !== toOrientation ? Math.max(8, heightScaled) : Math.max(8, widthScaled);
        const finalHeight = fromOrientation !== toOrientation ? Math.max(8, widthScaled) : Math.max(8, heightScaled);

        target.set({
          originX: 'center',
          originY: 'center',
          left: mappedCenter.x,
          top: mappedCenter.y,
          width: finalWidth,
          height: finalHeight,
          scaleX: 1,
          scaleY: 1,
          angle: 0
        });
        target.setCoords?.();
        applySmartConstraintsToObjectV935(target);
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    if (orig.pbType === 'player-path') {
      try {
        const sourcePoints = Array.isArray(orig.pbAbsPoints) && orig.pbAbsPoints.length ? orig.pbAbsPoints : (Array.isArray(orig.points) ? orig.points : []);
        const mappedPoints = sourcePoints.map((pt) => {
          const p = mapPoint(pt.x, pt.y);
          return { ...pt, x: p.x, y: p.y };
        });
        const rebuilt = rebuildPathPolylineForOrientationV938(orig, mappedPoints, target);
        canvas.remove(target);
        canvas.add(rebuilt);
        byAnimId.set(animId, rebuilt);
        target = rebuilt;
        applySmartConstraintsToObjectV935(target);
      } catch (e) {
        console.warn(e);
      }
      return;
    }

    const transformed = transformSerializedObjectByTypeV935(orig, prevW, prevH, newW, newH, fromOrientation, toOrientation);
    if (orig.pbType === 'text') {
      target.set({
        left: transformed.left,
        top: transformed.top,
        angle: transformed.angle
      });
      target.setCoords?.();
      applySmartConstraintsToObjectV935(target);
      return;
    }

    if (typeof transformed.left === 'number' && typeof transformed.top === 'number') {
      target.set({ left: transformed.left, top: transformed.top });
      if (typeof transformed.angle === 'number') target.set({ angle: transformed.angle });
      target.setCoords?.();
      applySmartConstraintsToObjectV935(target);
    }
  });

  canvas.renderAll?.();
}

// mobileTabletBoardRefitV936
function mobileTabletBoardRefitV936() {
  try {
    resizeBoardCanvas({ preserveObjects: true });
  } catch (e) {
    console.warn(e);
  }
}
window.addEventListener('load', () => setTimeout(() => mobileTabletBoardRefitV936(), 60));

// disablePresentationInTacticalBoardV948
document.addEventListener('DOMContentLoaded', () => {
  try {
    presentationMode = false;
    document.querySelectorAll('[id*="presentation" i],[data-action="presentation"]').forEach((el) => {
      el.style.display = 'none';
      if ('disabled' in el) el.disabled = true;
    });
  } catch (e) {
    console.warn(e);
  }
});


// defaultNewDiagramBoardEntryV952
document.addEventListener('DOMContentLoaded', () => {
  try {
    if (diagramSelect && !diagramSelect.dataset.boundNewDiagramV952) {
      diagramSelect.dataset.boundNewDiagramV952 = '1';
      diagramSelect.addEventListener('change', async (e) => {
        const value = e.target.value || '';
        if (!value) {
          currentDiagram = null;
          BOARD_ORIENTATION = 'horizontal';
          updateBoardDimensionsForOrientation();
          const size = computeResponsiveCanvasSize();
          CANVAS_W = size.width;
          CANVAS_H = size.height;
          canvas.setWidth(CANVAS_W);
          canvas.setHeight(CANVAS_H);
          updateTerrainOrientationButton();
          canvas.getObjects().filter(o => !o.isFieldBg).forEach(o => canvas.remove(o));
          canvas.discardActiveObject();
          await renderFieldBackground();
          resetViewport();
          canvas.renderAll();
          pushHistoryState();
        }
      });
    }
  } catch (e) {
    console.warn(e);
  }
});
