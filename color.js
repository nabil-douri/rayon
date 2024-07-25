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
}