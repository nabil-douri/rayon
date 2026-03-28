class Vector {
	// Components of the vector
	x;
	y;
	z;
	
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	
	plus(v) {
		return new Vector(
			this.x + v.x,
			this.y + v.y,
			this.z + v.z);
	}
	
	minus(v) {
		return new Vector(
			this.x - v.x,
			this.y - v.y,
			this.z - v.z);
	}
	
	dot(v) {
		return (this.x * v.x + this.y * v.y + this.z * v.z);
	}
	
	cross(v) {
		return new Vector(
			this.y * v.z - this.z * v.y,
			this.z * v.x - this.x * v.z,
			this.x * v.y - this.y * v.x);
	}
	
	norm2() {
		return (this.x * this.x + this.y * this.y + this.z * this.z);
	}

	// Length (magnitude) of the vector
	length() {
		return Math.sqrt(this.norm2());
	}

	// Return a new vector scaled by scalar s
	scale(s) {
		return new Vector(this.x * s, this.y * s, this.z * s);
	}

	// Return a normalized copy of this vector (unit length). If zero, returns zero vector.
	normalize() {
		const len = this.length();
		if (len === 0) return new Vector(0,0,0);
		return this.scale(1.0 / len);
	}
}