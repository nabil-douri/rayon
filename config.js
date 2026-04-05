'use strict';

const Config = Object.freeze({

    // ---- Camera / viewport ------------------------------------------------
    camera: Object.freeze({
        width:        960,   // horizontal pixel count
        height:       480,   // vertical pixel count
        oversampling: 1,     // >1 renders at higher resolution then down-samples
        focalLength:  1000,  // distance from camera to focal plane (pre-oversampling)
        moveSpeed:    100,   // world units per second for FPS keyboard movement
    }),

    // ---- Scene defaults ---------------------------------------------------
    scene: Object.freeze({
        ambientStrength: 0.25,
        shininess:       256,
    }),

    // ---- Default material -------------------------------------------------
    material: Object.freeze({
        defaultDiffuse:  0.5,
        defaultSpecular: 0.5,
    }),

    // ---- Lights -----------------------------------------------------------
    lights: [
        { x: 1000, y: 1000, z: 100,  power: 1000000, r: 1, g: 1, b: 1 },
        { x: -100, y: 100,  z: -500, power: 1000000, r: 1, g: 1, b: 1 },
    ],

    // ---- Scene objects ----------------------------------------------------
    cubes: [
        { x: 30,  y: 20, z: 300, size: 40, r: 0.2, g: 0.6, b: 0.9 },
        { x: -30, y: 0,  z: 200, size: 40, r: 0.9, g: 0.2, b: 0.6 },
    ],

    // ---- WebGL limits -----------------------------------------------------
    webgl: Object.freeze({
        maxTriangles: 4096,  // increase for complex STL meshes
        maxLights:    16,
    }),

    // ---- Animation --------------------------------------------------------
    animation: Object.freeze({
        speed:  0.001,  // radians per millisecond
        maxFps: 60,
    }),

    // ---- Mouse interaction ------------------------------------------------
    interaction: Object.freeze({
        rotationSensitivity: 0.005,  // radians per pixel
    }),

    // ---- CPU parallelism --------------------------------------------------
    parallel: Object.freeze({
        numWorkers: 0,       // 0 = navigator.hardwareConcurrency; set manually to override
        chunkSize:  1,      // rows per work chunk dispatched to a worker
    }),

    // ---- UI slider ranges -------------------------------------------------
    sliders: Object.freeze({
        diffuse:   Object.freeze({ min: 0, max: 1,   step: 0.01 }),
        specular:  Object.freeze({ min: 0, max: 1,   step: 0.01 }),
        shininess: Object.freeze({ min: 1, max: 256, step: 1    }),
        ambient:   Object.freeze({ min: 0, max: 1,   step: 0.01 }),
    }),

});
