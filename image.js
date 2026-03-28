class Image {
	rows;
	cols;
	p = [];
	
	constructor(cols, rows, defaultColor) {
		this.rows = rows;
		this.cols = cols;
		
		this.p = [];
		for(var row = 0; row < this.rows; row++) {
			this.p.push(new Array(this.cols).fill(defaultColor));
		}
	}
	
	get text() {
		var t = "";
		
		for(var row = 0; row < this.rows; row++) {
			for(var col = 0; col < this.cols; col++) {
				t += this.p[row][col].luminance + " ";
			}
			t += "<br>";
		}
		
		return t;
	}

	// Draw the image pixels into a canvas element. `scale` enlarges each
	// logical pixel for visibility (default 10).
	drawToCanvas(canvas, scale = 10) {
		if (!canvas || !canvas.getContext) return;
		const ctx = canvas.getContext('2d');
		// Set logical pixel dimensions
		canvas.width = this.cols;
		canvas.height = this.rows;
		// Scale canvas visually so pixels are visible
		canvas.style.width = (this.cols * scale) + 'px';
		canvas.style.height = (this.rows * scale) + 'px';
		ctx.imageSmoothingEnabled = false;

		// Reuse an ImageData buffer if possible to avoid allocations
		if (!this._imageData || this._cachedCols !== this.cols || this._cachedRows !== this.rows) {
			this._imageData = ctx.createImageData(this.cols, this.rows);
			this._data = this._imageData.data;
			this._cachedCols = this.cols;
			this._cachedRows = this.rows;
		}

		const data = this._data;
		let ptr = 0;
		for (let y = 0; y < this.rows; y++) {
			for (let x = 0; x < this.cols; x++) {
				const c = this.p[y][x] || { r: 0, g: 0, b: 0 };
				data[ptr++] = Math.round(Math.max(0, Math.min(1, c.r || 0)) * 255);
				data[ptr++] = Math.round(Math.max(0, Math.min(1, c.g || 0)) * 255);
				data[ptr++] = Math.round(Math.max(0, Math.min(1, c.b || 0)) * 255);
				data[ptr++] = 255;
			}
		}

		ctx.putImageData(this._imageData, 0, 0);
	}
}