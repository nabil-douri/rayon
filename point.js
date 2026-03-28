class Point {
	// Coordinates of the point
	x;
	y;
	z;
	
	constructor(x, y, z) {
		this.x = x;
		this.y = y;
		this.z = z;
	}

	minus(p) {
		return new Vector(
			this.x - p.x,
			this.y - p.y,
			this.z - p.z);
	}

	plus(v) {
		return new Point(
			this.x + v.x,
			this.y + v.y,
			this.z + v.z);
	}
}