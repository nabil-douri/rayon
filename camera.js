class Camera {
	position;
	definitionH;
	definitionV;
	pixelSize;
	focalLength;
	// Flat Float32Array of (dx,dy,dz) triples, row-major: index = (row*cols+col)*3
	rayVectors;

	constructor(position, definitionH, definitionV, pixelSize, focalLength) {
		this.position = position;
		this.definitionH = definitionH;
		this.definitionV = definitionV;
		this.pixelSize = pixelSize;
		this.focalLength = focalLength;
		this._rayBuf = new Float32Array(definitionH * definitionV * 3);
		this.computeRayVectors();
	}

	// Fill _rayBuf in-place with normalized direction vectors.
	// Returns this.rayVectors (the flat buffer) for compatibility.
	computeRayVectors() {
		const buf  = this._rayBuf;
		const cols = this.definitionH;
		const rows = this.definitionV;
		const cx   = cols / 2.0;
		const cy   = rows / 2.0;
		const ps   = this.pixelSize;
		const fz   = this.focalLength;
		const m    = (this.rotationMatrix && this.rotationMatrix.m) ? this.rotationMatrix.m : null;
		let ptr = 0;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				let dx =  (col - cx) * ps;
				let dy = -(row - cy) * ps;
				let dz =  fz;
				if (m) {
					const x = dx, y = dy, z = dz;
					dx = m[0]*x + m[4]*y + m[8]*z;
					dy = m[1]*x + m[5]*y + m[9]*z;
					dz = m[2]*x + m[6]*y + m[10]*z;
				}
				const inv = 1.0 / Math.sqrt(dx*dx + dy*dy + dz*dz);
				buf[ptr++] = dx * inv;
				buf[ptr++] = dy * inv;
				buf[ptr++] = dz * inv;
			}
		}
		this.rayVectors = buf;
		return buf;
	}

	setRotationFromEuler(ax, ay, az) {
		if (typeof Matrix4 !== 'undefined') {
			this.rotationMatrix = Matrix4.fromEuler(ax, ay, az);
			this.computeRayVectors();
		}
	}
}