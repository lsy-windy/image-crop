const app = document.getElementById("app");
const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("resizer");
const dropzone = document.getElementById("dropzone");
const uploadTrigger = document.getElementById("uploadTrigger");
const fileInput = document.getElementById("fileInput");
const cropBtn = document.getElementById("cropBtn");
const previewBtn = document.getElementById("previewBtn");
const optionUpscaleBtn = document.getElementById("optionUpscaleBtn");
const optionAiUpscaleBtn = document.getElementById("optionAiUpscaleBtn");
const optionDownscaleBtn = document.getElementById("optionDownscaleBtn");
const optionAiDownscaleBtn = document.getElementById("optionAiDownscaleBtn");
const restoreBtn = document.getElementById("restoreBtn");
const ratioGroup = document.getElementById("ratioGroup");
const ratioButtons = Array.from(document.querySelectorAll(".ratio-btn"));
const ratioModalBackdrop = document.getElementById("ratioModalBackdrop");
const ratioWidthInput = document.getElementById("ratioWidthInput");
const ratioHeightInput = document.getElementById("ratioHeightInput");
const ratioApplyBtn = document.getElementById("ratioApplyBtn");
const ratioCancelBtn = document.getElementById("ratioCancelBtn");
const ratioErrorText = document.getElementById("ratioErrorText");
const scaleSwitchModalBackdrop = document.getElementById("scaleSwitchModalBackdrop");
const scaleSwitchConfirmBtn = document.getElementById("scaleSwitchConfirmBtn");
const scaleSwitchCancelBtn = document.getElementById("scaleSwitchCancelBtn");
const saveFormatModalBackdrop = document.getElementById("saveFormatModalBackdrop");
const saveFormatDontShowChk = document.getElementById("saveFormatDontShowChk");
const saveFormatConfirmBtn = document.getElementById("saveFormatConfirmBtn");
const saveFormatCancelBtn = document.getElementById("saveFormatCancelBtn");
const formatSelect = document.getElementById("formatSelect");
const infoSize = document.getElementById("infoSize");
const infoBytes = document.getElementById("infoBytes");
const infoRatio = document.getElementById("infoRatio");
const canvas = document.getElementById("canvas");
const cropContextMenu = document.getElementById("cropContextMenu");
const ctx = canvas.getContext("2d");

const MIN_SELECTION_SIZE = 20;
const HANDLE_SIZE = 10;
const MIN_SIDEBAR_WIDTH = 300;
const MAX_SIDEBAR_WIDTH = 420;
const MIN_WORKSPACE_WIDTH = 360;
const UPSCALE_MAX_SIZE = 10000;
const SAVE_FORMAT_NOTICE_KEY = "crop.save.notice.skip";
const OUTPUT_FORMATS = {
  png: { mime: "image/png", quality: undefined, ext: "png" },
  jpg: { mime: "image/jpeg", quality: 0.92, ext: "jpg" },
  jpeg: { mime: "image/jpeg", quality: 0.92, ext: "jpeg" },
  webp: { mime: "image/webp", quality: 0.92, ext: "webp" },
  gif: { mime: "image/gif", quality: undefined, ext: "gif" },
  bmp: { mime: "image/bmp", quality: undefined, ext: "bmp" },
  tiff: { mime: "image/tiff", quality: undefined, ext: "tiff" },
  avif: { mime: "image/avif", quality: 0.9, ext: "avif" },
  heic: { mime: "image/heic", quality: undefined, ext: "heic" },
  ico: { mime: "image/x-icon", quality: undefined, ext: "ico" },
};

const CURSOR_BY_HANDLE = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
};

// Centralized runtime state for canvas interaction and temporary UI state.
const state = {
  image: null,
  originalDataUrl: "",
  originalImageWidth: 0,
  originalImageHeight: 0,
  aiProcessing: false,
  scaleMode: "",
  pendingScaleSwitchMode: "",
  selection: null,
  drawArea: null,
  zoom: 1,
  panX: 0,
  panY: 0,
  aspectRatio: null,
  ratioKey: "",
  resizing: false,
  pointer: {
    active: false,
    mode: "",
    handle: "",
    startPoint: null,
    startSelection: null,
    lastPoint: null,
    moved: false,
    startPanX: 0,
    startPanY: 0,
  },
  suppressContextMenuOnce: false,
  infoEstimateToken: 0,
  infoEstimateTimer: null,
  previewWindow: null,
  previewObjectUrl: "",
  zoomRatioTarget: null,
  zoomRatioTargetLabel: "",
  pendingSaveCanvas: null,
  pendingSaveFormat: null,
  scaleHistory: [],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getSidebarWidthConstraints() {
  const totalWidth = app.getBoundingClientRect().width;
  const maxByViewport = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.floor(totalWidth - MIN_WORKSPACE_WIDTH - 8)
  );
  return {
    min: MIN_SIDEBAR_WIDTH,
    max: Math.min(MAX_SIDEBAR_WIDTH, maxByViewport),
  };
}

function applySidebarWidth(nextWidth) {
  const { min, max } = getSidebarWidthConstraints();
  const width = clamp(nextWidth, min, max);
  app.style.setProperty("--sidebar-width", `${width}px`);
  return width;
}

function setCanvasSize() {
  const rect = dropzone.getBoundingClientRect();
  canvas.width = Math.max(320, Math.floor(rect.width - 32));
  canvas.height = Math.max(320, Math.floor(rect.height - 32));
}

function drawPlaceholder() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#f8fbff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function updateUploadTriggerVisibility() {
  if (!uploadTrigger) {
    return;
  }
  uploadTrigger.hidden = Boolean(state.image);
}

function pointInRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  );
}

function pointInDrawArea(point) {
  if (!state.drawArea) {
    return false;
  }
  return pointInRect(point, {
    x: state.drawArea.offsetX,
    y: state.drawArea.offsetY,
    w: state.drawArea.drawW,
    h: state.drawArea.drawH,
  });
}

function getCanvasPoint(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function normalizeRect(a, b) {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(a.x - b.x);
  const h = Math.abs(a.y - b.y);
  return { x, y, w, h };
}

function rectWithinDrawArea(rect) {
  if (!state.drawArea) {
    return null;
  }
  const x = clamp(rect.x, state.drawArea.offsetX, state.drawArea.offsetX + state.drawArea.drawW);
  const y = clamp(rect.y, state.drawArea.offsetY, state.drawArea.offsetY + state.drawArea.drawH);
  const x2 = clamp(rect.x + rect.w, state.drawArea.offsetX, state.drawArea.offsetX + state.drawArea.drawW);
  const y2 = clamp(rect.y + rect.h, state.drawArea.offsetY, state.drawArea.offsetY + state.drawArea.drawH);
  return { x, y, w: Math.max(0, x2 - x), h: Math.max(0, y2 - y) };
}

function selectionHandles(rect) {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  return [
    { name: "nw", x: rect.x, y: rect.y },
    { name: "n", x: cx, y: rect.y },
    { name: "ne", x: rect.x + rect.w, y: rect.y },
    { name: "e", x: rect.x + rect.w, y: cy },
    { name: "se", x: rect.x + rect.w, y: rect.y + rect.h },
    { name: "s", x: cx, y: rect.y + rect.h },
    { name: "sw", x: rect.x, y: rect.y + rect.h },
    { name: "w", x: rect.x, y: cy },
  ];
}

function detectHandle(point, rect) {
  const handles = selectionHandles(rect);
  const half = HANDLE_SIZE / 2;
  return handles.find((h) => (
    point.x >= h.x - half &&
    point.x <= h.x + half &&
    point.y >= h.y - half &&
    point.y <= h.y + half
  )) || null;
}

function drawHandles(rect) {
  ctx.save();
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#0369a1";
  ctx.lineWidth = 1.5;
  const half = HANDLE_SIZE / 2;
  selectionHandles(rect).forEach((h) => {
    ctx.beginPath();
    ctx.rect(h.x - half, h.y - half, HANDLE_SIZE, HANDLE_SIZE);
    ctx.fill();
    ctx.stroke();
  });
  ctx.restore();
}

function updateRatioButtonState() {
  ratioButtons.forEach((button) => {
    const key = button.dataset.ratio || "";
    button.classList.toggle("active", key === state.ratioKey);
  });
}

function updateButtonState() {
  const hasImage = Boolean(state.image);
  const aiBusy = state.aiProcessing;
  const validSelection = Boolean(state.selection && state.selection.w > 3 && state.selection.h > 3);
  const upscaleBlockedBySize = hasImage && isUpscaleBlockedBySize();
  const downscaleBlockedBySize = hasImage && isDownscaleBlockedBySize();
  cropBtn.disabled = !(hasImage && validSelection) || aiBusy;
  previewBtn.disabled = !(hasImage && validSelection) || aiBusy;
  // Keep real disabled only when no image (no tooltip expected).
  // For size-blocked state, use pseudo-disabled so tooltip can still appear.
  optionUpscaleBtn.disabled = !hasImage || aiBusy;
  optionUpscaleBtn.classList.toggle("pseudo-disabled", !aiBusy && upscaleBlockedBySize);
  optionUpscaleBtn.setAttribute("aria-disabled", !aiBusy && upscaleBlockedBySize ? "true" : "false");
  optionUpscaleBtn.classList.toggle("has-tooltip", !aiBusy && upscaleBlockedBySize);
  optionUpscaleBtn.setAttribute("data-tooltip", !aiBusy && upscaleBlockedBySize ? "너무 큽니다." : "");
  // Keep real disabled only when no image (no tooltip expected).
  // For size-blocked state, use pseudo-disabled so tooltip can still appear.
  optionDownscaleBtn.disabled = !hasImage || aiBusy;
  optionDownscaleBtn.classList.toggle("pseudo-disabled", !aiBusy && downscaleBlockedBySize);
  optionDownscaleBtn.setAttribute("aria-disabled", !aiBusy && downscaleBlockedBySize ? "true" : "false");
  optionDownscaleBtn.classList.toggle("has-tooltip", !aiBusy && downscaleBlockedBySize);
  optionDownscaleBtn.setAttribute("data-tooltip", !aiBusy && downscaleBlockedBySize ? "너무 작습니다." : "");
  const aiUpscaleTooltip = aiBusy ? "처리 중입니다..." : (upscaleBlockedBySize ? "너무 큽니다." : "");
  const aiDownscaleTooltip = aiBusy ? "처리 중입니다..." : (downscaleBlockedBySize ? "너무 작습니다." : "");
  optionAiUpscaleBtn.disabled = !hasImage || aiBusy;
  optionAiUpscaleBtn.classList.toggle("pseudo-disabled", !aiBusy && upscaleBlockedBySize);
  optionAiUpscaleBtn.setAttribute("aria-disabled", !aiBusy && upscaleBlockedBySize ? "true" : "false");
  optionAiUpscaleBtn.classList.toggle("has-tooltip", Boolean(aiUpscaleTooltip));
  optionAiUpscaleBtn.setAttribute("data-tooltip", aiUpscaleTooltip);
  optionAiDownscaleBtn.disabled = !hasImage || aiBusy;
  optionAiDownscaleBtn.classList.toggle("pseudo-disabled", !aiBusy && downscaleBlockedBySize);
  optionAiDownscaleBtn.setAttribute("aria-disabled", !aiBusy && downscaleBlockedBySize ? "true" : "false");
  optionAiDownscaleBtn.classList.toggle("has-tooltip", Boolean(aiDownscaleTooltip));
  optionAiDownscaleBtn.setAttribute("data-tooltip", aiDownscaleTooltip);
  restoreBtn.disabled = !state.originalDataUrl || aiBusy;
  formatSelect.disabled = !hasImage || aiBusy;
  ratioButtons.forEach((button) => {
    button.disabled = !hasImage || aiBusy;
  });
  updateRatioButtonState();
  updateCropInfo();
  updateUploadTriggerVisibility();
}

// Keep rendering and control-state refresh synchronized.
function refreshUI() {
  drawImageWithSelection();
  updateButtonState();
}

function getDownscaleLimits() {
  if (!state.image) {
    return null;
  }
  const originalW = state.originalImageWidth || state.image.width;
  const originalH = state.originalImageHeight || state.image.height;
  return {
    minWidth: originalW < 100 ? originalW : 100,
    minHeight: originalH < 100 ? originalH : 100,
  };
}

function isUpscaleBlockedBySize() {
  if (!state.image) {
    return false;
  }
  const originalW = state.originalImageWidth || state.image.width;
  const originalH = state.originalImageHeight || state.image.height;
  const nextWidth = Math.floor(state.image.width * 2);
  const nextHeight = Math.floor(state.image.height * 2);

  // If both original dimensions are already >= max, allow upscale only up to original size.
  if (originalW >= UPSCALE_MAX_SIZE && originalH >= UPSCALE_MAX_SIZE) {
    return nextWidth > originalW || nextHeight > originalH;
  }

  return nextWidth > UPSCALE_MAX_SIZE || nextHeight > UPSCALE_MAX_SIZE;
}

function isDownscaleBlockedBySize() {
  if (!state.image) {
    return false;
  }
  const limits = getDownscaleLimits();
  if (!limits) {
    return false;
  }
  const nextWidth = Math.floor(state.image.width / 2);
  const nextHeight = Math.floor(state.image.height / 2);
  return nextWidth < limits.minWidth || nextHeight < limits.minHeight;
}

function waitForPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function makeCanvas(width, height) {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(width));
  out.height = Math.max(1, Math.floor(height));
  return out;
}

function drawScaled(source, width, height) {
  const out = makeCanvas(width, height);
  const outCtx = out.getContext("2d");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(source, 0, 0, out.width, out.height);
  return out;
}

function applyUnsharpMask(canvasToEnhance, amount = 0.28) {
  const width = canvasToEnhance.width;
  const height = canvasToEnhance.height;
  const pixels = width * height;
  if (pixels <= 4 || pixels > 12_000_000) {
    return;
  }

  const outCtx = canvasToEnhance.getContext("2d");
  const imageData = outCtx.getImageData(0, 0, width, height);
  const src = imageData.data;
  const dst = new Uint8ClampedArray(src);

  const clampChannel = (value) => clamp(Math.round(value), 0, 255);
  const get = (x, y, c) => src[(y * width + x) * 4 + c];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const idx = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        let sum = 0;
        for (let ky = -1; ky <= 1; ky += 1) {
          for (let kx = -1; kx <= 1; kx += 1) {
            sum += get(x + kx, y + ky, c);
          }
        }
        const blur = sum / 9;
        const origin = src[idx + c];
        dst[idx + c] = clampChannel(origin + amount * (origin - blur));
      }
      dst[idx + 3] = src[idx + 3];
    }
  }

  imageData.data.set(dst);
  outCtx.putImageData(imageData, 0, 0);
}

function buildAiUpscaledCanvas(sourceImage) {
  const targetWidth = Math.max(1, Math.floor(sourceImage.width * 2));
  const targetHeight = Math.max(1, Math.floor(sourceImage.height * 2));
  const stageWidth = Math.max(1, Math.floor(sourceImage.width * 1.35));
  const stageHeight = Math.max(1, Math.floor(sourceImage.height * 1.35));

  const stage = drawScaled(sourceImage, stageWidth, stageHeight);
  const out = drawScaled(stage, targetWidth, targetHeight);
  applyUnsharpMask(out, 0.34);
  return out;
}

function buildAiDownscaledCanvas(sourceImage, targetWidth, targetHeight) {
  let working = drawScaled(sourceImage, sourceImage.width, sourceImage.height);
  while (working.width / 2 >= targetWidth && working.height / 2 >= targetHeight) {
    working = drawScaled(
      working,
      Math.max(targetWidth, Math.floor(working.width / 2)),
      Math.max(targetHeight, Math.floor(working.height / 2))
    );
  }
  if (working.width !== targetWidth || working.height !== targetHeight) {
    working = drawScaled(working, targetWidth, targetHeight);
  }
  applyUnsharpMask(working, 0.18);
  return working;
}

function applyScaledResult(nextCanvas, beforeImageW, beforeImageH, selectionImageRect) {
  const nextUrl = nextCanvas.toDataURL("image/png");
  loadImageFromUrl(nextUrl, {
    preserveView: true,
    preserveScaleMode: true,
    preserveScaleHistory: true,
    selectionImageRect,
    referenceImageWidth: beforeImageW,
    referenceImageHeight: beforeImageH,
  });
}

async function runAiUpscale() {
  if (!state.image || state.aiProcessing) {
    return;
  }
  if (!ensureScaleModeAllowed("ai")) {
    return;
  }
  if (tryUndoScaleFor("up")) {
    return;
  }
  if (isUpscaleBlockedBySize()) {
    return;
  }
  pushScaleHistory("up");
  const beforeImageW = state.image.width;
  const beforeImageH = state.image.height;
  const selectionImageRect = getCropPixelRect();
  state.scaleMode = "ai";
  state.aiProcessing = true;
  refreshUI();
  await waitForPaint();
  try {
    const out = buildAiUpscaledCanvas(state.image);
    applyScaledResult(out, beforeImageW, beforeImageH, selectionImageRect);
  } finally {
    state.aiProcessing = false;
    refreshUI();
  }
}

async function runAiDownscale() {
  if (!state.image || state.aiProcessing) {
    return;
  }
  if (!ensureScaleModeAllowed("ai")) {
    return;
  }
  if (tryUndoScaleFor("down")) {
    return;
  }
  if (isDownscaleBlockedBySize()) {
    return;
  }
  const limits = getDownscaleLimits();
  if (!limits) {
    return;
  }
  const nextWidth = Math.floor(state.image.width / 2);
  const nextHeight = Math.floor(state.image.height / 2);
  if (nextWidth < limits.minWidth || nextHeight < limits.minHeight) {
    return;
  }

  pushScaleHistory("down");
  const beforeImageW = state.image.width;
  const beforeImageH = state.image.height;
  const selectionImageRect = getCropPixelRect();
  state.scaleMode = "ai";
  state.aiProcessing = true;
  refreshUI();
  await waitForPaint();
  try {
    const out = buildAiDownscaledCanvas(state.image, nextWidth, nextHeight);
    applyScaledResult(out, beforeImageW, beforeImageH, selectionImageRect);
  } finally {
    state.aiProcessing = false;
    refreshUI();
  }
}

// Re-shape the active crop selection to a target ratio while keeping it visible.
function fitSelectionToAspect(ratio) {
  if (!state.image || !state.drawArea || !ratio || ratio <= 0) {
    return;
  }
  const area = state.drawArea;
  const padding = 12;
  const maxW = Math.max(MIN_SELECTION_SIZE, area.drawW - padding * 2);
  const maxH = Math.max(MIN_SELECTION_SIZE, area.drawH - padding * 2);

  let centerX = area.offsetX + area.drawW / 2;
  let centerY = area.offsetY + area.drawH / 2;
  let baseW = maxW;
  let baseH = maxH;

  if (state.selection) {
    centerX = state.selection.x + state.selection.w / 2;
    centerY = state.selection.y + state.selection.h / 2;
    baseW = Math.min(maxW, state.selection.w);
    baseH = Math.min(maxH, state.selection.h);
  }

  let w = baseW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  if (h < MIN_SELECTION_SIZE) {
    h = MIN_SELECTION_SIZE;
    w = h * ratio;
  }
  if (w < MIN_SELECTION_SIZE) {
    w = MIN_SELECTION_SIZE;
    h = w / ratio;
  }
  if (w > maxW) {
    w = maxW;
    h = w / ratio;
  }
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }

  const minX = area.offsetX;
  const maxX = area.offsetX + area.drawW - w;
  const minY = area.offsetY;
  const maxY = area.offsetY + area.drawH - h;

  const x = clamp(centerX - w / 2, minX, maxX);
  const y = clamp(centerY - h / 2, minY, maxY);
  state.selection = { x, y, w, h };
}

function openCustomRatioDialog() {
  if (!state.image) {
    return;
  }
  ratioErrorText.textContent = "";
  ratioWidthInput.value = "16";
  ratioHeightInput.value = "10";
  ratioModalBackdrop.hidden = false;
  ratioWidthInput.focus();
  ratioWidthInput.select();
}

function closeCustomRatioDialog() {
  ratioModalBackdrop.hidden = true;
  ratioErrorText.textContent = "";
}

function openScaleSwitchDialog(nextMode) {
  state.pendingScaleSwitchMode = nextMode;
  scaleSwitchModalBackdrop.hidden = false;
  scaleSwitchConfirmBtn.focus();
}

function closeScaleSwitchDialog() {
  state.pendingScaleSwitchMode = "";
  scaleSwitchModalBackdrop.hidden = true;
}

function shouldBlockByScaleMode(nextMode) {
  return Boolean(state.image && state.scaleMode && state.scaleMode !== nextMode);
}

function ensureScaleModeAllowed(nextMode) {
  if (!shouldBlockByScaleMode(nextMode)) {
    return true;
  }
  openScaleSwitchDialog(nextMode);
  return false;
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "-";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function getSelectedFormat() {
  const key = (formatSelect?.value || "png").toLowerCase();
  return OUTPUT_FORMATS[key] || OUTPUT_FORMATS.png;
}

function isSizeEstimationUnsupported(format) {
  if (!format || !format.ext) {
    return true;
  }
  const unsupportedExt = new Set(["gif", "bmp", "tiff", "heic", "ico"]);
  return unsupportedExt.has(String(format.ext).toLowerCase());
}


function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x || 1;
}

function ratioTextFromRatio(ratio) {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return "-";
  }
  const base = 1000;
  const w = Math.max(1, Math.round(ratio * base));
  const h = base;
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

function setRatioTarget(ratio, label = "") {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    state.zoomRatioTarget = null;
    state.zoomRatioTargetLabel = "";
    return;
  }
  state.zoomRatioTarget = ratio;
  state.zoomRatioTargetLabel = typeof label === "string" ? label : "";
}

function clearCropInfo() {
  infoSize.textContent = "-";
  infoBytes.textContent = "-";
  infoRatio.textContent = "-";
}

function getCropPixelRect() {
  if (!state.image || !state.selection || !state.drawArea) {
    return null;
  }
  const sw = Math.max(1, Math.floor(state.selection.w / state.drawArea.scale));
  const sh = Math.max(1, Math.floor(state.selection.h / state.drawArea.scale));
  const sx = (state.selection.x - state.drawArea.offsetX) / state.drawArea.scale;
  const sy = (state.selection.y - state.drawArea.offsetY) / state.drawArea.scale;
  return { sx, sy, sw, sh };
}

function captureCurrentImageDataUrl() {
  if (!state.image) {
    return "";
  }
  if (typeof state.image.src === "string" && state.image.src.startsWith("data:image/")) {
    return state.image.src;
  }
  try {
    const out = document.createElement("canvas");
    out.width = state.image.width;
    out.height = state.image.height;
    const outCtx = out.getContext("2d");
    outCtx.drawImage(state.image, 0, 0, out.width, out.height);
    return out.toDataURL("image/png");
  } catch (_) {
    return state.image.src || "";
  }
}

function pushScaleHistory(direction) {
  if (!state.image) {
    return;
  }
  // Save full visual/editor state before scale so opposite action can undo.
  const snapshot = {
    direction,
    imageDataUrl: captureCurrentImageDataUrl(),
    selectionImageRect: getCropPixelRect(),
    referenceImageWidth: state.image.width,
    referenceImageHeight: state.image.height,
    viewState: {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
    },
    aspectRatio: state.aspectRatio,
    ratioKey: state.ratioKey,
    scaleMode: state.scaleMode,
    zoomRatioTarget: state.zoomRatioTarget,
    zoomRatioTargetLabel: state.zoomRatioTargetLabel,
  };
  state.scaleHistory.push(snapshot);
  if (state.scaleHistory.length > 30) {
    state.scaleHistory.shift();
  }
}

function isImageLargerThanOriginal() {
  if (!state.image) {
    return false;
  }
  const originalW = state.originalImageWidth || state.image.width;
  const originalH = state.originalImageHeight || state.image.height;
  return state.image.width > originalW || state.image.height > originalH;
}

function isImageSmallerThanOriginal() {
  if (!state.image) {
    return false;
  }
  const originalW = state.originalImageWidth || state.image.width;
  const originalH = state.originalImageHeight || state.image.height;
  return state.image.width < originalW || state.image.height < originalH;
}

function restoreScaleHistorySnapshot(snapshot) {
  if (!snapshot || !snapshot.imageDataUrl) {
    return;
  }
  // Restore image + crop + view in one pass to make undo feel lossless.
  loadImageFromUrl(snapshot.imageDataUrl, {
    preserveView: false,
    preserveScaleMode: true,
    preserveScaleHistory: true,
    selectionImageRect: snapshot.selectionImageRect,
    referenceImageWidth: snapshot.referenceImageWidth,
    referenceImageHeight: snapshot.referenceImageHeight,
    viewState: snapshot.viewState,
    onLoaded: () => {
      state.aspectRatio = snapshot.aspectRatio ?? null;
      state.ratioKey = snapshot.ratioKey || "";
      state.scaleMode = snapshot.scaleMode || "";
      state.zoomRatioTarget = snapshot.zoomRatioTarget ?? null;
      state.zoomRatioTargetLabel = snapshot.zoomRatioTargetLabel || "";
      refreshUI();
    },
  });
}

function tryUndoScaleFor(direction) {
  if (!state.image || state.scaleHistory.length === 0) {
    return false;
  }
  const last = state.scaleHistory[state.scaleHistory.length - 1];
  if (!last) {
    return false;
  }

  if (direction === "down") {
    // Undo upscale only when image is currently above original bounds.
    if (!isImageLargerThanOriginal() || last.direction !== "up") {
      return false;
    }
  } else if (direction === "up") {
    // Undo downscale only when image is currently below original bounds.
    if (!isImageSmallerThanOriginal() || last.direction !== "down") {
      return false;
    }
  } else {
    return false;
  }

  state.scaleHistory.pop();
  restoreScaleHistorySnapshot(last);
  return true;
}

function buildCroppedCanvas() {
  // Build an offscreen canvas from the currently selected crop rectangle.
  const crop = getCropPixelRect();
  if (!state.image || !crop) {
    return null;
  }
  const out = document.createElement("canvas");
  out.width = crop.sw;
  out.height = crop.sh;
  const outCtx = out.getContext("2d");
  outCtx.drawImage(state.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.width, out.height);
  return out;
}

function getSaveFormatNoticeHidden() {
  try {
    return window.localStorage.getItem(SAVE_FORMAT_NOTICE_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function setSaveFormatNoticeHidden(hidden) {
  try {
    if (hidden) {
      window.localStorage.setItem(SAVE_FORMAT_NOTICE_KEY, "1");
    } else {
      window.localStorage.removeItem(SAVE_FORMAT_NOTICE_KEY);
    }
  } catch (_) {
    // Ignore storage access errors.
  }
}

function closeSaveFormatDialog() {
  saveFormatModalBackdrop.hidden = true;
  state.pendingSaveCanvas = null;
  state.pendingSaveFormat = null;
}

function openSaveFormatDialog(outCanvas, selectedFormat) {
  state.pendingSaveCanvas = outCanvas;
  state.pendingSaveFormat = selectedFormat;
  saveFormatDontShowChk.checked = false;
  saveFormatModalBackdrop.hidden = false;
  saveFormatConfirmBtn.focus();
}

function saveCroppedCanvasWithSelectedFormat(outCanvas, selectedFormat) {
  if (!outCanvas || !selectedFormat) {
    return;
  }
  outCanvas.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cropped-image.${selectedFormat.ext}`;
    link.click();
    URL.revokeObjectURL(url);
  }, selectedFormat.mime, selectedFormat.quality);
}

function openOrUpdatePreviewPopup(imageUrl, imageWidth, imageHeight) {
  const desiredInnerWidth = Math.max(1, Math.round(imageWidth));
  const desiredInnerHeight = Math.max(1, Math.round(imageHeight));
  const maxOuterWidth = Math.max(240, window.screen.availWidth - 16);
  const maxOuterHeight = Math.max(180, window.screen.availHeight - 56);
  const popupWidth = clamp(desiredInnerWidth + 40, 240, maxOuterWidth);
  const popupHeight = clamp(desiredInnerHeight + 120, 180, maxOuterHeight);
  const popupFeatures = [
    "popup=yes",
    `width=${popupWidth}`,
    `height=${popupHeight}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=yes",
  ].join(",");

  let previewWin = state.previewWindow;
  if (!previewWin || previewWin.closed) {
    previewWin = window.open("", "crop-preview-window", popupFeatures);
    state.previewWindow = previewWin;
  }
  if (!previewWin) {
    return;
  }
  try {
    previewWin.resizeTo(popupWidth, popupHeight);
  } catch (_) {
    // Some browsers may block resize; ignore silently.
  }

  // Render a self-contained preview page in the popup so we can update without location navigation.
  previewWin.document.open();
  previewWin.document.write(`<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>미리보기</title>
    <style>
      html, body {
        margin: 0;
        height: 100%;
        background: #0f172a;
        color: #e2e8f0;
        font-family: "Segoe UI", "Noto Sans KR", sans-serif;
      }
      .wrap {
        height: 100%;
        display: grid;
        place-items: center;
        padding: 0;
      }
      img {
        display: block;
        width: auto;
        height: auto;
        max-width: none;
        max-height: none;
      }
      @media (max-width: ${desiredInnerWidth}px), (max-height: ${desiredInnerHeight}px) {
        img {
          max-width: 100%;
          max-height: 100%;
          object-fit: contain;
        }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <img src="${imageUrl}" alt="크롭 미리보기" />
    </div>
    <script>
      (() => {
        const desiredW = ${desiredInnerWidth};
        const desiredH = ${desiredInnerHeight};
        const fitWindowToImage = () => {
          const chromeW = window.outerWidth - window.innerWidth;
          const chromeH = window.outerHeight - window.innerHeight;
          const maxInnerW = Math.max(100, screen.availWidth - chromeW - 12);
          const maxInnerH = Math.max(100, screen.availHeight - chromeH - 12);
          const targetInnerW = Math.min(desiredW, maxInnerW);
          const targetInnerH = Math.min(desiredH, maxInnerH);
          const diffW = targetInnerW - window.innerWidth;
          const diffH = targetInnerH - window.innerHeight;
          if (Math.abs(diffW) > 1 || Math.abs(diffH) > 1) {
            window.resizeBy(diffW, diffH);
          }
        };
        window.addEventListener("load", () => {
          fitWindowToImage();
          setTimeout(fitWindowToImage, 80);
          setTimeout(fitWindowToImage, 220);
        });
      })();
    </script>
  </body>
</html>`);
  previewWin.document.close();
  previewWin.focus();
}

function updateCropInfo() {
  const crop = getCropPixelRect();
  if (!crop) {
    clearCropInfo();
    state.zoomRatioTarget = null;
    state.zoomRatioTargetLabel = "";
    state.infoEstimateToken += 1;
    if (state.infoEstimateTimer) {
      clearTimeout(state.infoEstimateTimer);
      state.infoEstimateTimer = null;
    }
    return;
  }

  infoSize.textContent = `${crop.sw} x ${crop.sh} px`;
  const d = gcd(crop.sw, crop.sh);
  const currentRatioText = `${crop.sw / d}:${crop.sh / d}`;
  if (
    state.zoomRatioTarget &&
    Number.isFinite(state.zoomRatioTarget) &&
    state.zoomRatioTarget > 0
  ) {
    const targetText = state.zoomRatioTargetLabel || ratioTextFromRatio(state.zoomRatioTarget);
    infoRatio.textContent = `현재: ${currentRatioText} (목표: ${targetText})`;
  } else {
    infoRatio.textContent = `현재: ${currentRatioText}`;
  }
  infoBytes.textContent = "계산 중...";
  const selected = getSelectedFormat();
  if (isSizeEstimationUnsupported(selected)) {
    state.infoEstimateToken += 1;
    if (state.infoEstimateTimer) {
      clearTimeout(state.infoEstimateTimer);
      state.infoEstimateTimer = null;
    }
    infoBytes.textContent = "계산 불가";
    return;
  }

  state.infoEstimateToken += 1;
  const token = state.infoEstimateToken;
  if (state.infoEstimateTimer) {
    clearTimeout(state.infoEstimateTimer);
  }

  state.infoEstimateTimer = window.setTimeout(() => {
    const out = document.createElement("canvas");
    out.width = crop.sw;
    out.height = crop.sh;
    const outCtx = out.getContext("2d");
    outCtx.drawImage(state.image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, out.width, out.height);
    out.toBlob((blob) => {
      if (token !== state.infoEstimateToken) {
        return;
      }
      if (blob) {
        infoBytes.textContent = formatBytes(blob.size);
      } else {
        out.toBlob((pngBlob) => {
          if (token !== state.infoEstimateToken) {
            return;
          }
          infoBytes.textContent = pngBlob ? `${formatBytes(pngBlob.size)} (PNG 추정)` : "-";
        }, "image/png");
      }
    }, selected.mime, selected.quality);
  }, 120);
}

function hideContextMenu() {
  cropContextMenu.classList.remove("open");
  cropContextMenu.setAttribute("aria-hidden", "true");
}

function showContextMenu(x, y) {
  const workspaceRect = dropzone.getBoundingClientRect();
  const menuRect = cropContextMenu.getBoundingClientRect();
  const left = clamp(x - workspaceRect.left, 0, workspaceRect.width - menuRect.width - 6);
  const top = clamp(y - workspaceRect.top, 0, workspaceRect.height - menuRect.height - 6);
  cropContextMenu.style.left = `${left}px`;
  cropContextMenu.style.top = `${top}px`;
  cropContextMenu.classList.add("open");
  cropContextMenu.setAttribute("aria-hidden", "false");
}

function switchToFreeRatioByManualEdit() {
  if (!state.image) {
    return;
  }
  if (state.ratioKey !== "custom" || state.aspectRatio !== null) {
    state.ratioKey = "custom";
    state.aspectRatio = null;
    updateButtonState();
  }
}

function applyAspectRatio(start, current) {
  if (!state.aspectRatio || state.aspectRatio <= 0) {
    return current;
  }
  const ratio = state.aspectRatio;
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const signX = dx >= 0 ? 1 : -1;
  const signY = dy >= 0 ? 1 : -1;
  let absW = Math.abs(dx);
  let absH = Math.abs(dy);

  if (absW === 0 && absH === 0) {
    return current;
  }

  if (absH === 0 || absW / absH > ratio) {
    absH = absW / ratio;
  } else {
    absW = absH * ratio;
  }

  return {
    x: start.x + signX * absW,
    y: start.y + signY * absH,
  };
}

function getInteractionAspectRatio(event) {
  if (event.shiftKey) {
    if (state.aspectRatio && state.aspectRatio > 0) {
      return state.aspectRatio;
    }
    if (state.pointer.startSelection && state.pointer.startSelection.h > 0) {
      return state.pointer.startSelection.w / state.pointer.startSelection.h;
    }
    if (state.selection && state.selection.h > 0) {
      return state.selection.w / state.selection.h;
    }
    return 1;
  }
  return state.aspectRatio;
}

function defaultSelectionFromDrawArea() {
  if (!state.drawArea) {
    return null;
  }
  const marginX = state.drawArea.drawW * 0.12;
  const marginY = state.drawArea.drawH * 0.12;
  return {
    x: state.drawArea.offsetX + marginX,
    y: state.drawArea.offsetY + marginY,
    w: state.drawArea.drawW - marginX * 2,
    h: state.drawArea.drawH - marginY * 2,
  };
}

function drawImageWithSelection() {
  if (!state.image) {
    drawPlaceholder();
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = state.zoom;
  const drawW = state.image.width * scale;
  const drawH = state.image.height * scale;

  if (drawW <= canvas.width) {
    state.panX = 0;
  } else {
    const maxPanX = (drawW - canvas.width) / 2;
    state.panX = clamp(state.panX, -maxPanX, maxPanX);
  }
  if (drawH <= canvas.height) {
    state.panY = 0;
  } else {
    const maxPanY = (drawH - canvas.height) / 2;
    state.panY = clamp(state.panY, -maxPanY, maxPanY);
  }

  const offsetX = (canvas.width - drawW) / 2 + state.panX;
  const offsetY = (canvas.height - drawH) / 2 + state.panY;
  state.drawArea = { offsetX, offsetY, drawW, drawH, scale };

  ctx.drawImage(state.image, offsetX, offsetY, drawW, drawH);

  if (!state.selection) {
    state.selection = defaultSelectionFromDrawArea();
  }

  if (state.selection) {
    const selection = rectWithinDrawArea(state.selection);
    state.selection = selection;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.2)";
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, drawW, drawH);
    ctx.rect(selection.x, selection.y, selection.w, selection.h);
    ctx.fill("evenodd");
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = "#0369a1";
    ctx.lineWidth = 2;
    ctx.strokeRect(selection.x, selection.y, selection.w, selection.h);
    ctx.restore();

    drawHandles(selection);
  }
}

function zoomAtPoint(zoomFactor, canvasPoint) {
  if (!state.image || !state.drawArea) {
    return;
  }
  const previousSelectionRatio = state.selection && state.selection.h > 0
    ? state.selection.w / state.selection.h
    : null;
  const prevZoom = state.zoom;
  const nextZoom = clamp(prevZoom * zoomFactor, 0.2, 8);
  if (nextZoom === prevZoom) {
    return;
  }

  const imageX = (canvasPoint.x - state.drawArea.offsetX) / state.drawArea.scale;
  const imageY = (canvasPoint.y - state.drawArea.offsetY) / state.drawArea.scale;

  state.zoom = nextZoom;

  const newScale = state.zoom;
  const newDrawW = state.image.width * newScale;
  const newDrawH = state.image.height * newScale;
  const centerOffsetX = (canvas.width - newDrawW) / 2;
  const centerOffsetY = (canvas.height - newDrawH) / 2;

  state.panX = canvasPoint.x - imageX * newScale - centerOffsetX;
  state.panY = canvasPoint.y - imageY * newScale - centerOffsetY;

  // Preserve selected target ratio; if absent, use pre-zoom ratio as fallback target.
  if (
    !state.zoomRatioTarget &&
    previousSelectionRatio &&
    Number.isFinite(previousSelectionRatio) &&
    previousSelectionRatio > 0
  ) {
    state.zoomRatioTarget = previousSelectionRatio;
    state.zoomRatioTargetLabel = ratioTextFromRatio(previousSelectionRatio);
  }

  refreshUI();
  if (state.selection && previousSelectionRatio && Number.isFinite(previousSelectionRatio) && previousSelectionRatio > 0 && state.drawArea) {
    const currentRatio = state.selection.h > 0 ? state.selection.w / state.selection.h : null;
    if (!currentRatio || !Number.isFinite(currentRatio) || currentRatio <= 0) {
      return;
    }
    // Only fix when ratio actually drifted from previous ratio.
    if (Math.abs(currentRatio - previousSelectionRatio) <= 0.0005) {
      return;
    }

    // Refit both width and height (balanced) so ratio matches previous one.
    const currentW = state.selection.w;
    const currentH = state.selection.h;
    const currentArea = Math.max(1, currentW * currentH);
    let nextW = Math.sqrt(currentArea * previousSelectionRatio);
    let nextH = Math.sqrt(currentArea / previousSelectionRatio);

    const fitScale = Math.min(
      1,
      state.drawArea.drawW / nextW,
      state.drawArea.drawH / nextH
    );
    nextW *= fitScale;
    nextH *= fitScale;

    const centerX = state.selection.x + currentW / 2;
    const centerY = state.selection.y + currentH / 2;
    const maxX = state.drawArea.offsetX + state.drawArea.drawW - nextW;
    const maxY = state.drawArea.offsetY + state.drawArea.drawH - nextH;
    const nextX = clamp(centerX - nextW / 2, state.drawArea.offsetX, Math.max(state.drawArea.offsetX, maxX));
    const nextY = clamp(centerY - nextH / 2, state.drawArea.offsetY, Math.max(state.drawArea.offsetY, maxY));

    state.selection = { x: nextX, y: nextY, w: nextW, h: nextH };
    refreshUI();
  }
  updateCropInfo();
}

function loadImageFromUrl(url, options = {}) {
  const {
    preserveSelection = false,
    preserveView = false,
    preserveScaleMode = false,
    preserveScaleHistory = false,
    selectionImageRect = null,
    referenceImageWidth = 0,
    referenceImageHeight = 0,
    viewState = null,
    onLoaded = null,
  } = options;
  const prevSelection = preserveSelection && state.selection ? { ...state.selection } : null;
  const prevZoom = state.zoom;
  const prevPanX = state.panX;
  const prevPanY = state.panY;

  const img = new Image();
  img.onload = () => {
    state.image = img;
    if (!preserveScaleMode) {
      state.scaleMode = "";
    }
    if (!preserveScaleHistory) {
      state.scaleHistory = [];
    }
    if (viewState && Number.isFinite(viewState.zoom)) {
      state.zoom = viewState.zoom;
      state.panX = Number.isFinite(viewState.panX) ? viewState.panX : 0;
      state.panY = Number.isFinite(viewState.panY) ? viewState.panY : 0;
    } else {
      state.zoom = preserveView ? prevZoom : 1;
      state.panX = preserveView ? prevPanX : 0;
      state.panY = preserveView ? prevPanY : 0;
    }
    if (!state.originalDataUrl || state.originalImageWidth <= 0 || state.originalImageHeight <= 0) {
      state.originalDataUrl = url;
      state.originalImageWidth = img.width;
      state.originalImageHeight = img.height;
    }
    state.selection = prevSelection;
    refreshUI();

    // Rebuild selection from image-space coordinates (used by upscale) so
    // position/ratio follows the new image dimensions.
    if (
      selectionImageRect &&
      state.drawArea &&
      referenceImageWidth > 0 &&
      referenceImageHeight > 0
    ) {
      const ratioX = state.image.width / referenceImageWidth;
      const ratioY = state.image.height / referenceImageHeight;
      const sx = selectionImageRect.sx * ratioX;
      const sy = selectionImageRect.sy * ratioY;
      const sw = selectionImageRect.sw * ratioX;
      const sh = selectionImageRect.sh * ratioY;

      state.selection = {
        x: state.drawArea.offsetX + sx * state.drawArea.scale,
        y: state.drawArea.offsetY + sy * state.drawArea.scale,
        w: Math.max(1, sw * state.drawArea.scale),
        h: Math.max(1, sh * state.drawArea.scale),
      };
      refreshUI();
    }
    if (typeof onLoaded === "function") {
      onLoaded();
    }
  };
  img.src = url;
}

function loadFile(file) {
  if (!file) {
    return;
  }
  if (!file.type.startsWith("image/")) {
    window.alert("이미지 파일이 아닙니다.");
    fileInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const url = reader.result;
    state.originalDataUrl = url;
    loadImageFromUrl(url);
  };
  reader.readAsDataURL(file);
}

function clearWorkspace() {
  state.image = null;
  state.originalDataUrl = "";
  state.originalImageWidth = 0;
  state.originalImageHeight = 0;
  state.scaleMode = "";
  state.pendingScaleSwitchMode = "";
  state.selection = null;
  state.drawArea = null;
  state.zoom = 1;
  state.panX = 0;
  state.panY = 0;
  state.aspectRatio = null;
  state.ratioKey = "";
  state.pointer.active = false;
  state.pointer.mode = "";
  state.pointer.handle = "";
  state.pointer.startPoint = null;
  state.pointer.startSelection = null;
  state.pointer.lastPoint = null;
  state.pointer.moved = false;
  state.pointer.startPanX = 0;
  state.pointer.startPanY = 0;
  state.zoomRatioTarget = null;
  state.zoomRatioTargetLabel = "";
  state.scaleHistory = [];
  state.infoEstimateToken += 1;
  if (state.infoEstimateTimer) {
    clearTimeout(state.infoEstimateTimer);
    state.infoEstimateTimer = null;
  }
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = "";
  }
  // Allow selecting the same file again after reset.
  fileInput.value = "";
  canvas.style.cursor = "default";
  closeCustomRatioDialog();
  closeScaleSwitchDialog();
  closeSaveFormatDialog();
  hideContextMenu();
  drawPlaceholder();
  updateButtonState();
}

function moveSelection(baseRect, dx, dy) {
  if (!state.drawArea) {
    return baseRect;
  }
  const minX = state.drawArea.offsetX;
  const maxX = state.drawArea.offsetX + state.drawArea.drawW - baseRect.w;
  const minY = state.drawArea.offsetY;
  const maxY = state.drawArea.offsetY + state.drawArea.drawH - baseRect.h;
  return {
    x: clamp(baseRect.x + dx, minX, maxX),
    y: clamp(baseRect.y + dy, minY, maxY),
    w: baseRect.w,
    h: baseRect.h,
  };
}

function resizeSelectionByHandle(baseRect, handle, dx, dy, aspectRatio) {
  if (aspectRatio && aspectRatio > 0) {
    let rect = null;
    const cx = baseRect.x + baseRect.w / 2;
    const cy = baseRect.y + baseRect.h / 2;

    if (handle === "nw" || handle === "ne" || handle === "sw" || handle === "se") {
      let anchor = null;
      let moving = null;

      if (handle === "nw") {
        anchor = { x: baseRect.x + baseRect.w, y: baseRect.y + baseRect.h };
        moving = { x: baseRect.x + dx, y: baseRect.y + dy };
      } else if (handle === "ne") {
        anchor = { x: baseRect.x, y: baseRect.y + baseRect.h };
        moving = { x: baseRect.x + baseRect.w + dx, y: baseRect.y + dy };
      } else if (handle === "sw") {
        anchor = { x: baseRect.x + baseRect.w, y: baseRect.y };
        moving = { x: baseRect.x + dx, y: baseRect.y + baseRect.h + dy };
      } else {
        anchor = { x: baseRect.x, y: baseRect.y };
        moving = { x: baseRect.x + baseRect.w + dx, y: baseRect.y + baseRect.h + dy };
      }

      const prevRatio = state.aspectRatio;
      state.aspectRatio = aspectRatio;
      const adjusted = applyAspectRatio(anchor, moving);
      state.aspectRatio = prevRatio;
      rect = normalizeRect(anchor, adjusted);
    } else if (handle === "n" || handle === "s") {
      const fixedY = handle === "n" ? baseRect.y + baseRect.h : baseRect.y;
      const movingY = handle === "n" ? baseRect.y + dy : baseRect.y + baseRect.h + dy;
      const h = Math.max(MIN_SELECTION_SIZE, Math.abs(fixedY - movingY));
      const w = Math.max(MIN_SELECTION_SIZE, h * aspectRatio);
      const top = handle === "n" ? fixedY - h : fixedY;
      rect = { x: cx - w / 2, y: top, w, h };
    } else if (handle === "e" || handle === "w") {
      const fixedX = handle === "w" ? baseRect.x + baseRect.w : baseRect.x;
      const movingX = handle === "w" ? baseRect.x + dx : baseRect.x + baseRect.w + dx;
      const w = Math.max(MIN_SELECTION_SIZE, Math.abs(fixedX - movingX));
      const h = Math.max(MIN_SELECTION_SIZE, w / aspectRatio);
      const left = handle === "w" ? fixedX - w : fixedX;
      rect = { x: left, y: cy - h / 2, w, h };
    }

    if (rect && state.drawArea) {
      rect = rectWithinDrawArea(rect);
      if (rect.w < MIN_SELECTION_SIZE || rect.h < MIN_SELECTION_SIZE) {
        return baseRect;
      }
      return rect;
    }
  }

  let left = baseRect.x;
  let top = baseRect.y;
  let right = baseRect.x + baseRect.w;
  let bottom = baseRect.y + baseRect.h;

  if (handle.includes("w")) {
    left += dx;
  }
  if (handle.includes("e")) {
    right += dx;
  }
  if (handle.includes("n")) {
    top += dy;
  }
  if (handle.includes("s")) {
    bottom += dy;
  }

  const minW = MIN_SELECTION_SIZE;
  const minH = MIN_SELECTION_SIZE;

  if (right - left < minW) {
    if (handle.includes("w")) {
      left = right - minW;
    } else {
      right = left + minW;
    }
  }
  if (bottom - top < minH) {
    if (handle.includes("n")) {
      top = bottom - minH;
    } else {
      bottom = top + minH;
    }
  }

  if (state.drawArea) {
    const minX = state.drawArea.offsetX;
    const maxX = state.drawArea.offsetX + state.drawArea.drawW;
    const minY = state.drawArea.offsetY;
    const maxY = state.drawArea.offsetY + state.drawArea.drawH;

    left = clamp(left, minX, maxX - minW);
    right = clamp(right, minX + minW, maxX);
    top = clamp(top, minY, maxY - minH);
    bottom = clamp(bottom, minY + minH, maxY);
  }

  return {
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  };
}

function setCursorForPoint(point) {
  if (!state.selection) {
    canvas.style.cursor = "crosshair";
    return;
  }
  const handle = detectHandle(point, state.selection);
  if (handle) {
    canvas.style.cursor = CURSOR_BY_HANDLE[handle.name];
    return;
  }
  if (pointInRect(point, state.selection)) {
    canvas.style.cursor = "move";
    return;
  }
  if (pointInDrawArea(point)) {
    canvas.style.cursor = "grab";
    return;
  }
  canvas.style.cursor = "default";
}

fileInput.addEventListener("change", (event) => {
  const [file] = event.target.files || [];
  loadFile(file);
});

dropzone.addEventListener("click", () => {
  hideContextMenu();
});

uploadTrigger.addEventListener("click", () => {
  if (state.image) {
    return;
  }
  hideContextMenu();
  fileInput.click();
});

ratioGroup.addEventListener("click", (event) => {
  const button = event.target.closest(".ratio-btn");
  if (!button || button.disabled) {
    return;
  }
  const ratioKey = button.dataset.ratio || "";

  if (ratioKey === "custom") {
    openCustomRatioDialog();
  } else {
    const [wRaw, hRaw] = ratioKey.split(":");
    const w = Number(wRaw);
    const h = Number(hRaw);
    state.aspectRatio = w / h;
    state.ratioKey = ratioKey;
    setRatioTarget(state.aspectRatio, ratioKey);
    fitSelectionToAspect(state.aspectRatio);
    refreshUI();
  }
});

ratioApplyBtn.addEventListener("click", () => {
  const widthRaw = ratioWidthInput.value.trim();
  const heightRaw = ratioHeightInput.value.trim();
  const w = Number(widthRaw);
  const h = Number(heightRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    ratioErrorText.textContent = "가로/세로는 1 이상의 숫자로 입력하세요.";
    return;
  }
  state.aspectRatio = w / h;
  state.ratioKey = "custom";
  setRatioTarget(state.aspectRatio, `${widthRaw}:${heightRaw}`);
  fitSelectionToAspect(state.aspectRatio);
  closeCustomRatioDialog();
  refreshUI();
});

ratioCancelBtn.addEventListener("click", () => {
  closeCustomRatioDialog();
});

ratioModalBackdrop.addEventListener("click", (event) => {
  if (event.target === ratioModalBackdrop) {
    closeCustomRatioDialog();
  }
});

scaleSwitchConfirmBtn.addEventListener("click", () => {
  closeScaleSwitchDialog();
  if (state.originalDataUrl) {
    loadImageFromUrl(state.originalDataUrl);
  } else {
    clearWorkspace();
  }
});

scaleSwitchCancelBtn.addEventListener("click", () => {
  closeScaleSwitchDialog();
});

scaleSwitchModalBackdrop.addEventListener("click", (event) => {
  if (event.target === scaleSwitchModalBackdrop) {
    closeScaleSwitchDialog();
  }
});

saveFormatConfirmBtn.addEventListener("click", () => {
  const outCanvas = state.pendingSaveCanvas;
  const selectedFormat = state.pendingSaveFormat;
  if (saveFormatDontShowChk.checked) {
    setSaveFormatNoticeHidden(true);
  }
  closeSaveFormatDialog();
  saveCroppedCanvasWithSelectedFormat(outCanvas, selectedFormat);
});

saveFormatCancelBtn.addEventListener("click", () => {
  closeSaveFormatDialog();
});

saveFormatModalBackdrop.addEventListener("click", (event) => {
  if (event.target === saveFormatModalBackdrop) {
    closeSaveFormatDialog();
  }
});

window.addEventListener("keydown", (event) => {
  if (!saveFormatModalBackdrop.hidden) {
    if (event.key === "Escape") {
      closeSaveFormatDialog();
    } else if (event.key === "Enter") {
      saveFormatConfirmBtn.click();
    }
    return;
  }

  if (!scaleSwitchModalBackdrop.hidden) {
    if (event.key === "Escape") {
      closeScaleSwitchDialog();
    } else if (event.key === "Enter") {
      scaleSwitchConfirmBtn.click();
    }
    return;
  }

  if (ratioModalBackdrop.hidden) {
    return;
  }
  if (event.key === "Escape") {
    closeCustomRatioDialog();
  } else if (event.key === "Enter") {
    ratioApplyBtn.click();
  }
});

formatSelect.addEventListener("change", () => {
  updateCropInfo();
});

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropzone.classList.add("drag-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (eventName === "drop") {
      const [file] = event.dataTransfer.files || [];
      loadFile(file);
    }
    dropzone.classList.remove("drag-over");
  });
});

canvas.addEventListener("pointerdown", (event) => {
  // Right button inside selection: gesture zoom mode (no new crop creation).
  hideContextMenu();
  if (event.button === 2) {
    if (!state.image || !state.selection) {
      return;
    }
    const point = getCanvasPoint(event.clientX, event.clientY);
    if (!pointInRect(point, state.selection)) {
      return;
    }
    canvas.setPointerCapture(event.pointerId);
    state.pointer.active = true;
    state.pointer.mode = "rmbZoom";
    state.pointer.startPoint = point;
    state.pointer.lastPoint = point;
    state.pointer.startSelection = { ...state.selection };
    state.pointer.moved = false;
    event.preventDefault();
    return;
  }

  if (event.button !== 0) {
    return;
  }
  if (!state.image) {
    return;
  }
  const point = getCanvasPoint(event.clientX, event.clientY);
  if (!pointInDrawArea(point)) {
    return;
  }

  canvas.setPointerCapture(event.pointerId);
  state.pointer.active = true;
  state.pointer.startPoint = point;
  state.pointer.startSelection = state.selection ? { ...state.selection } : null;
  state.pointer.lastPoint = point;
  state.pointer.moved = false;
  state.pointer.startPanX = state.panX;
  state.pointer.startPanY = state.panY;
  state.pointer.handle = "";
  state.pointer.mode = "new";

  if (state.selection) {
    // Interaction priority: resize handle -> move selection -> pan image.
    const handle = detectHandle(point, state.selection);
    if (handle) {
      state.pointer.mode = "resize";
      state.pointer.handle = handle.name;
      return;
    }
    if (pointInRect(point, state.selection)) {
      state.pointer.mode = "move";
      return;
    }
    state.pointer.mode = "panImage";
    canvas.style.cursor = "grabbing";
    return;
  }

  state.selection = { x: point.x, y: point.y, w: 0, h: 0 };
  refreshUI();
});

canvas.addEventListener("pointermove", (event) => {
  const point = getCanvasPoint(event.clientX, event.clientY);

  if (!state.pointer.active) {
    setCursorForPoint(point);
    return;
  }

  if (!state.pointer.startPoint) {
    return;
  }

  if (state.pointer.mode === "new") {
    // New selection drag; ratio lock can come from preset or Shift modifier.
    const interactionRatio = getInteractionAspectRatio(event);
    const prevRatio = state.aspectRatio;
    state.aspectRatio = interactionRatio;
    const adjusted = applyAspectRatio(state.pointer.startPoint, point);
    state.aspectRatio = prevRatio;
    const rect = rectWithinDrawArea(normalizeRect(state.pointer.startPoint, adjusted));
    state.selection = rect;
  } else if (state.pointer.mode === "move" && state.pointer.startSelection) {
    const dx = point.x - state.pointer.startPoint.x;
    const dy = point.y - state.pointer.startPoint.y;
    state.selection = moveSelection(state.pointer.startSelection, dx, dy);
  } else if (state.pointer.mode === "resize" && state.pointer.startSelection) {
    if (!event.shiftKey) {
      switchToFreeRatioByManualEdit();
    }
    const dx = point.x - state.pointer.startPoint.x;
    const dy = point.y - state.pointer.startPoint.y;
    const interactionRatio = getInteractionAspectRatio(event);
    state.selection = resizeSelectionByHandle(
      state.pointer.startSelection,
      state.pointer.handle,
      dx,
      dy,
      interactionRatio
    );
  } else if (state.pointer.mode === "panImage") {
    const dx = point.x - state.pointer.startPoint.x;
    const dy = point.y - state.pointer.startPoint.y;
    state.panX = state.pointer.startPanX + dx;
    state.panY = state.pointer.startPanY + dy;
    refreshUI();
    return;
  } else if (state.pointer.mode === "rmbZoom" && state.pointer.lastPoint && state.selection) {
    const dx = point.x - state.pointer.lastPoint.x;
    const dy = point.y - state.pointer.lastPoint.y;
    const influence = dx - dy;
    if (Math.abs(influence) >= 1) {
      const strength = Math.min(0.35, Math.abs(influence) * 0.01);
      const factor = influence > 0 ? 1 + strength : 1 / (1 + strength);
      const center = {
        x: state.selection.x + state.selection.w / 2,
        y: state.selection.y + state.selection.h / 2,
      };
      zoomAtPoint(factor, center);
      state.pointer.moved = true;
      state.suppressContextMenuOnce = true;
    }
    state.pointer.lastPoint = point;
    return;
  }

  refreshUI();
});

function endPointerInteraction() {
  const point = state.pointer.lastPoint;
  state.pointer.active = false;
  state.pointer.mode = "";
  state.pointer.handle = "";
  state.pointer.startPoint = null;
  state.pointer.startSelection = null;
  state.pointer.lastPoint = null;
  state.pointer.moved = false;
  state.pointer.startPanX = 0;
  state.pointer.startPanY = 0;
  if (point) {
    setCursorForPoint(point);
  }
}

canvas.addEventListener("pointerup", endPointerInteraction);
canvas.addEventListener("pointercancel", endPointerInteraction);

canvas.addEventListener(
  "wheel",
  (event) => {
    hideContextMenu();
    if (!state.image) {
      return;
    }
    event.preventDefault();
    const zoomFactor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    const point = getCanvasPoint(event.clientX, event.clientY);
    zoomAtPoint(zoomFactor, point);
  },
  { passive: false }
);

canvas.addEventListener("contextmenu", (event) => {
  if (state.suppressContextMenuOnce) {
    state.suppressContextMenuOnce = false;
    event.preventDefault();
    hideContextMenu();
    return;
  }
  if (!state.image || !state.selection) {
    return;
  }
  const point = getCanvasPoint(event.clientX, event.clientY);
  if (!pointInRect(point, state.selection)) {
    if (pointInDrawArea(point)) {
      event.preventDefault();
    }
    hideContextMenu();
    return;
  }
  event.preventDefault();
  showContextMenu(event.clientX, event.clientY);
});

document.addEventListener("pointerdown", (event) => {
  if (!cropContextMenu.classList.contains("open")) {
    return;
  }
  if (!cropContextMenu.contains(event.target)) {
    hideContextMenu();
  }
});

cropBtn.addEventListener("click", () => {
  const out = buildCroppedCanvas();
  if (!out) {
    return;
  }
  const selected = getSelectedFormat();
  if (getSaveFormatNoticeHidden()) {
    saveCroppedCanvasWithSelectedFormat(out, selected);
    return;
  }
  openSaveFormatDialog(out, selected);
});

previewBtn.addEventListener("click", () => {
  // Reuse existing preview window when possible to avoid opening many tabs.
  const out = buildCroppedCanvas();
  if (!out) {
    return;
  }
  out.toBlob((blob) => {
    if (!blob) {
      return;
    }
    if (state.previewObjectUrl) {
      URL.revokeObjectURL(state.previewObjectUrl);
      state.previewObjectUrl = "";
    }
    const url = URL.createObjectURL(blob);
    state.previewObjectUrl = url;
    openOrUpdatePreviewPopup(url, out.width, out.height);
  }, "image/png");
});

function runNormalUpscale() {
  if (!state.image) {
    return;
  }
  if (!ensureScaleModeAllowed("normal")) {
    return;
  }
  if (tryUndoScaleFor("up")) {
    return;
  }
  if (isUpscaleBlockedBySize()) {
    return;
  }
  pushScaleHistory("up");
  const beforeImageW = state.image.width;
  const beforeImageH = state.image.height;
  const selectionImageRect = getCropPixelRect();
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.floor(state.image.width * 2));
  out.height = Math.max(1, Math.floor(state.image.height * 2));
  const outCtx = out.getContext("2d");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(state.image, 0, 0, out.width, out.height);
  state.scaleMode = "normal";
  const upscaledUrl = out.toDataURL("image/png");
  loadImageFromUrl(upscaledUrl, {
    preserveView: true,
    preserveScaleMode: true,
    preserveScaleHistory: true,
    selectionImageRect,
    referenceImageWidth: beforeImageW,
    referenceImageHeight: beforeImageH,
  });
}

optionUpscaleBtn.addEventListener("click", () => {
  runNormalUpscale();
});

optionAiUpscaleBtn.addEventListener("click", () => {
  runAiUpscale();
});

function runNormalDownscale() {
  if (!state.image) {
    return;
  }
  if (!ensureScaleModeAllowed("normal")) {
    return;
  }
  if (tryUndoScaleFor("down")) {
    return;
  }
  if (isDownscaleBlockedBySize()) {
    return;
  }
  const limits = getDownscaleLimits();
  if (!limits) {
    return;
  }
  const { minWidth, minHeight } = limits;

  const nextWidth = Math.floor(state.image.width / 2);
  const nextHeight = Math.floor(state.image.height / 2);

  // Safety guard: button should already be disabled in this state.
  if (nextWidth < minWidth || nextHeight < minHeight) {
    return;
  }

  pushScaleHistory("down");
  const beforeImageW = state.image.width;
  const beforeImageH = state.image.height;
  const selectionImageRect = getCropPixelRect();
  const out = document.createElement("canvas");
  out.width = Math.max(1, nextWidth);
  out.height = Math.max(1, nextHeight);
  const outCtx = out.getContext("2d");
  outCtx.imageSmoothingEnabled = true;
  outCtx.imageSmoothingQuality = "high";
  outCtx.drawImage(state.image, 0, 0, out.width, out.height);
  state.scaleMode = "normal";
  const downscaledUrl = out.toDataURL("image/png");
  loadImageFromUrl(downscaledUrl, {
    preserveView: true,
    preserveScaleMode: true,
    preserveScaleHistory: true,
    selectionImageRect,
    referenceImageWidth: beforeImageW,
    referenceImageHeight: beforeImageH,
  });
}

optionDownscaleBtn.addEventListener("click", () => {
  runNormalDownscale();
});

optionAiDownscaleBtn.addEventListener("click", () => {
  runAiDownscale();
});

restoreBtn.addEventListener("click", () => {
  if (!state.originalDataUrl) {
    return;
  }
  loadImageFromUrl(state.originalDataUrl);
});

function beginResize(startEvent) {
  if (window.matchMedia("(max-width: 900px)").matches) {
    return;
  }
  startEvent.preventDefault();

  state.resizing = true;
  document.body.classList.add("is-resizing");
  const startX = startEvent.clientX;
  const startWidth = sidebar.getBoundingClientRect().width;

  function onMove(moveEvent) {
    if (!state.resizing) {
      return;
    }
    applySidebarWidth(startWidth + (moveEvent.clientX - startX));
    setCanvasSize();
    drawImageWithSelection();
  }

  function onUp() {
    state.resizing = false;
    document.body.classList.remove("is-resizing");
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  }

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}

resizer.addEventListener("mousedown", beginResize);

resizer.addEventListener("keydown", (event) => {
  if (!["ArrowLeft", "ArrowRight"].includes(event.key)) {
    return;
  }
  event.preventDefault();
  const width = sidebar.getBoundingClientRect().width;
  const delta = event.key === "ArrowLeft" ? -10 : 10;
  applySidebarWidth(width + delta);
  setCanvasSize();
  drawImageWithSelection();
});

window.addEventListener("resize", () => {
  applySidebarWidth(sidebar.getBoundingClientRect().width);
  setCanvasSize();
  drawImageWithSelection();
});

applySidebarWidth(sidebar.getBoundingClientRect().width);
setCanvasSize();
drawPlaceholder();
updateButtonState();
