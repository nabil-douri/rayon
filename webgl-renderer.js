'use strict';

/**
 * WebGLRenderer — GPU ray tracer using WebGL2.
 *
 * Mirrors the CPU path in Engine exactly:
 *   - Reads prepareFrameData() buffers (_tri_sx/sy/sz, _tri_e1x…, etc.)
 *   - Packs them into RGBA32F data textures
 *   - Runs a fragment shader that executes the same Möller–Trumbore + Phong loop
 *     per pixel in parallel on the GPU.
 *
 * Data textures layout (width × height, RGBA32F, NEAREST sampling, texelFetch):
 *
 *   u_triData   — 6 × MAX_TRIS
 *     row i, col 0 : s.xyz      (origin − v0, = _tri_sx/y/z)
 *     row i, col 1 : e1.xyz     (_tri_e1x/y/z)
 *     row i, col 2 : e2.xyz     (_tri_e2x/y/z)
 *     row i, col 3 : n.xyz      (_tri_nx/y/z)
 *     row i, col 4 : rgb + diffuse
 *     row i, col 5 : specular   (r channel only)
 *
 *   u_lightData — 2 × MAX_LIGHTS
 *     row j, col 0 : pos.xyz + power
 *     row j, col 1 : color.rgb
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

        this._MAX_TRIS   = 256;
        this._MAX_LIGHTS = 16;

        // Reusable typed arrays for texture uploads (avoids GC pressure)
        this._triData   = new Float32Array(this._MAX_TRIS   * 6 * 4);
        this._lightData = new Float32Array(this._MAX_LIGHTS * 2 * 4);
    }

    /** Attach to a canvas and initialize WebGL2.  Returns false if unsupported. */
    init(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2');
        if (!gl) return false;
        this.gl = gl;
        this._initGL();
        return !!this.program;
    }

    // -------------------------------------------------------------------------
    _initGL() {
        const gl = this.gl;

        // --- Vertex shader: full-screen triangle strip ---
        const vsSource = `#version 300 es
in vec2 a_position;
void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

        // --- Fragment shader: ray tracer ---
        const fsSource = `#version 300 es
precision highp float;
precision highp sampler2D;

uniform vec2      u_resolution;       // (width, height) in pixels
uniform float     u_pixelSize;        // camera.pixelSize
uniform float     u_focalLength;      // camera.focalLength
uniform mat3      u_rotMatrix;        // camera rotation (column-major, same as Matrix4.m 3×3)
uniform float     u_ambientStrength;
uniform float     u_shininess;
uniform int       u_triCount;
uniform int       u_lightCount;
uniform sampler2D u_triData;          // 6 × MAX_TRIS RGBA32F
uniform sampler2D u_lightData;        // 2 × MAX_LIGHTS RGBA32F

out vec4 fragColor;

const float EPSILON = 1e-6;

void main() {
    // ----- Build ray direction -----
    // gl_FragCoord.y goes bottom→top; CPU row 0 is the top.
    float col = gl_FragCoord.x - 0.5;
    float row = (u_resolution.y - 1.0) - (gl_FragCoord.y - 0.5);

    vec2  center = u_resolution * 0.5;
    float pixelX =  (col - center.x) * u_pixelSize;
    float pixelY = -(row - center.y) * u_pixelSize;
    float pixelZ =  u_focalLength;

    // Apply camera rotation (same linear transform as CPU computeRayVectors)
    vec3 dir = normalize(u_rotMatrix * vec3(pixelX, pixelY, pixelZ));

    // ----- Möller–Trumbore intersection -----
    float closestT = 1.0e20;
    int   hitTri   = -1;

    for (int i = 0; i < 256; i++) {
        if (i >= u_triCount) break;

        // Triangle texel layout: col 0=s, 1=e1, 2=e2, 3=n, 4=colorDiff, 5=spec
        vec3 s  = texelFetch(u_triData, ivec2(0, i), 0).xyz;  // origin − v0
        vec3 e1 = texelFetch(u_triData, ivec2(1, i), 0).xyz;
        vec3 e2 = texelFetch(u_triData, ivec2(2, i), 0).xyz;

        vec3  h = cross(dir, e2);
        float a = dot(e1, h);
        if (abs(a) < EPSILON) continue;

        float f  = 1.0 / a;
        float u  = f * dot(s, h);
        if (u < 0.0 || u > 1.0) continue;

        vec3  q = cross(s, e1);
        float v = f * dot(dir, q);
        if (v < 0.0 || u + v > 1.0) continue;

        float t = f * dot(e2, q);
        if (t > EPSILON && t < closestT) {
            closestT = t;
            hitTri   = i;
        }
    }

    if (hitTri < 0) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }

    // ----- Phong illumination -----
    vec3  P        = dir * closestT;
    vec3  normal   = texelFetch(u_triData, ivec2(3, hitTri), 0).xyz;
    vec4  cd       = texelFetch(u_triData, ivec2(4, hitTri), 0);
    vec3  triColor = cd.rgb;
    float diffRefl = cd.a;
    float specRefl = texelFetch(u_triData, ivec2(5, hitTri), 0).r;

    vec3 finalColor = triColor * u_ambientStrength;
    vec3 viewDir    = normalize(-P);  // camera is at origin in camera space

    for (int j = 0; j < 16; j++) {
        if (j >= u_lightCount) break;

        // Light texel layout: col 0 = pos.xyz + power, col 1 = color.rgb
        vec4  ld0    = texelFetch(u_lightData, ivec2(0, j), 0);
        vec4  ld1    = texelFetch(u_lightData, ivec2(1, j), 0);
        vec3  lpos   = ld0.xyz;
        float lpower = ld0.w;
        vec3  lcolor = ld1.rgb;

        vec3  lv    = lpos - P;
        float dist2 = dot(lv, lv);
        vec3  L     = normalize(lv);

        float NdotL  = max(0.0, dot(normal, L));
        float diffuse = diffRefl * NdotL;

        vec3  R         = reflect(-L, normal);
        float specAngle = max(0.0, dot(R, viewDir));
        float spec      = specRefl * pow(specAngle, u_shininess);

        float attenuation = lpower / (dist2 + 1.0);
        vec3  lc          = lcolor * attenuation;

        finalColor += triColor * lc * diffuse + lc * spec;
    }

    fragColor = vec4(clamp(finalColor, 0.0, 1.0), 1.0);
}`;

        const vs = this._compileShader(gl, gl.VERTEX_SHADER,   vsSource);
        const fs = this._compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return;

        this.program = gl.createProgram();
        gl.attachShader(this.program, vs);
        gl.attachShader(this.program, fs);
        gl.linkProgram(this.program);
        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
            console.error('WebGLRenderer: link error:', gl.getProgramInfoLog(this.program));
            this.program = null;
            return;
        }

        // Full-screen quad (triangle strip)
        const verts = new Float32Array([-1, -1,  1, -1,  -1, 1,  1, 1]);
        this._vao = gl.createVertexArray();
        gl.bindVertexArray(this._vao);
        const vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        const posLoc = gl.getAttribLocation(this.program, 'a_position');
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // RGBA32F data textures — readable by texelFetch, no extensions needed
        this._triTexture   = this._createDataTexture(gl, 6, this._MAX_TRIS);
        this._lightTexture = this._createDataTexture(gl, 2, this._MAX_LIGHTS);

        // Cache uniform locations
        const p = this.program;
        this._u = {
            resolution:      gl.getUniformLocation(p, 'u_resolution'),
            pixelSize:       gl.getUniformLocation(p, 'u_pixelSize'),
            focalLength:     gl.getUniformLocation(p, 'u_focalLength'),
            rotMatrix:       gl.getUniformLocation(p, 'u_rotMatrix'),
            ambientStrength: gl.getUniformLocation(p, 'u_ambientStrength'),
            shininess:       gl.getUniformLocation(p, 'u_shininess'),
            triCount:        gl.getUniformLocation(p, 'u_triCount'),
            lightCount:      gl.getUniformLocation(p, 'u_lightCount'),
            triData:         gl.getUniformLocation(p, 'u_triData'),
            lightData:       gl.getUniformLocation(p, 'u_lightData'),
        };
    }

    _compileShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('WebGLRenderer: shader error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    _createDataTexture(gl, width, height) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // Allocate RGBA32F texture; NEAREST filtering avoids OES_texture_float_linear
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
        return tex;
    }

    // -------------------------------------------------------------------------
    // Pack engine._tri_* arrays into the flat _triData Float32Array.
    // Texture row i → triangle i; columns 0-5 → 6 RGBA texels per triangle.
    _packTriangles(engine) {
        const count = Math.min(engine._triCount || 0, this._MAX_TRIS);
        const d = this._triData;
        d.fill(0);
        for (let i = 0; i < count; i++) {
            const b = i * 24; // 6 texels × 4 floats
            // col 0: s = origin − v0  (stored as _tri_sx/y/z)
            d[b +  0] = engine._tri_sx[i]; d[b +  1] = engine._tri_sy[i]; d[b +  2] = engine._tri_sz[i];
            // col 1: edge1
            d[b +  4] = engine._tri_e1x[i]; d[b +  5] = engine._tri_e1y[i]; d[b +  6] = engine._tri_e1z[i];
            // col 2: edge2
            d[b +  8] = engine._tri_e2x[i]; d[b +  9] = engine._tri_e2y[i]; d[b + 10] = engine._tri_e2z[i];
            // col 3: normal
            d[b + 12] = engine._tri_nx[i]; d[b + 13] = engine._tri_ny[i]; d[b + 14] = engine._tri_nz[i];
            // col 4: color.rgb + diffuse
            d[b + 16] = engine._tri_cr[i]; d[b + 17] = engine._tri_cg[i]; d[b + 18] = engine._tri_cb[i];
            d[b + 19] = engine._tri_diffuse[i];
            // col 5: specular
            d[b + 20] = engine._tri_specular[i];
        }
    }

    // Pack engine._lights_* arrays into the flat _lightData Float32Array.
    _packLights(engine) {
        const count = Math.min((engine._lights_x || []).length, this._MAX_LIGHTS);
        const d = this._lightData;
        d.fill(0);
        for (let j = 0; j < count; j++) {
            const b = j * 8; // 2 texels × 4 floats
            // col 0: pos.xyz + power
            d[b + 0] = engine._lights_x[j]; d[b + 1] = engine._lights_y[j]; d[b + 2] = engine._lights_z[j];
            d[b + 3] = engine._lights_power[j];
            // col 1: color.rgb
            d[b + 4] = engine._lights_r[j]; d[b + 5] = engine._lights_g[j]; d[b + 6] = engine._lights_b[j];
        }
        return count;
    }

    // -------------------------------------------------------------------------
    /** Render one frame.  Calls engine.prepareFrameData() internally. */
    render(engine) {
        const gl = this.gl;
        if (!gl || !this.program) return;

        engine.prepareFrameData();
        this._packTriangles(engine);
        const lightCount = this._packLights(engine);

        const cam = engine.camera;
        const w   = cam.definitionH;
        const h   = cam.definitionV;

        // Sync canvas size
        if (this.canvas.width !== w || this.canvas.height !== h) {
            this.canvas.width  = w;
            this.canvas.height = h;
        }
        this.canvas.style.width  = (w * engine.canvasScale) + 'px';
        this.canvas.style.height = (h * engine.canvasScale) + 'px';
        gl.viewport(0, 0, w, h);

        // Upload data textures
        gl.bindTexture(gl.TEXTURE_2D, this._triTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 6, this._MAX_TRIS, gl.RGBA, gl.FLOAT, this._triData);

        gl.bindTexture(gl.TEXTURE_2D, this._lightTexture);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 2, this._MAX_LIGHTS, gl.RGBA, gl.FLOAT, this._lightData);

        // Set uniforms
        gl.useProgram(this.program);
        gl.uniform2f(this._u.resolution, w, h);
        gl.uniform1f(this._u.pixelSize,  cam.pixelSize);
        gl.uniform1f(this._u.focalLength, cam.focalLength);

        // Rotation matrix: 3×3 upper-left of Matrix4.m (column-major → GLSL mat3)
        const m    = (cam.rotationMatrix && cam.rotationMatrix.m) ? cam.rotationMatrix.m : null;
        const rot3 = m
            ? new Float32Array([m[0], m[1], m[2],  m[4], m[5], m[6],  m[8], m[9], m[10]])
            : new Float32Array([1, 0, 0,  0, 1, 0,  0, 0, 1]);
        gl.uniformMatrix3fv(this._u.rotMatrix, false, rot3);

        const scene = engine.scene;
        gl.uniform1f(this._u.ambientStrength, scene ? scene.ambientStrength : 0.2);
        gl.uniform1f(this._u.shininess,       scene ? scene.shininess       : 32);
        gl.uniform1i(this._u.triCount,   engine._triCount || 0);
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
    /** GPU animation loop — mirrors Engine.startAnimation() but renders via WebGL. */
    startAnimation(engine) {
        if (this._animId) return;
        this._startTime     = performance.now();
        this._lastFrameTime = this._startTime;
        const frameInterval = 1000 / 60;

        const animate = (t) => {
            const angle = (t - this._startTime) * 0.001;

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
        if (this._animId) {
            cancelAnimationFrame(this._animId);
            this._animId = null;
        }
    }
}
