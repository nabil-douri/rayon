class Matrix4 {
	// column-major array of 16 numbers
	m;
	constructor(values) {
		this.m = values ? Float32Array.from(values) : Matrix4.identity().m;
	}

	static identity() {
		return new Matrix4([
			1,0,0,0,
			0,1,0,0,
			0,0,1,0,
			0,0,0,1
		]);
	}

	static fromEuler(ax, ay, az) {
		// Build rotation matrices Rx, Ry, Rz and multiply R = Rz*Ry*Rx
		const ca = Math.cos(ax), sa = Math.sin(ax);
		const cb = Math.cos(ay), sb = Math.sin(ay);
		const cc = Math.cos(az), sc = Math.sin(az);

		// Compose directly into a single matrix (column-major)
		const r00 = cc * cb;
		const r01 = sc * cb;
		const r02 = -sb;
		const r03 = 0;

		const r10 = cc * sb * sa - sc * ca;
		const r11 = sc * sb * sa + cc * ca;
		const r12 = cb * sa;
		const r13 = 0;

		const r20 = cc * sb * ca + sc * sa;
		const r21 = sc * sb * ca - cc * sa;
		const r22 = cb * ca;
		const r23 = 0;

		const r30 = 0, r31 = 0, r32 = 0, r33 = 1;

		return new Matrix4([
			r00, r01, r02, r03,
			r10, r11, r12, r13,
			r20, r21, r22, r23,
			r30, r31, r32, r33
		]);
	}

	// transform point {x,y,z} (assumes w=1)
	transformPoint(p) {
		const x = p.x, y = p.y, z = p.z;
		const m = this.m;
		return {
			x: m[0]*x + m[4]*y + m[8]*z + m[12],
			y: m[1]*x + m[5]*y + m[9]*z + m[13],
			z: m[2]*x + m[6]*y + m[10]*z + m[14]
		};
	}
}
// Expose Matrix4 globally for non-module usage
window.Matrix4 = Matrix4;
