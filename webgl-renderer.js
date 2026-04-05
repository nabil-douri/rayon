'use strict';

/**
 * WebGLRenderer — GPU ray tracer using WebGL2.
 *
 * Reads engine._gpuTriBuf / engine._gpuLightBuf (filled by engine.prepareFrameData())
 * and uploads them to two RGBA32F data textures:
 *
 *   u_triData   — width=MAX_TRIS, height=5  (1 row per field, 1 column per triangle)
 *     row 0 : s.xyz,    w=0               (camOrigin − v0)
 *     row 1 : e1.xyz,   w=0
 *     row 2 : e2.xyz,   w=0
 *     row 3 : n.xyz,    w=specular
 *     row 4 : rgb,      w=diffuse
 *
 *   u_lightData — width=MAX_LIGHTS, height=2
 *     row 0 : pos.xyz,  w=power
 *     row 1 : color.rgb, w=0
 *
 * Texture is stored column-per-triangle so fetching all 5 fields of a triangle
 * only changes the Y coordinate, keeping memory access sequential.
 */
class WebGLRenderer {
    constructor() {
        this.canvas        = null;
        this.gl            = null;
        this.program       = null;
        this._triTexture   = null;
        this._lightTexture = null;
        this._vao          = null;
        this._u            = null;
        this._animId       = null;
        this._rot3         = new Float32Array(9);  // reused every frame — no alloc

        this._MAX_TRIS   = Config.webgl.maxTriangles;
        this._MAX_LIGHTS = Config.webgl.maxLights;
    }

    /** Attach to a canvas and initialise WebGL2.  Returns false if unsupported. */
    init(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: false, depth: false, stencil: false });
        if (!gl) return false;
        this.gl = gl;
        this._initGL();
        return !!this.program;
    }

    // -------------------------------------------------------------------------
    _initGL() {
        const gl = this.gl;
        const MAX_TRIS   = this._MAX_TRIS;
        const MAX_LIGHTS = this._MAX_LIGHTS;

        const vsSource = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }`;

        const fsSource = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec2      u_resolution;
uniform float     u_pixelSize;
uniform float     u_focalLength;
uniform mat3      u_rot;
uniform float     u_ambient;
uniform float     u_shininess;
uniform int       u_triCount;
uniform int       u_lightCount;
uniform sampler2D u_triData;    // ${MAX_TRIS} wide x 5 tall, RGBA32F
uniform sampler2D u_lightData;  // ${MAX_LIGHTS} wide x 2 tall, RGBA32F

out vec4 fragColor;

const float EPSILON = 1e-6;

void main() {
    vec2  center = u_resolution * 0.5;
    float col    = gl_FragCoord.x - 0.5;
    float row    = (u_resolution.y - 1.0) - (gl_FragCoord.y - 0.5);
    vec3  dir    = normalize(u_rot * vec3(
        ( col - center.x) * u_pixelSize,
        -(row - center.y) * u_pixelSize,
        u_focalLength));

    float closestT = 1.0e20;
    int   hitTri   = -1;
    for (int i = 0; i < u_triCount; ++i) {
        vec3  s  = texelFetch(u_triData, ivec2(i, 0), 0).xyz;
        vec3  e1 = texelFetch(u_triData, ivec2(i, 1), 0).xyz;
        vec3  e2 = texelFetch(u_triData, ivec2(i, 2), 0).xyz;
        vec3  h  = cross(dir, e2);
        float a  = dot(e1, h);
        if (abs(a) < EPSILON) continue;
        float f  = 1.0 / a;
        float u  = f * dot(s, h);
        if (u < 0.0 || u > 1.0) continue;
        vec3  q  = cross(s, e1);
        float v  = f * dot(dir, q);
        if (v < 0.0 || u + v > 1.0) continue;
        float t  = f * dot(e2, q);
        if (t > EPSILON && t < closestT) { closestT = t; hitTri = i; }
    }

    if (hitTri < 0) { fragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }

    vec3  P        = dir * closestT;
    vec4  nd       = texelFetch(u_triData, ivec2(hitTri, 3), 0);
    vec4  cd       = texelFetch(u_triData, ivec2(hitTri, 4), 0);
    vec3  normal   = nd.xyz;
    float specRefl = nd.w;
    vec3  triColor = cd.rgb;
    float diffRefl = cd.w;
    vec3  viewDir  = normalize(-P);

    vec3 finalColor = triColor * u_ambient;
    for (int j = 0; j < u_lightCount; ++j) {
        vec4  ld0   = texelFetch(u_lightData, ivec2(j, 0), 0);
        vec4  ld1   = texelFetch(u_lightData, ivec2(j, 1), 0);
        vec3  lv    = ld0.xyz - P;
        float dist2 = dot(lv, lv);
        vec3  L     = normalize(lv);
        float NdotL = max(0.0, dot(normal, L));
        float diff  = diffRefl * NdotL;
        float spec  = specRefl * pow(max(0.0, dot(reflect(-L, normal), viewDir)), u_shininess);
        vec3  lc    = ld1.rgb * (ld0.w / (dist2 + 1.0));
        finalColor += triColor * lc * diff + lc * spec;
    }

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}`;

        const vs = this._compile(gl, gl.VERTEX_SHADER,   vsSource);
        const fs = this._compile(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('WebGLRenderer link:', gl.getProgramInfoLog(this.program));
            this.program = null; return;
        }
        gl.deleteShader(vs); gl.deleteShader(fs);

        // Full-screen quad (triangle strip)
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
        const apos = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(apos);
        gl.vertexAttribPointer(apos, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // Textures and upload buffers are sized to the actual tri/light count
        // and reallocated lazily in _ensureTextures() on the first render call.
        this._triTexCap   = 0;
        this._lightTexCap = 0;

        const p = this.program;
        this._u = {
            resolution: gl.getUniformLocation(p, 'u_resolution'),
            pixelSize:  gl.getUniformLocation(p, 'u_pixelSize'),
            focalLength:gl.getUniformLocation(p, 'u_focalLength'),
            rot:        gl.getUniformLocation(p, 'u_rot'),
            ambient:    gl.getUniformLocation(p, 'u_ambient'),
            shininess:  gl.getUniformLocation(p, 'u_shininess'),
            triCount:   gl.getUniformLocation(p, 'u_triCount'),
            lightCount: gl.getUniformLocation(p, 'u_lightCount'),
            triData:    gl.getUniformLocation(p, 'u_triData'),
            lightData:  gl.getUniformLocation(p, 'u_lightData'),
        };
    }

    // Recreate triangle/light textures and upload buffers if the triangle or
    // light count has changed since the last frame. Called at the start of render().
    _ensureTextures(triCount, lightCount) {
        const gl = this.gl;
        const tc = Math.max(1, triCount);
        if (tc !== this._triTexCap) {
            if (this._triTexture) gl.deleteTexture(this._triTexture);
            this._triTexture = this._makeTex(gl, tc, 5);
            this._triUpload  = new Float32Array(tc * 5 * 4);
            this._triTexCap  = tc;
        }
        const lc = Math.max(1, lightCount);
        if (lc !== this._lightTexCap) {
            if (this._lightTexture) gl.deleteTexture(this._lightTexture);
            this._lightTexture = this._makeTex(gl, lc, 2);
            this._lightUpload  = new Float32Array(lc * 2 * 4);
            this._lightTexCap  = lc;
        }
    }

    _compile(gl, type, src) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
            console.error('WebGLRenderer shader:', gl.getShaderInfoLog(s));
            gl.deleteShader(s); return null;
        }
        return s;
    }

    _makeTex(gl, w, h) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return t;
    }

    // -------------------------------------------------------------------------
    // Transpose engine._gpuTriBuf (interleaved: tri is contiguous)
    // into column-major upload buffer (column = tri index in GL texture).
    _transposeTri(engine) {
        const src = engine._gpuTriBuf;
        const dst = this._triUpload;
        const W   = this._triTexCap;
        const n   = engine._triCount;
        for (let i = 0; i < n; i++) {
            const s = i * 20;
            for (let r = 0; r < 5; r++) {
                const d = (r * W + i) * 4;
                dst[d  ] = src[s + r*4    ];
                dst[d+1] = src[s + r*4 + 1];
                dst[d+2] = src[s + r*4 + 2];
                dst[d+3] = src[s + r*4 + 3];
            }
        }
    }

    _transposeLights(engine) {
        const src = engine._gpuLightBuf;
        const dst = this._lightUpload;
        const W   = this._lightTexCap;
        const n   = engine.lightSources.length;
        for (let j = 0; j < n; j++) {
            const s = j * 8;
            for (let r = 0; r < 2; r++) {
                const d = (r * W + j) * 4;
                dst[d  ] = src[s + r*4    ];
                dst[d+1] = src[s + r*4 + 1];
                dst[d+2] = src[s + r*4 + 2];
                dst[d+3] = src[s + r*4 + 3];
            }
        }
    }

    // -------------------------------------------------------------------------
    /** Render one frame. */
    render(engine) {
        const gl = this.gl;
        if (!gl || !this.program) return;

        engine.prepareFrameData();

        const cam        = engine.camera;
        const w          = cam.definitionH;
        const h          = cam.definitionV;
        const triCount   = engine._triCount || 0;
        const lightCount = engine.lightSources.length;

        this._ensureTextures(triCount, lightCount);
        this._transposeTri(engine);
        this._transposeLights(engine);

        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width = w; this.canvas.height = h;
        }
        this.canvas.style.width  = (w * engine.canvasScale) + 'px';
        this.canvas.style.height = (h * engine.canvasScale) + 'px';
        gl.viewport(0, 0, w, h);

        gl.bindTexture(gl.TEXTURE_2D, this._triTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this._triTexCap, 5, gl.RGBA, gl.FLOAT, this._triUpload);

        gl.bindTexture(gl.TEXTURE_2D, this._lightTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this._lightTexCap, 2, gl.RGBA, gl.FLOAT, this._lightUpload);

        // Build 3x3 rotation in reused buffer — no allocation
        const rm = this._rot3;
        const m  = cam.rotationMatrix && cam.rotationMatrix.m;
        if (m) {
            rm[0]=m[0]; rm[1]=m[1]; rm[2]=m[2];
            rm[3]=m[4]; rm[4]=m[5]; rm[5]=m[6];
            rm[6]=m[8]; rm[7]=m[9]; rm[8]=m[10];
        } else {
            rm[0]=1; rm[1]=0; rm[2]=0;
            rm[3]=0; rm[4]=1; rm[5]=0;
            rm[6]=0; rm[7]=0; rm[8]=1;
        }

        gl.useProgram(this.program);
        gl.uniform2f(this._u.resolution, w, h);
        gl.uniform1f(this._u.pixelSize,  cam.pixelSize);
        gl.uniform1f(this._u.focalLength, cam.focalLength);
        gl.uniformMatrix3fv(this._u.rot, false, rm);
        const scene = engine.scene;
        gl.uniform1f(this._u.ambient,   scene ? scene.ambientStrength : Config.scene.ambientStrength);
        gl.uniform1f(this._u.shininess, scene ? scene.shininess       : Config.scene.shininess);
        gl.uniform1i(this._u.triCount,   triCount);
        gl.uniform1i(this._u.lightCount, lightCount);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._triTexture);
        gl.uniform1i(this._u.triData, 0);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this._lightTexture);
        gl.uniform1i(this._u.lightData, 1);

        gl.bindVertexArray(this._vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    // -------------------------------------------------------------------------
    /** GPU animation loop */
    startAnimation(engine) {
        if (this._animId) return;
        this._startTime     = performance.now();
        this._lastFrameTime = this._startTime;
        const frameInterval = 1000 / Config.animation.maxFps;

        const animate = (t) => {
            const angle = (t - this._startTime) * Config.animation.speed;
            if (engine.cubes.length > 0)
                engine.cubes[0].rotate(0.3 * Math.sin(angle), angle, 0.2 * Math.cos(angle));
            if (engine.cubes.length > 1)
                engine.cubes[1].rotate(0.8 * Math.cos(2 * angle), angle, -0.1 * Math.sin(-angle));

            const delta = t - this._lastFrameTime;
            if (delta >= frameInterval) {
                this.render(engine);
                this._lastFrameTime = t;
                const fpsEl = document.getElementById('fps');
                if (fpsEl) fpsEl.textContent = (1000.0 / delta).toFixed(1);
            }
            this._animId = requestAnimationFrame(animate);
        };
        this._animId = requestAnimationFrame(animate);
    }

    stopAnimation() {
        if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    }
}
