'use strict';

/**
 * Initialise all slider controls from Config values and engine state.
 * `onRenderFrame` is called after any slider change.
 */
function initUI(engine, onRenderFrame) {
    const diffRange = document.getElementById('diffRange');
    const specRange = document.getElementById('specRange');
    const shinRange = document.getElementById('shinRange');
    const ambRange  = document.getElementById('ambRange');
    const diffVal   = document.getElementById('diffVal');
    const specVal   = document.getElementById('specVal');
    const shinVal   = document.getElementById('shinVal');
    const ambVal    = document.getElementById('ambVal');

    // Apply slider constraints from Config
    _applySliderConfig(diffRange, Config.sliders.diffuse);
    _applySliderConfig(specRange, Config.sliders.specular);
    _applySliderConfig(shinRange, Config.sliders.shininess);
    _applySliderConfig(ambRange,  Config.sliders.ambient);

    // Seed values from live engine state
    const tris = engine.triangles;
    diffRange.value = tris.length ? tris[0].diffuseReflectance  : Config.material.defaultDiffuse;
    specRange.value = tris.length ? tris[0].specularReflectance : Config.material.defaultSpecular;
    shinRange.value = engine.scene.shininess;
    ambRange.value  = engine.scene.ambientStrength;

    diffVal.textContent = parseFloat(diffRange.value).toFixed(2);
    specVal.textContent = parseFloat(specRange.value).toFixed(2);
    shinVal.textContent = engine.scene.shininess;
    ambVal.textContent  = engine.scene.ambientStrength;

    diffRange.oninput = () => {
        const v = parseFloat(diffRange.value);
        diffVal.textContent = v.toFixed(2);
        engine.setSceneDiffuse(v);
        onRenderFrame();
    };
    specRange.oninput = () => {
        const v = parseFloat(specRange.value);
        specVal.textContent = v.toFixed(2);
        engine.setSceneSpecular(v);
        onRenderFrame();
    };
    shinRange.oninput = () => {
        const v = parseInt(shinRange.value, 10);
        shinVal.textContent = v;
        if (engine.scene) engine.scene.shininess = v;
        onRenderFrame();
    };
    ambRange.oninput = () => {
        const v = parseFloat(ambRange.value);
        ambVal.textContent = v.toFixed(2);
        if (engine.scene) engine.scene.ambientStrength = v;
        onRenderFrame();
    };
}

/**
 * Update mode-related DOM elements to reflect the current renderer.
 * @param {boolean} gpuMode  true = WebGL2 active, false = CPU active
 */
function setModeDisplay(gpuMode) {
    document.getElementById('mode-label').textContent = gpuMode
        ? 'GPU (WebGL2) Ray Tracer'
        : 'CPU Ray Tracer in JavaScript';
    document.getElementById('switch-btn').textContent = gpuMode
        ? 'Switch to CPU'
        : 'Switch to GPU (WebGL2)';
    document.getElementById('canvas').style.display     = gpuMode ? 'none' : '';
    document.getElementById('canvas-gpu').style.display = gpuMode ? ''     : 'none';
}

// ---- private ---------------------------------------------------------------

function _applySliderConfig(el, cfg) {
    el.min  = cfg.min;
    el.max  = cfg.max;
    el.step = cfg.step;
}
