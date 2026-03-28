class Color {
	r;
	g;
	b;
	
	constructor(r, g, b) {
		this.r = r;
		this.g = g;
		this.b = b;
	}
	
	get luminance() {
		return (3 * this.r + 4 * this.g + this.b) / 8;
	}

	// Return a new color scaled by scalar s
	scale(s) {
		return new Color(this.r * s, this.g * s, this.b * s);
	}

	// Element-wise multiply with another color
	multiply(c) {
		return new Color(this.r * c.r, this.g * c.g, this.b * c.b);
	}

	// Add another color
	add(c) {
		return new Color(this.r + c.r, this.g + c.g, this.b + c.b);
	}

	// Clamp components to [0,1]
	clamp() {
		return new Color(
			Math.max(0, Math.min(1, this.r)),
			Math.max(0, Math.min(1, this.g)),
			Math.max(0, Math.min(1, this.b))
		);
	}
}