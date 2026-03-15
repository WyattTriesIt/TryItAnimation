const canvas = document.getElementById("canvas");
canvas.style.touchAction = "none";
const ctx = canvas.getContext("2d");
const timeline = document.getElementById("timeline");
const frameMenu = document.getElementById("frameMenu");
const projModal = document.getElementById("projectModal");
const createProjectBtn = document.getElementById("createProject");
const projWInput = document.getElementById("projW");
const projHInput = document.getElementById("projH");
const projFPSInput = document.getElementById("projFPS");
const timelineLengthInput = document.getElementById("timelineLength");
const app = document.getElementById("app");
const OBJECT_SURFACE_SIZE = 512;
// =======================
// Tools
// =======================
let currentTool = "brush";
let brushSize = 4;
let brushColor = "#000000";
let eraserSize = 10;
let shapeType = "line";
let shapeColor = "#000000";
let shapeThickness = 3;
let fillColor = "#ff0000";
let selectedObject = null;
let selectionBox = null;
let multiSelection = [];
let isSelecting = false;
let transformDragging = false;
let transformOffset = { x: 0, y: 0 };
let groupTransformStart = null;
let rotationStartAngle = 0;
let rotationStartObjectRotation = 0;
let lastEraserPos = null;

// =======================
// Timeline / State
// =======================
let frames = [];
let objectFrames = []; 
let layers = ["Layer 1"];
let currentFrame = 0;
let activeLayer = 0;
let timelineFPS = 24;
let playing = false;
let playInterval = null;
let onionEnabled = false;
let onionBack = 3;
let onionForward = 0;
let realFrames = []; // [frame][layer] => boolean

let drawing = false;
let startPos = { x: 0, y: 0 };
let currentMousePos = { x: 0, y: 0 };

// =======================
// Project Creation
// =======================
createProjectBtn.onclick = () => {
  canvas.width = +projWInput.value;
  canvas.height = +projHInput.value;
  timelineFPS = +projFPSInput.value;

frames = [];
realFrames = [];
objectFrames = [];
const defaultFrames = 10;
for (let i = 0; i < defaultFrames; i++) {
    frames.push(layers.map(() => ctx.createImageData(canvas.width, canvas.height)));
    realFrames.push(layers.map(() => false));
    objectFrames.push(layers.map(() => []));
}
currentFrame = 0;
activeLayer = 0;

// Example predefined object
objectFrames[0][0].push({
    type: "rect",
    width: 100,
    height: 80,
    transform: { x: 200, y: 150, rotation: 0, scaleX: 1, scaleY: 1 },
    style: { fill: "red", opacity: 1 }
});

  // Show main app and hide modal
  app.hidden = false;
  projModal.hidden = true;
  projModal.style.display = "none";

  renderLayers();
  renderTimeline();
  refreshCanvas();
  renderShapePreviews();
};
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = "high";

function getCanvasPos(e) {
  const rect = canvas.getBoundingClientRect();

  let clientX = null;
  let clientY = null;

  // Touch events
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  }
  // Touchend fallback
  else if (e.changedTouches && e.changedTouches.length > 0) {
    clientX = e.changedTouches[0].clientX;
    clientY = e.changedTouches[0].clientY;
  }
  // Mouse
  else if (typeof e.clientX === "number") {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  // If still invalid, abort safely
  if (clientX === null || clientY === null) {
    return { x: currentMousePos.x, y: currentMousePos.y };
  }

  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

canvas.addEventListener("touchmove", e => {
    if (e.touches.length > 1) e.preventDefault(); // block pinch zoom
}, { passive: false });

// =======================
// Tool Selection
// =======================
document.querySelectorAll(".tool").forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll(".tool").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    currentTool = btn.dataset.tool;
    toggleToolProperties();
  };
});

function toggleToolProperties() {
  document.getElementById("shapeProperties").style.display = currentTool === "shape" ? "block" : "none";
  document.getElementById("fillColorContainer").style.display = currentTool === "fill" ? "block" : "none";
}
function getObjectAtPosition(x, y) {
    for (let l = layers.length - 1; l >= 0; l--) {
        const objects = objectFrames[currentFrame][l];
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (!obj) continue;
            const box = getObjectBoundingBox(obj);
            if (!box) continue;

            let localX = x;
            let localY = y;
            if (obj.transform) {
                const t = obj.transform;
                localX -= t.x ?? 0;
                localY -= t.y ?? 0;
                const sin = Math.sin(-(t.rotation ?? 0));
                const cos = Math.cos(-(t.rotation ?? 0));
                const lx = localX * cos - localY * sin;
                const ly = localX * sin + localY * cos;
                localX = lx / (t.scaleX ?? 1);
                localY = ly / (t.scaleY ?? 1);
            }

            const padding = obj.type === "brush" ? (obj.style?.width ?? 4) / 2 : 0;
            const left = box.x - box.width / 2 - padding;
            const right = box.x + box.width / 2 + padding;
            const top = box.y - box.height / 2 - padding;
            const bottom = box.y + box.height / 2 + padding;

            if (localX >= left && localX <= right && localY >= top && localY <= bottom) {
                activeLayer = l; // auto-switch to clicked layer
                renderLayers();
                renderTimeline();
                return obj;
            }
        }
    }
    return null;
}
// =======================
// Layers
// =======================
const layersList = document.getElementById("layersList");

function renderLayers() {
  layersList.innerHTML = "";
  layers.forEach((name, i) => {
    const div = document.createElement("div");
    div.className = "layer-item" + (i === activeLayer ? " active" : "");
    div.textContent = name;
    div.onclick = () => {
      activeLayer = i;
      renderLayers();
      renderTimeline();
      refreshCanvas();
    };
    layersList.appendChild(div);
  });
}

document.getElementById("addLayer").onclick = () => {
  layers.push(`Layer ${layers.length + 1}`);
  frames.forEach(f => f.push(ctx.createImageData(canvas.width, canvas.height)));
  realFrames.forEach(r => r.push(false));
  objectFrames.forEach(o => o.push([]));
  activeLayer = layers.length - 1;

  renderLayers();
  renderTimeline();
  refreshCanvas();
};

// =======================
// Timeline Rendering
// =======================
function renderTimeline() {
  timeline.innerHTML = "";
  layers.forEach((_, layerIdx) => {
    const row = document.createElement("div");
    row.className = "timeline-row";

    frames.forEach((frame, frameIdx) => {
      const f = document.createElement("div");
      f.className = "frame";
      f.dataset.index = frameIdx;
      f.dataset.layer = layerIdx;
      f.style.background = realFrames[frameIdx][layerIdx] ? "#fff" : "#777";
      if (frameIdx === currentFrame && layerIdx === activeLayer) f.classList.add("active");
f.onmousedown = frameMouseDown;
f.ontouchstart = frameMouseDown;
f.oncontextmenu = frameRightClick;
      row.appendChild(f);
    });

    timeline.appendChild(row);
  });
}
timelineLengthInput.onchange = () => {
  let newLength = Math.max(1, Math.floor(+timelineLengthInput.value));
  const currentLength = frames.length;

  if (newLength > currentLength) {
    // Add new frames
    for (let i = currentLength; i < newLength; i++) {
      frames.push(layers.map(() => ctx.createImageData(canvas.width, canvas.height)));
      realFrames.push(layers.map(() => false));
      objectFrames.push(layers.map(() => []));
    }
  } else if (newLength < currentLength) {
    // Remove extra frames
    frames.length = newLength;
    realFrames.length = newLength;
    objectFrames.length = newLength;

    if (currentFrame >= newLength) {
      currentFrame = newLength - 1;
    }
  }

  renderTimeline();
  refreshCanvas();
};

// =======================
// Frame Interaction
// =======================
function frameMouseDown(e) {
  currentFrame = +e.currentTarget.dataset.index;
  activeLayer = +e.currentTarget.dataset.layer;

  renderLayers();
  renderTimeline();
  refreshCanvas();
}

function frameRightClick(e) {
  e.preventDefault();
  currentFrame = +e.target.dataset.index;
  activeLayer = +e.target.dataset.layer;
  renderLayers();
  renderTimeline();
  refreshCanvas();

  frameMenu.style.display = "block";
  frameMenu.style.left = e.pageX + "px";
  frameMenu.style.top = e.pageY + "px";
}

document.addEventListener("click", () => frameMenu.style.display = "none");

frameMenu.querySelectorAll("div").forEach(item => {
  item.onclick = () => {
    if (item.dataset.action === "blank") overwriteFrameBlank();
    if (item.dataset.action === "duplicate") overwriteFrameDuplicate();
    if (item.dataset.action === "delete") deleteFrame();
    renderTimeline();
    refreshCanvas();
    frameMenu.style.display = "none";
  };
});

// =======================
// Frame Helpers
// =======================
function makeKeyframeAt(frame, layer, sourceImg = null) {
  const img = ctx.createImageData(canvas.width, canvas.height);
  if (sourceImg) img.data.set(sourceImg.data);
  frames[frame][layer] = img;
  realFrames[frame][layer] = true;
}

function overwriteFrameBlank() {

    // Make this frame a real keyframe
    realFrames[currentFrame][activeLayer] = true;

    // Clear objects on this frame
    objectFrames[currentFrame][activeLayer] = [];

    // Propagate blank forward until next real keyframe
    for (let i = currentFrame + 1; i < objectFrames.length; i++) {
        if (realFrames[i][activeLayer]) break;
        objectFrames[i][activeLayer] = [];
    }
}

function overwriteFrameDuplicate() {
    const srcFrame = findPreviousReal(currentFrame, activeLayer);
    if (srcFrame < 0) return;

    const srcObjects = objectFrames[srcFrame][activeLayer];

    const cloned = srcObjects.map(obj => cloneObjectWithSurface(obj));

    objectFrames[currentFrame][activeLayer] = cloned;
    realFrames[currentFrame][activeLayer] = true;

    propagateObjectsFrom(currentFrame, activeLayer);
}

function propagateObjectsFrom(startFrame, layer) {
    const src = objectFrames[startFrame][layer];

    for (let i = startFrame + 1; i < objectFrames.length; i++) {
        if (realFrames[i][layer]) break;

        const cloned = src.map(obj => cloneObjectWithSurface(obj));

        objectFrames[i][layer] = cloned;
    }
}

function deleteFrame() {
  if (!realFrames[currentFrame][activeLayer]) return;
  objectFrames[currentFrame][activeLayer] = [];
  realFrames[currentFrame][activeLayer] = false;

  const prev = findPreviousReal(currentFrame, activeLayer);
  if (prev >= 0) {
    for (let i = currentFrame; i < objectFrames.length; i++) {
      if (realFrames[i][activeLayer]) break;
      objectFrames[i][activeLayer] =
    objectFrames[prev][activeLayer].map(obj =>
        cloneObjectWithSurface(obj)
    );
    }
  }
}

// =======================
// Utilities
// =======================
function findPreviousReal(frame, layer) {
  for (let i = frame - 1; i >= 0; i--) if (realFrames[i][layer]) return i;
  return -1;
}

function getExposedFrame(frame, layer) {
  for (let i = frame; i >= 0; i--) if (realFrames[i][layer]) return frames[i][layer];
  return null;
}

function isImageDataEmpty(img) {
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] !== 0) return false;
  return true;
}

function getExposedObjectFrame(frame, layer) {
  for (let i = frame; i >= 0; i--) {
    if (realFrames[i][layer]) {
      return objectFrames[i][layer];
    }
  }
  return [];
}

function cloneObjectWithSurface(obj) {

    const cloned = JSON.parse(JSON.stringify(obj));

    // SHARE the same surface instead of duplicating it
    cloned.surface = obj.surface;
    cloned.surfaceCtx = obj.surfaceCtx;

    return cloned;
}

function ensureFramePopulated(frame, layer) {
    if (realFrames[frame][layer]) return;

    const prev = findPreviousReal(frame, layer);
    if (prev < 0) return;

    const cloned = JSON.parse(
        JSON.stringify(objectFrames[prev][layer])
    );

    cloned.forEach(obj => {
        initObjectSurface(obj);
    });

    objectFrames[frame][layer] = cloned;
}

function getObjectBoundingBox(obj) {
    if (!obj) return null;

    if (obj.surface) {
        const box = getSurfaceBoundingBox(obj);
        if (box) return box;
        return null;
    }

    return null;
}
function getObjectsInSelectionBox(box) {

  const selected = [];

  const left = Math.min(box.x1, box.x2);
  const right = Math.max(box.x1, box.x2);
  const top = Math.min(box.y1, box.y2);
  const bottom = Math.max(box.y1, box.y2);

  for (let l = 0; l < layers.length; l++) {

    const objs = getExposedObjectFrame(currentFrame, l);

    objs.forEach(obj => {

      const b = getObjectBoundingBox(obj);
      if (!b) return;

      const t = obj.transform ?? {x:0,y:0};

      const cx = t.x + b.x;
      const cy = t.y + b.y;

      if (
        cx >= left &&
        cx <= right &&
        cy >= top &&
        cy <= bottom
      ) {
        selected.push(obj);
      }

    });

  }

  return selected;

}

function getMultiSelectionBounds() {

  if (!multiSelection.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  multiSelection.forEach(obj => {

    const box = getObjectBoundingBox(obj);
    if (!box) return;

    const t = obj.transform ?? {x:0,y:0,scaleX:1,scaleY:1};

    const width = box.width * (t.scaleX ?? 1);
    const height = box.height * (t.scaleY ?? 1);

    const cx = t.x + box.x * (t.scaleX ?? 1);
    const cy = t.y + box.y * (t.scaleY ?? 1);

    const left = cx - width/2;
    const right = cx + width/2;
    const top = cy - height/2;
    const bottom = cy + height/2;

    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
    if (top < minY) minY = top;
    if (bottom > maxY) maxY = bottom;

  });

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
    width: maxX - minX,
    height: maxY - minY
  };

}
// =======================
// Timeline Toolbar
// =======================
document.getElementById("addBlank").onmousedown = e => { e.preventDefault(); overwriteFrameBlank(); renderTimeline(); refreshCanvas(); };
document.getElementById("addDuplicate").onmousedown = e => { e.preventDefault(); overwriteFrameDuplicate(); renderTimeline(); refreshCanvas(); };
document.getElementById("deleteFrame").onmousedown = e => { e.preventDefault(); deleteFrame(); renderTimeline(); refreshCanvas(); };
const playBtn = document.getElementById("playTimeline");

playBtn.addEventListener("click", toggleTimeline, { passive: false });
playBtn.addEventListener("touchend", toggleTimeline, { passive: false });

function toggleTimeline(e){
  e.preventDefault();
  if(playing){
    stopTimeline();
    playBtn.textContent = "▶ Play";
  } else {
    playTimeline();
    playBtn.textContent = "⏹ Stop";
  }
}

// =======================
// Onion Skin Controls
// =======================
document.getElementById("onionToggle").onchange = e => {
  onionEnabled = e.target.checked;
  document.getElementById("onionOptions").style.display = onionEnabled ? "inline-block" : "none";
  refreshCanvas();
};
document.getElementById("onionBack").oninput = e => { onionBack = +e.target.value; refreshCanvas(); };
document.getElementById("onionForward").oninput = e => { onionForward = +e.target.value; refreshCanvas(); };

function drawOnionObjects(frameIndex, baseAlpha, tint = null) {
    for (let l = 0; l < layers.length; l++) {
        const objs = getExposedObjectFrame(frameIndex, l);
        objs.forEach(obj => {
            if (!obj.surface) return;
            const t = obj.transform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };

            ctx.save();
            ctx.translate(t.x ?? 0, t.y ?? 0);
            ctx.rotate(t.rotation ?? 0);
            ctx.scale(t.scaleX ?? 1, t.scaleY ?? 1);

            if (tint) {
                // Draw tinted version
                const off = document.createElement("canvas");
                off.width = obj.surface.width;
                off.height = obj.surface.height;
                const offCtx = off.getContext("2d");
                offCtx.drawImage(obj.surface, 0, 0);
                offCtx.globalCompositeOperation = "source-in";
                offCtx.fillStyle = tint;
                offCtx.globalAlpha = baseAlpha;
                offCtx.fillRect(0, 0, off.width, off.height);
                ctx.drawImage(off, -obj.surface.width / 2, -obj.surface.height / 2);
            } else {
                ctx.globalAlpha = (obj.style?.opacity ?? 1) * baseAlpha;
                ctx.drawImage(obj.surface, -obj.surface.width / 2, -obj.surface.height / 2);
            }

            ctx.restore();
        });
    }
}

// =======================
// Draw only actual frame layers (no onion skin)
// =======================
function drawCurrentFrameOnly() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let l = 0; l < layers.length; l++) {
    const img = getExposedFrame(currentFrame, l);
    if (img && !isImageDataEmpty(img)) ctx.putImageData(img, 0, 0);
  }
}

// =======================
// Refresh Canvas
// =======================
function refreshCanvas() {

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw all objects for current frame
  drawObjectLayer();
  drawSelectionRectangle();
if (previewObject) {
  drawPreviewObject(previewObject);
}
  // Draw onion skins
  if (onionEnabled) {

      // Previous frames (blue)
      for (let i = 1; i <= onionBack; i++) {
          const frameIndex = currentFrame - i;
          if (frameIndex < 0) break;
          const alpha = 0.4 * (1 - i / (onionBack + 1));
          drawOnionObjects(frameIndex, alpha, "rgb(0,110,255)");
      }

      // Next frames (green)
      for (let i = 1; i <= onionForward; i++) {
          const frameIndex = currentFrame + i;
          if (frameIndex >= frames.length) break;
          const alpha = 0.4 * (1 - i / (onionForward + 1));
          drawOnionObjects(frameIndex, alpha, "rgb(0,255,0)");
      }
  }
}

let pendingRefresh = false;
function requestRefresh() {
    if (pendingRefresh) return;
    pendingRefresh = true;
    requestAnimationFrame(() => {
        refreshCanvas();
        pendingRefresh = false;
    });
}
// =======================
// Save Frame
// =======================
function saveFrame() {
  realFrames[currentFrame][activeLayer] = true;
  propagateObjectsFrom(currentFrame, activeLayer);
}

// =======================
// Drawing — Object-Based
// =======================
let brushPoints = [];
let previewObject = null;

function handlePointerDown(e) {
startPos = getCanvasPos(e);
  currentMousePos = { ...startPos };
  drawing = true;

if (!realFrames[currentFrame][activeLayer]) {
    realFrames[currentFrame][activeLayer] = true;
    ensureFramePopulated(currentFrame, activeLayer); // 🔹 ensure object surface exists
}

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

// --- Fill Tool ---
if (currentTool === "fill") {

    const fillObj = floodFillObject(startPos, fillColor);

if (fillObj) {
    // Do NOT call initObjectSurface for fill objects
    objectFrames[currentFrame][activeLayer].push(fillObj);

    saveFrame();
    requestRefresh();
}

    drawing = false;
    return;
}

  // --- Transform Tool ---
  if (currentTool === "transform") {

  const mouseX = startPos.x;
  const mouseY = startPos.y;

  // FIRST: if something already selected, check its handles
  if (selectedObject) {
    const handle = getHandleUnderMouse(selectedObject, mouseX, mouseY);
    if (handle) {
      transformAction = handle.type;
if (handle.type === "resize") {

  activeHandle = handle.corner;

const bounds = getMultiSelectionBounds();

groupTransformStart = {
  bounds,
  objects: multiSelection.map(obj => {
    const t = obj.transform;

    return {
      obj,
      startX: t.x,
      startY: t.y,
      offsetX: t.x - bounds.x,
      offsetY: t.y - bounds.y,
      rotation: t.rotation,
      scaleX: t.scaleX,
      scaleY: t.scaleY
    };
  })
};

}

if (handle.type === "rotate") {

  const bounds = getMultiSelectionBounds();

  const dx = startPos.x - bounds.x;
  const dy = startPos.y - bounds.y;

  rotationStartAngle = Math.atan2(dy, dx);

groupTransformStart = {
  bounds,
  objects: multiSelection.map(obj => {

    const t = obj.transform ?? {x:0,y:0,rotation:0,scaleX:1,scaleY:1};
    const box = getObjectBoundingBox(obj);

    const cx = t.x + box.x * (t.scaleX ?? 1);
    const cy = t.y + box.y * (t.scaleY ?? 1);

    return {
      obj,
      offsetX: cx - bounds.x,
      offsetY: cy - bounds.y,
      rotation: t.rotation ?? 0
    };

  })
};

}

      transformDragging = true;
      return; // 🔥 DO NOT reselect
    }
  }

  // Otherwise check if clicking object body
  const clickedObject = getObjectAtPosition(mouseX, mouseY);

  if (clickedObject) {
    selectedObject = clickedObject;

    if (!selectedObject.transform) {
      const box = getObjectBoundingBox(selectedObject);
      selectedObject.transform = {
        x: box.x,
        y: box.y,
        rotation: 0,
        scaleX: 1,
        scaleY: 1
      };
    }

transformAction = "move";
activeHandle = null;

multiSelection = multiSelection.length ? multiSelection : [selectedObject];

multiSelection.forEach(o => {
  o.startX = o.transform.x;
  o.startY = o.transform.y;
});

transformDragging = true;
} 

else {

  // start box selection
  isSelecting = true;

  selectionBox = {
    x1: mouseX,
    y1: mouseY,
    x2: mouseX,
    y2: mouseY
  };

  multiSelection = [];
  selectedObject = null;

}
}

  // --- Brush Tool ---
  if (currentTool === "brush") {
    brushPoints = [{ ...startPos }];
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = "source-over";
    ctx.beginPath();
    ctx.moveTo(startPos.x, startPos.y);
  }
// --- Eraser Tool ---
if (currentTool === "eraser") {
    drawing = true;
    brushPoints = [];
    lastEraserPos = null; // reset at start
  }
};

function handlePointerMove(e) {

  currentMousePos = getCanvasPos(e);
if (isSelecting && selectionBox) {
  selectionBox.x2 = currentMousePos.x;
  selectionBox.y2 = currentMousePos.y;

  requestRefresh();
  return;
}

  // --- Transform Dragging ---
  if (currentTool === "transform" && transformDragging && selectedObject) {
    const t = selectedObject.transform;
    const mouseX = currentMousePos.x;
    const mouseY = currentMousePos.y;

if (transformAction === "move") {

  const dx = mouseX - startPos.x;
  const dy = mouseY - startPos.y;

  multiSelection.forEach(o => {
    o.transform.x = o.startX + dx;
    o.transform.y = o.startY + dy;
  });

}

else if (transformAction === "rotate") {
  const bounds = groupTransformStart.bounds;
  const dx = currentMousePos.x - bounds.x;
  const dy = currentMousePos.y - bounds.y;
  const currentAngle = Math.atan2(dy, dx);
  const delta = currentAngle - rotationStartAngle;

  groupTransformStart.objects.forEach(o => {
    const obj = o.obj;
    const cos = Math.cos(delta);
    const sin = Math.sin(delta);

const rx = o.offsetX * cos - o.offsetY * sin;
const ry = o.offsetX * sin + o.offsetY * cos;

obj.transform.x = bounds.x + rx;
obj.transform.y = bounds.y + ry;

    obj.transform.rotation = o.rotation + delta;
  });

  requestRefresh();
}

else if (transformAction === "resize") {

  const bounds = groupTransformStart.bounds;

  const dx = currentMousePos.x - bounds.x;
  const dy = currentMousePos.y - bounds.y;

  const startDX = startPos.x - bounds.x;
  const startDY = startPos.y - bounds.y;

  const scaleX = Math.max(0.05, dx / startDX);
  const scaleY = Math.max(0.05, dy / startDY);

  groupTransformStart.objects.forEach(o => {

    const obj = o.obj;

    obj.transform.x = bounds.x + o.offsetX * scaleX;
    obj.transform.y = bounds.y + o.offsetY * scaleY;

    obj.transform.scaleX = o.scaleX * scaleX;
    obj.transform.scaleY = o.scaleY * scaleY;

  });

}

requestRefresh()

// replace all `refreshCanvas()` calls inside mousemove with `requestRefresh()`
    return;
}

  if (!drawing) return;

// --- Shape Preview ---
if (currentTool === "shape") {
    previewObject = {
        type: shapeType,
        start: { x: startPos.x, y: startPos.y },
        end: { x: currentMousePos.x, y: currentMousePos.y },
        transform: { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 },
        style: { color: shapeColor, thickness: shapeThickness, opacity: 1 }
    };

    requestRefresh();
}

  // --- Brush Preview ---
if (currentTool === "brush") {
    brushPoints.push({ ...currentMousePos });

    // Don't recreate previewObject each move
    if (!previewObject) {
        previewObject = {
            type: "brush",
            points: brushPoints,
            transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 },
            style: { color: brushColor, width: brushSize, opacity: 1 }
        };
    }

    // Draw live directly on the main canvas
    ctx.save();
    ctx.strokeStyle = brushColor;
    ctx.lineWidth = brushSize;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Draw the last segment only for performance
    const len = brushPoints.length;
    if (len >= 2) {
        ctx.beginPath();
        ctx.moveTo(brushPoints[len - 2].x, brushPoints[len - 2].y);
        ctx.lineTo(brushPoints[len - 1].x, brushPoints[len - 1].y);
        ctx.stroke();
    }
    ctx.restore();
}

  // --- Eraser Preview & Action ---
if (currentTool === "eraser") {

  if (lastEraserPos) {
    const dx = currentMousePos.x - lastEraserPos.x;
    const dy = currentMousePos.y - lastEraserPos.y;
    const dist = Math.hypot(dx, dy);

    const step = Math.max(4, eraserSize / 2);
    const steps = Math.ceil(dist / step);

    for (let i = 0; i <= steps; i++) {
      const ex = lastEraserPos.x + (dx * i / steps);
      const ey = lastEraserPos.y + (dy * i / steps);
      eraseWithCircle(ex, ey, eraserSize);
    }

  } else {
    eraseWithCircle(currentMousePos.x, currentMousePos.y, eraserSize);
  }

  lastEraserPos = { ...currentMousePos };
  requestRefresh();
 }
};

function handlePointerUp(e) {

if (currentTool === "transform" && transformDragging) {

    transformDragging = false;
    transformAction = null;
    activeHandle = null;
    saveFrame();
    return;
}
if (isSelecting) {

multiSelection = getObjectsInSelectionBox(selectionBox);

if (multiSelection.length > 0) {
  selectedObject = multiSelection[0];
} else {
  selectedObject = null;
}

  isSelecting = false;
  selectionBox = null;

  requestRefresh();
  return;

}
  if (!drawing) return;

  let obj = null;

  // --- Brush Commit ---
  if (currentTool === "brush" && brushPoints.length) {

    const xs = brushPoints.map(p => p.x);
    const ys = brushPoints.map(p => p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const width = maxX - minX;
    const height = maxY - minY;

    const centerX = minX + width / 2;
    const centerY = minY + height / 2;

    const relativePoints = brushPoints.map(p => ({
        x: p.x - centerX,
        y: p.y - centerY
    }));

    obj = {
        type: "brush",
        points: relativePoints,
        width,
        height,
        transform: { x: centerX, y: centerY, rotation: 0, scaleX: 1, scaleY: 1 },
        style: { color: brushColor, width: brushSize, opacity: 1 }
    };
}

  // --- Shape Commit ---
  if (currentTool === "shape") {

    const cx = (startPos.x + currentMousePos.x) / 2;
    const cy = (startPos.y + currentMousePos.y) / 2;

    obj = {
      type: shapeType,
      start: { x: startPos.x - cx, y: startPos.y - cy },
      end: { x: currentMousePos.x - cx, y: currentMousePos.y - cy },
      transform: { x: cx, y: cy, rotation: 0, scaleX: 1, scaleY: 1 },
      style: { color: shapeColor, thickness: shapeThickness, opacity: 1 }
    };
  }

  if (obj) {
    initObjectSurface(obj);
    objectFrames[currentFrame][activeLayer].push(obj);
  }

  drawing = false;
  brushPoints = [];
  lastEraserPos = null;

if (currentTool === "eraser") {

    const objs = getExposedObjectFrame(currentFrame, activeLayer);

    for (let i = objs.length - 1; i >= 0; i--) {
        const obj = objs[i];
        if (!obj.surface) continue;

        const box = getSurfaceBoundingBox(obj);

        if (!box) {
            objs.splice(i, 1);

            if (selectedObject === obj) {
                selectedObject = null;
                transformAction = null;
                activeHandle = null;
            }
        }
    }
}
  previewObject = null; 
  requestRefresh(); // 🔹 ensures canvas redraw after finishing
  refreshCanvas();
  saveFrame();
};

canvas.addEventListener("pointerdown", e => {
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);

  const pos = getCanvasPos(e);
  startPos = pos;
  currentMousePos = { ...pos };

  drawing = true;

  handlePointerDown(e);   // call your existing mousedown logic
});

canvas.addEventListener("pointermove", e => {
  if (!drawing && !transformDragging) return;

  e.preventDefault();

  currentMousePos = getCanvasPos(e);
  handlePointerMove(e);   // call your existing mousemove logic
});

canvas.addEventListener("pointerup", e => {
  e.preventDefault();

  canvas.releasePointerCapture(e.pointerId);

  handlePointerUp(e);     // call your existing mouseup logic

  drawing = false;
  transformDragging = false;
});

canvas.addEventListener("pointercancel", e => {

  if (drawing || transformDragging) {
    handlePointerUp(e);
  }

  drawing = false;
  transformDragging = false;

});

// =======================
// Pixel Helpers
// =======================
function getPixel(img,x,y){ const i=(y*img.width+x)*4,d=img.data; return {r:d[i],g:d[i+1],b:d[i+2],a:d[i+3]}; }
function setPixel(data,x,y,c){ const i=(y*canvas.width+x)*4; data[i]=c.r; data[i+1]=c.g; data[i+2]=c.b; data[i+3]=255; }
function pixelMatch(a,b){ return a.r===b.r && a.g===b.g && a.b===b.b && a.a===b.a; }
function hexToRgba(hex){ hex=hex.replace("#",""); return {r:parseInt(hex.slice(0,2),16),g:parseInt(hex.slice(2,4),16),b:parseInt(hex.slice(4,6),16),a:255}; }

// =======================
// Flood Fill — Object-Based
// =======================
function floodFillObject(start, color) {

  refreshCanvas();

  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const startX = Math.floor(start.x);
  const startY = Math.floor(start.y);

  const target = getPixel(img, startX, startY);
  const fill = hexToRgba(color);

  if (pixelMatch(target, fill)) return null;

  const visited = new Uint8Array(canvas.width * canvas.height);
  const stack = [{ x: startX, y: startY }];

  let minX = canvas.width, minY = canvas.height;
  let maxX = 0, maxY = 0;

  const TOLERANCE = 6;

  function pixelClose(a, b) {
    return (
      Math.abs(a.r - b.r) <= TOLERANCE &&
      Math.abs(a.g - b.g) <= TOLERANCE &&
      Math.abs(a.b - b.b) <= TOLERANCE &&
      Math.abs(a.a - b.a) <= TOLERANCE
    );
  }

  const mask = new Uint8Array(canvas.width * canvas.height);

  while (stack.length) {

    const { x, y } = stack.pop();

    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) continue;

    const idx = y * canvas.width + x;
    if (visited[idx]) continue;

    const pixel = getPixel(img, x, y);
    if (!pixelClose(pixel, target)) continue;

    visited[idx] = 1;
    mask[idx] = 1;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;

    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  if (maxX < minX || maxY < minY) return null;

const expanded = new Uint8Array(mask);

for (let y = minY; y <= maxY; y++) {
  for (let x = minX; x <= maxX; x++) {

    const idx = y * canvas.width + x;
    if (!mask[idx]) continue;

    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {

        const nx = x + ox;
        const ny = y + oy;

        if (
          nx < 0 || ny < 0 ||
          nx >= canvas.width || ny >= canvas.height
        ) continue;

        const nIdx = ny * canvas.width + nx;

        if (mask[nIdx]) continue;

        const pixel = getPixel(img, nx, ny);

        // Only expand into semi-transparent pixels (anti-alias edge)
        if (pixel.a > 0 && pixel.a < 200) {
          expanded[nIdx] = 1;
        }
      }
    }
  }
}

mask.set(expanded);

mask.set(expanded);
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const surface = document.createElement("canvas");
  surface.width = width;
  surface.height = height;

  const sctx = surface.getContext("2d");
  const imgData = sctx.createImageData(width, height);
  const data = imgData.data;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {

      const idx = y * canvas.width + x;
      if (!mask[idx]) continue;

      const lx = x - minX;
      const ly = y - minY;

      const i = (ly * width + lx) * 4;

      data[i] = fill.r;
      data[i + 1] = fill.g;
      data[i + 2] = fill.b;
      data[i + 3] = 255;
    }
  }

  sctx.putImageData(imgData, 0, 0);

  return {
    type: "fill",
    surface,
    surfaceCtx: sctx,
    width,
    height,
    transform: {
      x: minX + width / 2,
      y: minY + height / 2,
      rotation: 0,
      scaleX: 1,
      scaleY: 1
    },
    style: { opacity: 1 }
  };
}

// =======================
// Tool Properties
// =======================
document.getElementById("brushSize").oninput = e => brushSize = +e.target.value;
document.getElementById("brushColor").oninput = e => brushColor = e.target.value;
document.getElementById("eraserSize").oninput = e => eraserSize = +e.target.value;
document.getElementById("shapeColor").oninput = e => { shapeColor = e.target.value; renderShapePreviews(); };
document.getElementById("shapeThickness").oninput = e => { shapeThickness = +e.target.value; renderShapePreviews(); };
document.getElementById("fillColor").oninput = e => fillColor = e.target.value;
document.getElementById("timelineFPS").oninput = e => { timelineFPS = +e.target.value; if(playing){ stopTimeline(); playTimeline(); } };

// =======================
// Shape Previews
// =======================
function renderShapePreviews() {
  document.querySelectorAll(".shape-option").forEach(div=>{
    const c=div.querySelector("canvas"), cx=c.getContext("2d"), shape=div.dataset.shape;
    cx.clearRect(0,0,c.width,c.height); cx.strokeStyle=shapeColor; cx.lineWidth=3;
    if(shape==="line"){cx.beginPath();cx.moveTo(4,c.height-4);cx.lineTo(c.width-4,4);cx.stroke();}
    else if(shape==="rect") cx.strokeRect(4,4,c.width-8,c.height-8);
    else if(shape==="circle"){cx.beginPath();cx.ellipse(c.width/2,c.height/2,(c.width-8)/2,(c.height-8)/2,0,0,Math.PI*2);cx.stroke();}
  });
  document.querySelectorAll(".shape-option").forEach(div=>{
    div.onclick = () => {
      document.querySelectorAll(".shape-option").forEach(d => d.classList.remove("active"));
      div.classList.add("active");
      shapeType = div.dataset.shape;
    };
  });
}

// =======================
// Timeline Playback
// =======================
let lastTime = 0;

function playTimeline() {
  if (playing) return;
  playing = true;
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(time) {
  if (!playing) return;

  const delta = time - lastTime;
  const frameDuration = 1000 / timelineFPS;

  if (delta >= frameDuration) {
    currentFrame = (currentFrame + 1) % frames.length;
    refreshCanvas();
    renderTimeline();
    lastTime = time;
  }

  requestAnimationFrame(loop);
}

function stopTimeline() {
  playing = false;
}

// =======================
// COMMITTED SURFACE SYSTEM
// =======================

function drawObjectOnContext(obj, ctx2) {
  ctx2.save();

  ctx2.globalAlpha = obj.style?.opacity ?? obj.opacity ?? 1;

  switch (obj.type) {

    case "brush":
      if (!obj.points?.length) break;
      ctx2.strokeStyle = obj.style?.color ?? "#000";
      ctx2.lineWidth = obj.style?.width ?? 1;
      ctx2.lineCap = "round";
      ctx2.lineJoin = "round";

      ctx2.beginPath();
      ctx2.moveTo(obj.points[0].x, obj.points[0].y);
      for (let i = 1; i < obj.points.length; i++) {
        ctx2.lineTo(obj.points[i].x, obj.points[i].y);
      }
      ctx2.stroke();
      break;

    case "rect":
      ctx2.strokeStyle = obj.style?.color ?? "#000";
      ctx2.lineWidth = obj.style?.thickness ?? 1;
      ctx2.strokeRect(obj.start.x, obj.start.y, obj.end.x - obj.start.x, obj.end.y - obj.start.y);
      break;

    case "line":
      ctx2.strokeStyle = obj.style?.color ?? "#000";
      ctx2.lineWidth = obj.style?.thickness ?? 1;
      ctx2.beginPath();
      ctx2.moveTo(obj.start.x, obj.start.y);
      ctx2.lineTo(obj.end.x, obj.end.y);
      ctx2.stroke();
      break;

    case "circle":
      ctx2.strokeStyle = obj.style?.color ?? "#000";
      ctx2.lineWidth = obj.style?.thickness ?? 1;
      const cx = (obj.start.x + obj.end.x)/2;
      const cy = (obj.start.y + obj.end.y)/2;
      const rx = Math.abs(obj.end.x - obj.start.x)/2;
      const ry = Math.abs(obj.end.y - obj.start.y)/2;
      ctx2.beginPath();
      ctx2.ellipse(cx, cy, rx, ry, 0, 0, Math.PI*2);
      ctx2.stroke();
      break;

case "fill":
  ctx2.drawImage(obj.surface, -obj.width / 2, -obj.height / 2);
  break;
  }

  ctx2.restore();
}

function initObjectSurface(obj) {
    if (!obj.surface) {
        obj.surface = document.createElement("canvas");
        obj.surface.width = OBJECT_SURFACE_SIZE;
        obj.surface.height = OBJECT_SURFACE_SIZE;
        obj.surfaceCtx = obj.surface.getContext("2d");
        obj.surfaceCtx.imageSmoothingEnabled = true;
        obj.surfaceCtx.imageSmoothingQuality = "high";
    }

    // redraw object to surface
    const ctx2 = obj.surfaceCtx;
    ctx2.clearRect(0, 0, OBJECT_SURFACE_SIZE, OBJECT_SURFACE_SIZE);
    ctx2.save();
    ctx2.translate(OBJECT_SURFACE_SIZE/2, OBJECT_SURFACE_SIZE/2);
    drawObjectOnContext(obj, ctx2);
    ctx2.restore();
}

// =======================
// Draw Object Layer (Surface Based)
// =======================

function drawObjectLayer(extraObjects = []) {
    const allObjects = [];
    for (let l = 0; l < layers.length; l++) {
        allObjects.push(...getExposedObjectFrame(currentFrame, l));
    }
    allObjects.push(...extraObjects);

    const cw = canvas.width, ch = canvas.height;

    allObjects.forEach(obj => {
        if (!obj.surface) initObjectSurface(obj);

        const t = obj.transform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
        const w = obj.surface.width * (t.scaleX ?? 1);
        const h = obj.surface.height * (t.scaleY ?? 1);
        const x = t.x - w/2, y = t.y - h/2;

        if (x + w < 0 || x > cw || y + h < 0 || y > ch) return; // 🔹 Skip offscreen

        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.rotation ?? 0);
        ctx.globalAlpha = obj.style?.opacity ?? obj.opacity ?? 1;
        ctx.scale(t.scaleX ?? 1, t.scaleY ?? 1);
        ctx.drawImage(obj.surface, -obj.surface.width / 2, -obj.surface.height / 2);
        ctx.restore();
    });
    
if (currentTool === "transform") {

  if (multiSelection.length > 1) {
    drawMultiSelectionBox();
  } 
  else if (selectedObject) {
    drawSelectionBox(selectedObject);
  }

}
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return Math.hypot(px - x1, py - y1);
  }

  const t = ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy);
  const clamped = Math.max(0, Math.min(1, t));

  const projX = x1 + clamped * dx;
  const projY = y1 + clamped * dy;

  return Math.hypot(px - projX, py - projY);
}

function eraseWithCircle(x, y, radius) {
    for (let l = layers.length - 1; l >= 0; l--) {
        const objs = getExposedObjectFrame(currentFrame, l);
        for (let i = objs.length - 1; i >= 0; i--) {
            const obj = objs[i];
            if (!obj.surface) initObjectSurface(obj);
            const t = obj.transform ?? { x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 };
            const dx = x - t.x;
            const dy = y - t.y;
            const sin = Math.sin(-t.rotation);
            const cos = Math.cos(-t.rotation);
            const localX = (dx * cos - dy * sin) / (t.scaleX ?? 1);
            const localY = (dx * sin + dy * cos) / (t.scaleY ?? 1);
            const ctx2 = obj.surfaceCtx;
            ctx2.globalCompositeOperation = "destination-out";
ctx2.save();
ctx2.translate(
  localX + obj.surface.width / 2,
  localY + obj.surface.height / 2
);

// scale inverse to object scale so eraser stays circular in world space
ctx2.scale(
  1 / (t.scaleX ?? 1),
  1 / (t.scaleY ?? 1)
);

ctx2.beginPath();
ctx2.arc(0, 0, radius, 0, Math.PI * 2);
ctx2.fill();

ctx2.restore();
            obj.modified = true;
        }
    }
    realFrames[currentFrame][activeLayer] = true;
    requestRefresh();
}

function drawPreviewObject(obj) {
    if (!obj) return;

    ctx.save();

    ctx.globalAlpha = obj.style?.opacity ?? 1;
    ctx.strokeStyle = obj.style?.color ?? "#000";
    ctx.lineWidth = obj.style?.thickness ?? obj.style?.width ?? 1;

    const t = obj.transform ?? { x: 0, y: 0 };

    ctx.beginPath();

    if (obj.type === "line") {
        ctx.moveTo(obj.start.x + t.x, obj.start.y + t.y);
        ctx.lineTo(obj.end.x + t.x, obj.end.y + t.y);
        ctx.stroke();
    }

    else if (obj.type === "rect") {
        ctx.strokeRect(
            obj.start.x + t.x,
            obj.start.y + t.y,
            obj.end.x - obj.start.x,
            obj.end.y - obj.start.y
        );
    }

    else if (obj.type === "circle") {
        const cx = (obj.start.x + obj.end.x) / 2 + t.x;
        const cy = (obj.start.y + obj.end.y) / 2 + t.y;
        const rx = Math.abs(obj.end.x - obj.start.x) / 2;
        const ry = Math.abs(obj.end.y - obj.start.y) / 2;

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.restore();
}

function getSurfaceBoundingBox(obj) {
    if (!obj.surfaceCtx) return null;
    const w = obj.surface.width;
    const h = obj.surface.height;
    const img = obj.surfaceCtx.getImageData(0, 0, w, h);
    const data = img.data;

    let minX = w, minY = h, maxX = -1, maxY = -1;

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (data[i + 3] !== 0) { // alpha > 0
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
    }

    if (maxX < minX || maxY < minY) {
        return null; // fully erased
    }

    return {
    x: (minX + maxX) / 2 - w / 2,
    y: (minY + maxY) / 2 - h / 2,
    width: (maxX - minX) + 1,
    height: (maxY - minY) + 1
};

}

function drawSelectionRectangle() {
  if (!selectionBox) return;

  const {x1, y1, x2, y2} = selectionBox;

  ctx.save();
  ctx.strokeStyle = "#00aaff";
  ctx.setLineDash([6,4]);
  ctx.lineWidth = 1;

  ctx.strokeRect(
    Math.min(x1,x2),
    Math.min(y1,y2),
    Math.abs(x2-x1),
    Math.abs(y2-y1)
  );

  ctx.restore();
}

function drawSelectionBox(obj) {
  if (!obj || !obj.transform) return;

  const t = obj.transform;
  const box = getObjectBoundingBox(obj);
  if (!box) return;

  ctx.save();

  ctx.translate(t.x, t.y);
  ctx.rotate(t.rotation ?? 0);

  const scaleX = t.scaleX ?? 1;
  const scaleY = t.scaleY ?? 1;

  const width = box.width * scaleX;
  const height = box.height * scaleY;

  const offsetX = box.x * scaleX;
  const offsetY = box.y * scaleY;

  ctx.strokeStyle = "#00aaff";
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 4]);

  ctx.strokeRect(
    offsetX - width/2,
    offsetY - height/2,
    width,
    height
  );

  const corners = [
    [offsetX - width/2, offsetY - height/2],
    [offsetX + width/2, offsetY - height/2],
    [offsetX + width/2, offsetY + height/2],
    [offsetX - width/2, offsetY + height/2]
  ];

  ctx.fillStyle = "#00aaff";
  corners.forEach(([x, y]) => {
    ctx.fillRect(x - 4, y - 4, 8, 8);
  });

  const ROTATE_DIST = 15;
  const rotX = offsetX;
  const rotY = offsetY - height/2 - ROTATE_DIST;

  ctx.beginPath();
  ctx.moveTo(offsetX, offsetY - height/2);
  ctx.lineTo(rotX, rotY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rotX, rotY, 6, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

function drawMultiSelectionBox() {

  const ROTATE_DIST = 15;

  const bounds = getMultiSelectionBounds();
  if (!bounds) return;

  const {x, y, width, height} = bounds;

  ctx.save();

  ctx.strokeStyle = "#00aaff";
  ctx.lineWidth = 1;
  ctx.setLineDash([6,4]);

  ctx.strokeRect(
    x - width/2,
    y - height/2,
    width,
    height
  );

  const corners = [
    [x - width/2, y - height/2],
    [x + width/2, y - height/2],
    [x + width/2, y + height/2],
    [x - width/2, y + height/2]
  ];

  ctx.fillStyle = "#00aaff";
  corners.forEach(([cx,cy])=>{
    ctx.fillRect(cx-4, cy-4, 8, 8);
  });

  // ROTATION HANDLE
  const rotX = x;
  const rotY = y - height/2 - ROTATE_DIST;

  ctx.beginPath();
  ctx.moveTo(x, y - height/2);
  ctx.lineTo(rotX, rotY);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(rotX, rotY, 6, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// =======================
// Transform Interaction
// =======================
let transformAction = null; // "move", "rotate", "resize"
let activeHandle = null; // corner index 0-3
const HANDLE_SIZE = 8;
const ROTATE_DIST = 15;

function getHandleUnderMouse(obj, mouseX, mouseY) {

  // --- MULTI SELECTION ---
  if (multiSelection.length > 1) {

    const bounds = getMultiSelectionBounds();
    if (!bounds) return null;

    const width = bounds.width;
    const height = bounds.height;

    const localX = mouseX - bounds.x;
    const localY = mouseY - bounds.y;

    // rotation handle
    const rotX = 0;
    const rotY = -height / 2 - ROTATE_DIST;

    if (Math.hypot(localX - rotX, localY - rotY) <= HANDLE_SIZE) {
      return { type: "rotate" };
    }

    const corners = [
      [-width/2, -height/2],
      [ width/2, -height/2],
      [ width/2,  height/2],
      [-width/2,  height/2]
    ];

    for (let i = 0; i < corners.length; i++) {
      const [cx, cy] = corners[i];
      if (Math.abs(localX - cx) <= HANDLE_SIZE &&
          Math.abs(localY - cy) <= HANDLE_SIZE) {
        return { type: "resize", corner: i };
      }
    }

    return null;
  }

  // --- SINGLE OBJECT (original behavior) ---
  if (!obj || !obj.transform) return null;

  const t = obj.transform;
  const box = getObjectBoundingBox(obj);

  const width = box.width * (t.scaleX ?? 1);
  const height = box.height * (t.scaleY ?? 1);

  let dx = mouseX - t.x;
  let dy = mouseY - t.y;

  const sin = Math.sin(-t.rotation);
  const cos = Math.cos(-t.rotation);

  let localX = dx * cos - dy * sin;
  let localY = dx * sin + dy * cos;

  const rotX = 0;
  const rotY = -height/2 - ROTATE_DIST;

  if (Math.hypot(localX - rotX, localY - rotY) <= HANDLE_SIZE) {
    return { type: "rotate" };
  }

  const corners = [
    [-width/2, -height/2],
    [ width/2, -height/2],
    [ width/2,  height/2],
    [-width/2,  height/2]
  ];

  for (let i = 0; i < corners.length; i++) {
    const [cx, cy] = corners[i];

    if (Math.abs(localX - cx) <= HANDLE_SIZE &&
        Math.abs(localY - cy) <= HANDLE_SIZE) {
      return { type: "resize", corner: i };
    }
  }

  return null;
}

window.addEventListener("resize", () => {
    const container = canvas.parentElement;
    if (!container) return;

    const scaleX = container.clientWidth / canvas.width;
    const scaleY = container.clientHeight / canvas.height;
    const scale = Math.min(scaleX, scaleY);

    canvas.style.transform = `scale(${scale})`;
    canvas.style.transformOrigin = "top left";
});

