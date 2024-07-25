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
	
	norm() {
		return (this.x * this.x + this.y * this.y + this.z * this.z);
	}
}