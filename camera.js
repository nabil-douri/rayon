class Camera {
	position;
	definitionH;
	definitionV;
	pixelSize;
	focalLength;
	rayVectors;
	
	constructor(position, definitionH, definitionV, pixelSize, focalLength) {
		this.position = position;
		this.definitionH = definitionH;
		this.definitionV = definitionV;
		this.pixelSize = pixelSize;
		this.focalLength = focalLength;
		this.rayVectors = this.computeRayVectors();
	}

	// Compute and return a 2D array [row][col] of ray direction Vectors
	// from the camera position through each pixel on the focal plane.
	computeRayVectors() {
		const cx = this.definitionH / 2.0;
		const cy = this.definitionV / 2.0;
		const rays = [];
		for (let row = 0; row < this.definitionV; row++) {
			const rowArr = [];
			for (let col = 0; col < this.definitionH; col++) {
				const pixelX = (col - cx) * this.pixelSize;
				const pixelY = -(row - cy) * this.pixelSize;
				const pixelZ = this.focalLength;
				const pixelPoint = new Point(pixelX, pixelY, pixelZ);
				// Subtract camera position to get direction vector
				let dir = pixelPoint.minus(this.position);
				// If camera has a rotation matrix, apply the rotation to the direction (no translation)
				if (this.rotationMatrix && this.rotationMatrix.m) {
					const m = this.rotationMatrix.m;
					const x = dir.x, y = dir.y, z = dir.z;
					// Use linear part (3x3) of row-major matrix
					dir = new Vector(
						m[0]*x + m[4]*y + m[8]*z,
						m[1]*x + m[5]*y + m[9]*z,
						m[2]*x + m[6]*y + m[10]*z
					);
				}
				rowArr.push(dir);
			}
			rays.push(rowArr);
		}
		return rays;
	}

	setRotationFromEuler(ax, ay, az) {
		if (typeof Matrix4 !== 'undefined') {
			this.rotationMatrix = Matrix4.fromEuler(ax, ay, az);
			// Recompute ray vectors when rotation changes
			this.rayVectors = this.computeRayVectors();
		}
	}
}