class Engine {
	image;
	camera;
	lightSources = [];
	triangles = [];
	cubes = [];
	canvasScale = 1;
	oversampling = Config.camera.oversampling;
	definitionH = Config.camera.width;
	definitionV = Config.camera.height;
    
	constructor() {
		console.log("Initializing engine...");
		this.scene = null;
		this.load();
	}
    
	load() {
		console.log("Loading scene...");
		this.camera = new Camera(new Point(0,0,0), this.definitionH*this.oversampling, this.definitionV*this.oversampling, 1/this.oversampling, Config.camera.focalLength/this.oversampling);
		console.log(this.camera);
		// Build scene (lights, cubes, triangles, and scene-level parameters)
		this.scene = new Scene();
		this.lightSources = this.scene.lightSources;
		this.cubes = this.scene.cubes;
		this.triangles = this.scene.triangles;
		// Create the image using the camera's pixel grid dimensions so centers align
		this.image = new Image(this.definitionH, this.definitionV, new Color(0,0,0));
		console.log(this.image);
		this._black = new Color(0,0,0);
		this.canvasScale = 1/this.oversampling;
		// Reusable rotation buffer (avoids allocation in traceAllParallel)
		this._rot9Buf = new Float32Array(9);
		// Pre-allocate SOA buffers once — reused every frame, no per-frame GC
		const maxT = Config.webgl.maxTriangles;
		const maxL = Config.webgl.maxLights;
		this._tri_sx      = new Float32Array(maxT);
		this._tri_sy      = new Float32Array(maxT);
		this._tri_sz      = new Float32Array(maxT);
		this._tri_e1x     = new Float32Array(maxT);
		this._tri_e1y     = new Float32Array(maxT);
		this._tri_e1z     = new Float32Array(maxT);
		this._tri_e2x     = new Float32Array(maxT);
		this._tri_e2y     = new Float32Array(maxT);
		this._tri_e2z     = new Float32Array(maxT);
		this._tri_nx      = new Float32Array(maxT);
		this._tri_ny      = new Float32Array(maxT);
		this._tri_nz      = new Float32Array(maxT);
		this._tri_cr      = new Float32Array(maxT);
		this._tri_cg      = new Float32Array(maxT);
		this._tri_cb      = new Float32Array(maxT);
		this._tri_diffuse   = new Float32Array(maxT);
		this._tri_specular  = new Float32Array(maxT);
		this._lights_x      = new Float32Array(maxL);
		this._lights_y      = new Float32Array(maxL);
		this._lights_z      = new Float32Array(maxL);
		this._lights_power  = new Float32Array(maxL);
		this._lights_r      = new Float32Array(maxL);
		this._lights_g      = new Float32Array(maxL);
		this._lights_b      = new Float32Array(maxL);
		// Compact interleaved GPU buffer: 5 vec4 per triangle (20 floats)
		// vec4 0: s.xyz,   0        (origin-v0)
		// vec4 1: e1.xyz,  0
		// vec4 2: e2.xyz,  0
		// vec4 3: n.xyz,   0
		// vec4 4: rgb.xyz, diffuse  + specular in .a actually split: rgb+diff then spec
		// Actually packing as 5 RGBA: col0=s, col1=e1, col2=e2, col3=normal, col4=color+diff+spec
		// We keep spec in col4.a for tight packing (5 texels per tri instead of 6)
		this._gpuTriBuf   = new Float32Array(maxT * 5 * 4);
		this._gpuLightBuf = new Float32Array(maxL * 2 * 4);
		// Parallel CPU tracer — persistent worker pool
		const nw = Config.parallel.numWorkers || navigator.hardwareConcurrency || 4;
		this._parallelTracer = (typeof ParallelTracer !== 'undefined')
			? new ParallelTracer('worker-raytracer.js', nw, Config.parallel.chunkSize)
			: null;
	}

	// Prepare numeric world-space triangle and light buffers for the frame.
	// Also fills _gpuTriBuf / _gpuLightBuf (compact interleaved) for the WebGL renderer.
	//
	// GPU texture layout — 5 RGBA32F texels per triangle (row = tri index, col = field):
	//   col 0 : s.xyz  (camOrigin - v0),  w = 0
	//   col 1 : e1.xyz,                   w = 0
	//   col 2 : e2.xyz,                   w = 0
	//   col 3 : n.xyz,                    w = specularReflectance
	//   col 4 : color.rgb,                w = diffuseReflectance
	// Replace the loaded mesh triangles while keeping cube triangles intact.
	// Call renderFrame() after this to update the view.
	setMeshTriangles(tris) {
		this._meshTriangles = tris;
		this.triangles = [...this.cubes.flatMap(c => c.triangles), ...tris];
		const total = this.triangles.length;
		const maxT  = Config.webgl.maxTriangles;
		if (total > maxT)
			console.warn(`Mesh has ${total} triangles but Config.webgl.maxTriangles is ${maxT}. ` +
				`Only the first ${maxT} will be rendered. Increase maxTriangles in config.js.`);
	}

	prepareFrameData() {
		const cam = this.camera.position;
		const ox = cam.x, oy = cam.y, oz = cam.z;
		const maxT   = Config.webgl.maxTriangles;
		const tcount = Math.min(this.triangles.length, maxT);
		this._triCount = tcount;

		const gpuT = this._gpuTriBuf;
		for (let i = 0; i < tcount; i++) {
			const t   = this.triangles[i];
			const sx  = t.v0.x - ox, sy = t.v0.y - oy, sz = t.v0.z - oz;
			this._tri_sx[i] = -sx; this._tri_sy[i] = -sy; this._tri_sz[i] = -sz;
			this._tri_e1x[i] = t.edge1.x; this._tri_e1y[i] = t.edge1.y; this._tri_e1z[i] = t.edge1.z;
			this._tri_e2x[i] = t.edge2.x; this._tri_e2y[i] = t.edge2.y; this._tri_e2z[i] = t.edge2.z;
			this._tri_nx[i]  = t.normal.x; this._tri_ny[i]  = t.normal.y; this._tri_nz[i]  = t.normal.z;
			this._tri_cr[i]  = t.color.r;  this._tri_cg[i]  = t.color.g;  this._tri_cb[i]  = t.color.b;
			this._tri_diffuse[i]  = t.diffuseReflectance;
			this._tri_specular[i] = t.specularReflectance;
			// Pack into compact GPU buffer (5 vec4 per triangle)
			const b = i * 20;
			gpuT[b+ 0] = -sx;          gpuT[b+ 1] = -sy;         gpuT[b+ 2] = -sz;         gpuT[b+ 3] = 0;
			gpuT[b+ 4] = t.edge1.x;    gpuT[b+ 5] = t.edge1.y;   gpuT[b+ 6] = t.edge1.z;   gpuT[b+ 7] = 0;
			gpuT[b+ 8] = t.edge2.x;    gpuT[b+ 9] = t.edge2.y;   gpuT[b+10] = t.edge2.z;   gpuT[b+11] = 0;
			gpuT[b+12] = t.normal.x;   gpuT[b+13] = t.normal.y;  gpuT[b+14] = t.normal.z;  gpuT[b+15] = t.specularReflectance;
			gpuT[b+16] = t.color.r;    gpuT[b+17] = t.color.g;   gpuT[b+18] = t.color.b;   gpuT[b+19] = t.diffuseReflectance;
		}

		const lcount = this.lightSources.length;
		const gpuL = this._gpuLightBuf;
		for (let i = 0; i < lcount; i++) {
			const L = this.lightSources[i];
			const lx = L.position.x - ox, ly = L.position.y - oy, lz = L.position.z - oz;
			this._lights_x[i] = lx; this._lights_y[i] = ly; this._lights_z[i] = lz;
			this._lights_power[i] = L.power;
			this._lights_r[i] = L.color.r; this._lights_g[i] = L.color.g; this._lights_b[i] = L.color.b;
			const b = i * 8;
			gpuL[b+0] = lx;        gpuL[b+1] = ly;        gpuL[b+2] = lz;        gpuL[b+3] = L.power;
			gpuL[b+4] = L.color.r; gpuL[b+5] = L.color.g; gpuL[b+6] = L.color.b; gpuL[b+7] = 0;
		}
	}

	// Cube behavior moved to cube.js (Cube class)

	// Convenience: set camera rotation (Euler) and update ray vectors
	setCameraRotation(ax, ay, az) {
		if (typeof Matrix4 !== 'undefined') {
			this.camera.rotationMatrix = Matrix4.fromEuler(ax, ay, az);
			this.camera.computeRayVectors();
		}
	}

	// Async parallel CPU trace using ParallelTracer worker pool.
	// Broadcasts scene data to workers then dispatches row chunks.
	// Returns a Promise that resolves when the full image is written into this.image.p.
	traceAllParallel() {
		this.prepareFrameData();

		// Build 3×3 rotation (same layout as webgl-renderer _rot3)
		const rot9 = this._rot9Buf;
		const m    = this.camera.rotationMatrix && this.camera.rotationMatrix.m;
		if (m) {
			rot9[0]=m[0]; rot9[1]=m[1]; rot9[2]=m[2];
			rot9[3]=m[4]; rot9[4]=m[5]; rot9[5]=m[6];
			rot9[6]=m[8]; rot9[7]=m[9]; rot9[8]=m[10];
		} else {
			rot9[0]=1; rot9[1]=0; rot9[2]=0;
			rot9[3]=0; rot9[4]=1; rot9[5]=0;
			rot9[6]=0; rot9[7]=0; rot9[8]=1;
		}

		// Broadcast compact SOA buffers to all workers (scene data, processed once)
		this._parallelTracer.broadcast({
			cmd:        'update',
			triSoa:     this._gpuTriBuf.slice(0, this._triCount * 20),
			lightSoa:   this._gpuLightBuf.slice(0, this.lightSources.length * 8),
			triCount:   this._triCount,
			lightCount: this.lightSources.length,
			cam: {
				pixelSize:   this.camera.pixelSize,
				focalLength: this.camera.focalLength,
				definitionH: this.camera.definitionH,
				definitionV: this.camera.definitionV,
			},
			rot9:  rot9.slice(),
			scene: {
				ambientStrength: this.scene ? this.scene.ambientStrength : Config.scene.ambientStrength,
				shininess:       this.scene ? this.scene.shininess       : Config.scene.shininess,
			},
		});

		const rows   = this.image.rows;
		const cols   = this.image.cols;
		const imageP = this.image.p;

		return this._parallelTracer.trace(rows, (startRow, endRow, pixels) => {
			let off = 0;
			for (let r = startRow; r < endRow; r++) {
				const rowArr = imageP[r];
				for (let c = 0; c < cols; c++) {
					rowArr[c] = { r: pixels[off], g: pixels[off+1], b: pixels[off+2] };
					off += 3;
				}
			}
		});
	}
    
	traceAll() {
		// Prepare numeric per-frame buffers to avoid per-ray allocations
		this.prepareFrameData();
		// micro-optimized loop: cache ranges and arrays
		const rows = this.image.rows;
		const cols = this.image.cols;
		const imageP = this.image.p;
		for (let r = 0; r < rows; r++) {
			const rowArr = imageP[r];
			for (let c = 0; c < cols; c++) {
				rowArr[c] = this.traceRay(c, r);
			}
		}
	}

	// Incremental tracing: trace the image in small row batches and update the canvas
	// (Incremental tracing removed) Use traceAll() for full synchronous renders.

	traceRay(col, row) {
		// Read pre-normalised direction from flat Float32Array buffer
		const base = (row * this.camera.definitionH + col) * 3;
		const buf  = this.camera.rayVectors;
		if (!buf) return this._black;
		const dx = buf[base], dy = buf[base+1], dz = buf[base+2];
		if (dx === 0 && dy === 0 && dz === 0) return this._black;

		const EPSILON = 1e-6;
		let closestT = Infinity;
		let hitTriIndex = -1;
		const triCount = this._triCount || 0;
		const sxArr = this._tri_sx, syArr = this._tri_sy, szArr = this._tri_sz;
		const e1xArr = this._tri_e1x, e1yArr = this._tri_e1y, e1zArr = this._tri_e1z;
		const e2xArr = this._tri_e2x, e2yArr = this._tri_e2y, e2zArr = this._tri_e2z;

		for (let i = 0; i < triCount; i++) {
			const sx = sxArr[i], sy = syArr[i], sz = szArr[i];
			const e1x = e1xArr[i], e1y = e1yArr[i], e1z = e1zArr[i];
			const e2x = e2xArr[i], e2y = e2yArr[i], e2z = e2zArr[i];

			// h = dir x edge2
			const hx = dy * e2z - dz * e2y;
			const hy = dz * e2x - dx * e2z;
			const hz = dx * e2y - dy * e2x;

			const a = e1x * hx + e1y * hy + e1z * hz;
			if (a > -EPSILON && a < EPSILON) continue;
			const f = 1.0 / a;

			// s was precomputed as origin - v0 => sx,sy,sz
			const sDotH = sx * hx + sy * hy + sz * hz;
			const u = f * sDotH;
			if (u < 0.0 || u > 1.0) continue;

			// q = s x edge1
			const qx = sy * e1z - sz * e1y;
			const qy = sz * e1x - sx * e1z;
			const qz = sx * e1y - sy * e1x;

			const dirDotQ = dx * qx + dy * qy + dz * qz;
			const v = f * dirDotQ;
			if (v < 0.0 || u + v > 1.0) continue;

			const t = f * (e2x * qx + e2y * qy + e2z * qz);
			if (t > EPSILON && t < closestT) {
				closestT = t;
				hitTriIndex = i;
			}
		}

		if (hitTriIndex < 0) return this._black;

		const PcX = dx * closestT;
		const PcY = dy * closestT;
		const PcZ = dz * closestT;
		// Pass triangle index and camera-space intersection point to numeric illumination
		return this.computeIllumination(hitTriIndex, { x: PcX, y: PcY, z: PcZ });
	}

	// Compute Phong-style illumination for triangle `tri` at point `P`.
	// Returns a clamped Color.
	computeIllumination(triIndex, P) {
		// Numeric implementation using structure-of-arrays
		const nx = this._tri_nx[triIndex], ny = this._tri_ny[triIndex], nz = this._tri_nz[triIndex];
		const ambientStrength = this.scene ? this.scene.ambientStrength : Config.scene.ambientStrength;
		const shininess = this.scene ? this.scene.shininess : Config.scene.shininess;

		let r = this._tri_cr[triIndex] * ambientStrength;
		let g = this._tri_cg[triIndex] * ambientStrength;
		let b = this._tri_cb[triIndex] * ambientStrength;

		// view direction in camera-space: camera is at origin, so view = -P
		const vx = -P.x;
		const vy = -P.y;
		const vz = -P.z;
		let vlen = Math.sqrt(vx*vx + vy*vy + vz*vz);
		let vdx = 0, vdy = 0, vdz = 0;
		if (vlen !== 0) {
			const invV = 1.0 / vlen; vdx = vx * invV; vdy = vy * invV; vdz = vz * invV;
		}

		const lxArr = this._lights_x || new Float32Array(0);
		const lyArr = this._lights_y || new Float32Array(0);
		const lzArr = this._lights_z || new Float32Array(0);
		const lpArr = this._lights_power || new Float32Array(0);
		const lrArr = this._lights_r || new Float32Array(0);
		const lgArr = this._lights_g || new Float32Array(0);
		const lbArr = this._lights_b || new Float32Array(0);

		const triDiffuse = this._tri_diffuse[triIndex];
		const triSpec = this._tri_specular[triIndex];
		const triCr = this._tri_cr[triIndex], triCg = this._tri_cg[triIndex], triCb = this._tri_cb[triIndex];

		for (let i = 0, n = lxArr.length; i < n; i++) {
			const lx = lxArr[i] - P.x;
			const ly = lyArr[i] - P.y;
			const lz = lzArr[i] - P.z;
			const dist2 = lx*lx + ly*ly + lz*lz;
			let invL = 0;
			if (dist2 !== 0) invL = 1.0 / Math.sqrt(dist2);
			const Lx = lx * invL, Ly = ly * invL, Lz = lz * invL;

			const NdotL = Math.max(0, nx * Lx + ny * Ly + nz * Lz);
			const diffuse = triDiffuse * NdotL;

			let rx = 2 * NdotL * nx - Lx;
			let ry = 2 * NdotL * ny - Ly;
			let rz = 2 * NdotL * nz - Lz;
			let rlen = Math.sqrt(rx*rx + ry*ry + rz*rz);
			if (rlen !== 0) {
				const invR = 1.0 / rlen; rx *= invR; ry *= invR; rz *= invR;
			} else { rx = ry = rz = 0; }

			const specAngle = Math.max(0, rx * vdx + ry * vdy + rz * vdz);
			const spec = triSpec * Math.pow(specAngle, shininess);

			const attenuation = lpArr[i] / (dist2 + 1);
			const lr = lrArr[i] * attenuation;
			const lg = lgArr[i] * attenuation;
			const lbcol = lbArr[i] * attenuation;

			r += triCr * lr * diffuse + lr * spec;
			g += triCg * lg * diffuse + lg * spec;
			b += triCb * lbcol * diffuse + lbcol * spec;
		}

		r = Math.max(0, Math.min(1, r));
		g = Math.max(0, Math.min(1, g));
		b = Math.max(0, Math.min(1, b));
		return new Color(r, g, b);
	}

	// Translate triangle `index` by (dx,dy,dz) relative to its base vertices
	translateTriangle(index, dx, dy, dz) {
		if (index < 0 || index >= this.triangles.length) return;
		const tri = this.triangles[index];
		tri.v0 = tri.baseV0.plus(new Vector(dx, dy, dz));
		tri.v1 = tri.baseV1.plus(new Vector(dx, dy, dz));
		tri.v2 = tri.baseV2.plus(new Vector(dx, dy, dz));
	}

	// Start an animation loop that updates cube positions and redraws the image.
	// Uses the parallel CPU tracer when available, falling back to single-threaded.
	startAnimation(canvas) {
		if (this._animId) return;
		this._canvas    = canvas;
		this._startTime = performance.now();
		this._lastFrameTime = this._startTime;
		const frameInterval = 1000 / Config.animation.maxFps;

		const step = (t) => {
			const delta = t - this._lastFrameTime;
			if (delta < frameInterval) {
				this._animId = requestAnimationFrame(step);
				return;
			}
			this._lastFrameTime = t;

			const angle = (t - this._startTime) * Config.animation.speed;
			if (this.cubes.length > 0)
				this.cubes[0].rotate(0.3 * Math.sin(angle), angle, 0.2 * Math.cos(angle));
			if (this.cubes.length > 1)
				this.cubes[1].rotate(0.8 * Math.cos(2*angle), angle, -0.1 * Math.sin(-angle));

			const finish = () => {
				if (this._canvas && this.image)
					this.image.drawToCanvas(this._canvas, this.canvasScale);
				const fpsEl = document.getElementById('fps');
				if (fpsEl) fpsEl.textContent = (1000.0 / delta).toFixed(1);
				if (this._animId !== null)
					this._animId = requestAnimationFrame(step);
			};

			if (this._parallelTracer) {
				this.traceAllParallel().then(finish);
			} else {
				this.traceAll();
				finish();
			}
		};

		this._animId = requestAnimationFrame(step);
		return this._animId;
	}

	stopAnimation() {
		if (!this._animId) return;
		cancelAnimationFrame(this._animId);
		this._animId = null;
	}

	// Convenience: set diffuse reflectance for all triangles
	setDiffuseAll(value) {
		for (let t of this.triangles) t.diffuseReflectance = value;
	}

	// Convenience: set specular reflectance for all triangles
	setSpecularAll(value) {
		for (let t of this.triangles) t.specularReflectance = value;
	}

	// Proxy to scene setters (if scene exists)
	setSceneDiffuse(value) {
		if (this.scene) this.scene.setDiffuseAll(value);
		this.setDiffuseAll(value);
	}

	setSceneSpecular(value) {
		if (this.scene) this.scene.setSpecularAll(value);
		this.setSpecularAll(value);
	}
}