'use strict';

const engine    = new Engine();
const canvasCpu = document.getElementById('canvas');
const canvasGpu = document.getElementById('canvas-gpu');

let gpuMode       = false;
let webglRenderer = null;

// Initialise UI controls and perform the first render
initUI(engine, renderFrame);
renderFrame();

// Wire up action buttons
document.getElementById('btn-trace').addEventListener('click', renderFrame);
document.getElementById('btn-start-anim').addEventListener('click', startAnim);
document.getElementById('btn-stop-anim').addEventListener('click', stopAnim);
document.getElementById('switch-btn').addEventListener('click', switchMode);
document.getElementById('btn-load-stl').addEventListener('click', () => {
    const fileInput  = document.getElementById('stl-file');
    const statusEl   = document.getElementById('stl-status');
    if (!fileInput.files.length) { statusEl.textContent = 'No file selected.'; return; }

    const file  = fileInput.files[0];
    const hex   = document.getElementById('stl-color').value;   // e.g. "#cc8833"
    const scale = parseFloat(document.getElementById('stl-scale').value) || 1;
    const color = new Color(
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255
    );

    statusEl.textContent = 'Loading…';
    STLLoader.fromFile(file, color, 0.7, 0.5, scale)
        .then(tris => {
            engine.setMeshTriangles(tris);
            statusEl.textContent = `Loaded ${tris.length} triangles.`;
            renderFrame();
        })
        .catch(err => {
            statusEl.textContent = 'Error: ' + err.message;
            console.error(err);
        });
});

// ---- Core functions (global so they remain accessible if needed) -----------

function renderFrame() {
    if (gpuMode && webglRenderer) {
        webglRenderer.render(engine);
    } else {
        // If the CPU animation loop is running, skip: it will pick up any
        // camera/scene changes on its next frame automatically.
        if (engine._animId) return;

        if (engine._parallelTracer) {
            engine.traceAllParallel().then(() =>
                engine.image.drawToCanvas(canvasCpu, engine.canvasScale)
            );
        } else {
            engine.traceAll();
            engine.image.drawToCanvas(canvasCpu, engine.canvasScale);
        }
    }
}

function switchMode() {
    engine.stopAnimation();
    if (webglRenderer) webglRenderer.stopAnimation();

    if (!gpuMode) {
        if (!webglRenderer) {
            webglRenderer = new WebGLRenderer();
            if (!webglRenderer.init(canvasGpu)) {
                alert('WebGL2 is not supported in this browser. Staying in CPU mode.');
                webglRenderer = null;
                return;
            }
        }
        gpuMode = true;
    } else {
        gpuMode = false;
    }

    setModeDisplay(gpuMode);
    renderFrame();
}

function startAnim() {
    if (gpuMode && webglRenderer) {
        webglRenderer.startAnimation(engine);
    } else {
        engine.startAnimation(canvasCpu);
    }
}

function stopAnim() {
    engine.stopAnimation();
    if (webglRenderer) webglRenderer.stopAnimation();
}

// ---- Camera rotation via middle-button drag --------------------------------

let isMiddleDown = false;
let lastX = 0, lastY = 0;
let camAx = 0, camAy = 0, camAz = 0;

document.getElementById('canvas-container').addEventListener('mousedown', (e) => {
    if (e.button === 1) {
        isMiddleDown = true;
        lastX = e.clientX;
        lastY = e.clientY;
        e.preventDefault();
    }
});

window.addEventListener('mouseup', (e) => {
    if (isMiddleDown && e.button === 1) isMiddleDown = false;
});

window.addEventListener('mousemove', (e) => {
    if (!isMiddleDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    camAy += dx * Config.interaction.rotationSensitivity;
    camAx += dy * Config.interaction.rotationSensitivity;
    engine.setCameraRotation(camAx, camAy, camAz);
    renderFrame();
});

// ---- FPS keyboard movement (Z/S/Q/D) --------------------------------------

const _keysDown = new Set();
let   _moveRafId  = null;
let   _moveLastT  = 0;

const MOVE_KEYS = new Set(['z', 's', 'q', 'd']);

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (!MOVE_KEYS.has(key)) return;
    e.preventDefault();
    _keysDown.add(key);
    if (!_moveRafId) {
        _moveLastT = performance.now();
        _moveRafId = requestAnimationFrame(_movementLoop);
    }
});

window.addEventListener('keyup', (e) => {
    _keysDown.delete(e.key.toLowerCase());
});

function _movementLoop(t) {
    const dt   = (t - _moveLastT) / 1000; // seconds
    _moveLastT = t;

    if (_keysDown.size === 0) {
        _moveRafId = null;
        return;
    }

    const cam   = engine.camera;
    const m     = cam.rotationMatrix && cam.rotationMatrix.m;
    // Up (+Y local axis rotated to world): column 1 of the rotation matrix
    const ux = m ? m[4]  : 0, uy = m ? m[5]  : 1, uz = m ? m[6]  : 0;
    // Right  (+X local axis rotated to world): column 0
    const rx = m ? m[0]  : 1, ry = m ? m[1]  : 0, rz = m ? m[2]  : 0;

    const speed = Config.camera.moveSpeed;
    let   mx = 0, my = 0, mz = 0;

    if (_keysDown.has('z')) { mx += ux; my += uy; mz += uz; }
    if (_keysDown.has('s')) { mx -= ux; my -= uy; mz -= uz; }
    if (_keysDown.has('d')) { mx += rx; my += ry; mz += rz; }
    if (_keysDown.has('q')) { mx -= rx; my -= ry; mz -= rz; }

    const dist = speed * dt;
    cam.position = new Point(
        cam.position.x + mx * dist,
        cam.position.y + my * dist,
        cam.position.z + mz * dist
    );
    // Ray directions are independent of camera position — no recompute needed
    renderFrame();

    _moveRafId = requestAnimationFrame(_movementLoop);
}
