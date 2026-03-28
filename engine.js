class Engine {
	image;
	camera;
	lightSources = [];
	triangles = [];
	cubes = [];
	canvasScale = 1;
	oversampling = 1;
	definitionH = 720;
	definitionV = 480;
    
	constructor() {
		console.log("Initializing engine...");
		this.scene = null;
		this.load();
	}
    
	load() {
		console.log("Loading scene...");
		this.camera = new Camera(new Point(0,0,0), this.definitionH*this.oversampling, this.definitionV*this.oversampling, 1/this.oversampling, 1000/this.oversampling);
		// Precompute ray vectors on the camera so the image and camera stay aligned
		this.camera.rayVectors = this.camera.computeRayVectors();
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
	}

	// Prepare numeric, camera-space triangle and light buffers for the frame.
	prepareFrameData() {
		const cam = this.camera.position;
		const ox = cam.x, oy = cam.y, oz = cam.z;
		// Triangles: pack into separate Float32Array attributes (structure-of-arrays)
		const tcount = this.triangles.length;
		this._triCount = tcount;
		this._tri_sx = new Float32Array(tcount);
		this._tri_sy = new Float32Array(tcount);
		this._tri_sz = new Float32Array(tcount);
		this._tri_e1x = new Float32Array(tcount);
		this._tri_e1y = new Float32Array(tcount);
		this._tri_e1z = new Float32Array(tcount);
		this._tri_e2x = new Float32Array(tcount);
		this._tri_e2y = new Float32Array(tcount);
		this._tri_e2z = new Float32Array(tcount);
		this._tri_nx = new Float32Array(tcount);
		this._tri_ny = new Float32Array(tcount);
		this._tri_nz = new Float32Array(tcount);
		this._tri_cr = new Float32Array(tcount);
		this._tri_cg = new Float32Array(tcount);
		this._tri_cb = new Float32Array(tcount);
		this._tri_diffuse = new Float32Array(tcount);
		this._tri_specular = new Float32Array(tcount);

		const hasRot = this.camera && this.camera.rotationMatrix && this.camera.rotationMatrix.m;
		const rotm = hasRot ? this.camera.rotationMatrix.m : null;
		for (let i = 0; i < tcount; i++) {
			const t = this.triangles[i];
			const v0x = t.v0.x - ox;
			const v0y = t.v0.y - oy;
			const v0z = t.v0.z - oz;
			if (hasRot) {
				const vx = rotm[0]*v0x + rotm[4]*v0y + rotm[8]*v0z;
				const vy = rotm[1]*v0x + rotm[5]*v0y + rotm[9]*v0z;
				const vz = rotm[2]*v0x + rotm[6]*v0y + rotm[10]*v0z;
				this._tri_sx[i] = -vx;
				this._tri_sy[i] = -vy;
				this._tri_sz[i] = -vz;
				const e1x = t.edge1.x, e1y = t.edge1.y, e1z = t.edge1.z;
				const e2x = t.edge2.x, e2y = t.edge2.y, e2z = t.edge2.z;
				this._tri_e1x[i] = rotm[0]*e1x + rotm[4]*e1y + rotm[8]*e1z;
				this._tri_e1y[i] = rotm[1]*e1x + rotm[5]*e1y + rotm[9]*e1z;
				this._tri_e1z[i] = rotm[2]*e1x + rotm[6]*e1y + rotm[10]*e1z;
				this._tri_e2x[i] = rotm[0]*e2x + rotm[4]*e2y + rotm[8]*e2z;
				this._tri_e2y[i] = rotm[1]*e2x + rotm[5]*e2y + rotm[9]*e2z;
				this._tri_e2z[i] = rotm[2]*e2x + rotm[6]*e2y + rotm[10]*e2z;
				const nx = t.normal.x, ny = t.normal.y, nz = t.normal.z;
				this._tri_nx[i] = rotm[0]*nx + rotm[4]*ny + rotm[8]*nz;
				this._tri_ny[i] = rotm[1]*nx + rotm[5]*ny + rotm[9]*nz;
				this._tri_nz[i] = rotm[2]*nx + rotm[6]*ny + rotm[10]*nz;
			} else {
				this._tri_sx[i] = -v0x;
				this._tri_sy[i] = -v0y;
				this._tri_sz[i] = -v0z;
				this._tri_e1x[i] = t.edge1.x; this._tri_e1y[i] = t.edge1.y; this._tri_e1z[i] = t.edge1.z;
				this._tri_e2x[i] = t.edge2.x; this._tri_e2y[i] = t.edge2.y; this._tri_e2z[i] = t.edge2.z;
				this._tri_nx[i] = t.normal.x; this._tri_ny[i] = t.normal.y; this._tri_nz[i] = t.normal.z;
			}
			this._tri_cr[i] = t.color.r; this._tri_cg[i] = t.color.g; this._tri_cb[i] = t.color.b;
			this._tri_diffuse[i] = t.diffuseReflectance; this._tri_specular[i] = t.specularReflectance;
		}

		// Lights: pack into separate Float32Array attributes (structure-of-arrays)
		const lcount = this.lightSources.length;
		this._lights_x = new Float32Array(lcount);
		this._lights_y = new Float32Array(lcount);
		this._lights_z = new Float32Array(lcount);
		this._lights_power = new Float32Array(lcount);
		this._lights_r = new Float32Array(lcount);
		this._lights_g = new Float32Array(lcount);
		this._lights_b = new Float32Array(lcount);
		for (let i = 0; i < lcount; i++) {
			const L = this.lightSources[i];
			const lx = L.position.x - ox, ly = L.position.y - oy, lz = L.position.z - oz;
			if (hasRot) {
				this._lights_x[i] = rotm[0]*lx + rotm[4]*ly + rotm[8]*lz;
				this._lights_y[i] = rotm[1]*lx + rotm[5]*ly + rotm[9]*lz;
				this._lights_z[i] = rotm[2]*lx + rotm[6]*ly + rotm[10]*lz;
			} else {
				this._lights_x[i] = lx;
				this._lights_y[i] = ly;
				this._lights_z[i] = lz;
			}
			this._lights_power[i] = L.power;
			this._lights_r[i] = L.color.r;
			this._lights_g[i] = L.color.g;
			this._lights_b[i] = L.color.b;
		}
	}

	// Cube behavior moved to cube.js (Cube class)

	// Convenience: set camera rotation (Euler) and update ray vectors
	setCameraRotation(ax, ay, az) {
		if (typeof Matrix4 !== 'undefined') {
			this.camera.rotationMatrix = Matrix4.fromEuler(ax, ay, az);
			this.camera.rayVectors = this.camera.computeRayVectors();
		}
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
		// Numeric, allocation-minimizing Möller–Trumbore implementation
		const camPos = this.camera.position;
		const ox = camPos.x, oy = camPos.y, oz = camPos.z;
		const rv = this.camera.rayVectors[row][col];
		if (!rv) return this._black;
		let dx = rv.x, dy = rv.y, dz = rv.z;
		let len2 = dx*dx + dy*dy + dz*dz;
		if (len2 === 0) return this._black;
		const invLen = 1.0 / Math.sqrt(len2);
		dx *= invLen; dy *= invLen; dz *= invLen;

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
		const ambientStrength = this.scene ? this.scene.ambientStrength : 0.2;
		const shininess = this.scene ? this.scene.shininess : 32;

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

	// Start an animation loop that updates triangle 0 position and redraws the image.
	// `canvas` is the HTMLCanvasElement to draw into. Returns the animation id.
	startAnimation(canvas) {
		if (this._animId) return; // already running
		this._canvas = canvas;
		this._startTime = performance.now();
		this._lastFrameTime = this._startTime;
		const frameInterval = 1000 / 60; // max 60 Hz
		const animate = (t) => {
			const elapsed = t - this._startTime;
			const speed = 0.001; // radians per ms
			const angle = elapsed * speed;
			if (this.cubes.length > 0) {
				this.cubes[0].rotate(0.3 * Math.sin(angle), angle, 0.2 * Math.cos(angle));
			}
			if (this.cubes.length > 1) {
				this.cubes[1].rotate(0.8 * Math.cos(2*angle), angle, -0.1 * Math.sin(-angle));
			}

			// Cap rendering/tracing to 60Hz
			const delta = t - this._lastFrameTime;
			if (delta >= frameInterval) {
				this.traceAll();
				if (this._canvas && this.image) this.image.drawToCanvas(this._canvas, this.canvasScale);
				this._lastFrameTime = t;
				const fpsEl = document.getElementById('fps');
				if (fpsEl) fpsEl.textContent = (1000.0 / delta).toFixed(1);
			}

			this._animId = requestAnimationFrame(animate);
		};
		this._animId = requestAnimationFrame(animate);
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