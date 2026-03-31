const app = document.getElementById("app");
const sidebar = document.getElementById("sidebar");
const resizer = document.getElementById("resizer");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const cropBtn = document.getElementById("cropBtn");
const resetBtn = document.getElementById("resetBtn");
const previewBtn = document.getElementById("previewBtn");
const ratioGroup = document.getElementById("ratioGroup");
const ratioButtons = Array.from(document.querySelectorAll(".ratio-btn"));
const ratioModalBackdrop = document.getElementById("ratioModalBackdrop");
const ratioWidthInput = document.getElementById("ratioWidthInput");
const ratioHeightInput = document.getElementById("ratioHeightInput");
const ratioApplyBtn = document.getElementById("ratioApplyBtn");
const ratioCancelBtn = document.getElementById("ratioCancelBtn");
const ratioErrorText = document.getElementById("ratioErrorText");
const formatSelect = document.getElementById("formatSelect");
const infoSize = document.getElementById("infoSize");
const infoBytes = document.getElementById("infoBytes");
const infoRatio = document.getElementById("infoRatio");
const canvas = document.getElementById("canvas");
const cropContextMenu = document.getElementById("cropContextMenu");
const ctx = canvas.getContext("2d");

const MIN_SELECTION_SIZE = 20;
const HANDLE_SIZE = 10;
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

const state = {
  image: null,
  originalDataUrl: "",
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
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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
  ctx.fillStyle = "#5d6c7c";
  ctx.font = "16px Segoe UI";
  ctx.fillText("이미지를 드래그 앤 드롭하거나 화면을 클릭해 업로드하세요", 24, 36);
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
  const validSelection = Boolean(state.selection && state.selection.w > 3 && state.selection.h > 3);
  cropBtn.disabled = !(hasImage && validSelection);
  previewBtn.disabled = !(hasImage && validSelection);
  resetBtn.disabled = !hasImage;
  formatSelect.disabled = !hasImage;
  ratioButtons.forEach((button) => {
    button.disabled = !hasImage;
  });
  updateRatioButtonState();
  updateCropInfo();
}

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

function buildCroppedCanvas() {
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

function updateCropInfo() {
  const crop = getCropPixelRect();
  if (!crop) {
    clearCropInfo();
    state.infoEstimateToken += 1;
    if (state.infoEstimateTimer) {
      clearTimeout(state.infoEstimateTimer);
      state.infoEstimateTimer = null;
    }
    return;
  }

  infoSize.textContent = `${crop.sw} x ${crop.sh} px`;
  const d = gcd(crop.sw, crop.sh);
  infoRatio.textContent = `${crop.sw / d}:${crop.sh / d}`;
  infoBytes.textContent = "계산 중...";
  const selected = getSelectedFormat();

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

  const fitScale = Math.min(canvas.width / state.image.width, canvas.height / state.image.height);
  const scale = fitScale * state.zoom;
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
  const prevZoom = state.zoom;
  const nextZoom = clamp(prevZoom * zoomFactor, 0.2, 8);
  if (nextZoom === prevZoom) {
    return;
  }

  const imageX = (canvasPoint.x - state.drawArea.offsetX) / state.drawArea.scale;
  const imageY = (canvasPoint.y - state.drawArea.offsetY) / state.drawArea.scale;

  state.zoom = nextZoom;

  const fitScale = Math.min(canvas.width / state.image.width, canvas.height / state.image.height);
  const newScale = fitScale * state.zoom;
  const newDrawW = state.image.width * newScale;
  const newDrawH = state.image.height * newScale;
  const centerOffsetX = (canvas.width - newDrawW) / 2;
  const centerOffsetY = (canvas.height - newDrawH) / 2;

  state.panX = canvasPoint.x - imageX * newScale - centerOffsetX;
  state.panY = canvasPoint.y - imageY * newScale - centerOffsetY;

  drawImageWithSelection();
  updateButtonState();
}

function loadImageFromUrl(url) {
  const img = new Image();
  img.onload = () => {
    state.image = img;
    state.zoom = 1;
    state.panX = 0;
    state.panY = 0;
    if (!state.originalDataUrl) {
      state.originalDataUrl = url;
    }
    state.selection = null;
    drawImageWithSelection();
    updateButtonState();
  };
  img.src = url;
}

function loadFile(file) {
  if (!file || !file.type.startsWith("image/")) {
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
  state.infoEstimateToken += 1;
  if (state.infoEstimateTimer) {
    clearTimeout(state.infoEstimateTimer);
    state.infoEstimateTimer = null;
  }
  if (state.previewObjectUrl) {
    URL.revokeObjectURL(state.previewObjectUrl);
    state.previewObjectUrl = "";
  }
  canvas.style.cursor = "default";
  closeCustomRatioDialog();
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
  if (!state.image) {
    fileInput.click();
  }
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
    fitSelectionToAspect(state.aspectRatio);
    drawImageWithSelection();
    updateButtonState();
  }
});

ratioApplyBtn.addEventListener("click", () => {
  const w = Number(ratioWidthInput.value);
  const h = Number(ratioHeightInput.value);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) {
    ratioErrorText.textContent = "가로/세로는 1 이상의 숫자로 입력하세요.";
    return;
  }
  state.aspectRatio = w / h;
  state.ratioKey = "custom";
  fitSelectionToAspect(state.aspectRatio);
  closeCustomRatioDialog();
  drawImageWithSelection();
  updateButtonState();
});

ratioCancelBtn.addEventListener("click", () => {
  closeCustomRatioDialog();
});

ratioModalBackdrop.addEventListener("click", (event) => {
  if (event.target === ratioModalBackdrop) {
    closeCustomRatioDialog();
  }
});

window.addEventListener("keydown", (event) => {
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
  drawImageWithSelection();
  updateButtonState();
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
    drawImageWithSelection();
    updateButtonState();
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

  drawImageWithSelection();
  updateButtonState();
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
  out.toBlob((blob) => {
    if (!blob) {
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cropped-image.${selected.ext}`;
    link.click();
    URL.revokeObjectURL(url);
  }, selected.mime, selected.quality);
});

previewBtn.addEventListener("click", () => {
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

    let previewWin = state.previewWindow;
    if (!previewWin || previewWin.closed) {
      previewWin = window.open("", "crop-preview-window", "noopener,noreferrer");
      state.previewWindow = previewWin;
    }
    if (!previewWin) {
      return;
    }
    previewWin.location.href = url;
    previewWin.focus();
  }, "image/png");
});

resetBtn.addEventListener("click", () => {
  if (!state.image) {
    return;
  }
  clearWorkspace();
});

function beginResize(startEvent) {
  if (window.matchMedia("(max-width: 900px)").matches) {
    return;
  }

  state.resizing = true;
  const startX = startEvent.clientX;
  const startWidth = sidebar.getBoundingClientRect().width;

  function onMove(moveEvent) {
    if (!state.resizing) {
      return;
    }
    const next = clamp(startWidth + (moveEvent.clientX - startX), 180, 420);
    app.style.setProperty("--sidebar-width", `${next}px`);
    setCanvasSize();
    drawImageWithSelection();
  }

  function onUp() {
    state.resizing = false;
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
  const next = clamp(width + delta, 180, 420);
  app.style.setProperty("--sidebar-width", `${next}px`);
  setCanvasSize();
  drawImageWithSelection();
});

window.addEventListener("resize", () => {
  setCanvasSize();
  drawImageWithSelection();
});

setCanvasSize();
drawPlaceholder();
updateButtonState();
