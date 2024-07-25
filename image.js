class Image {
	rows;
	columns;
	p = [];
	
	constructor(columns, rows, defaultColor) {
		this.rows = rows;
		this.columns = columns;
		
		this.p = [];
		for(var row = 0; row < this.rows; row++) {
			this.p.push(new Array(this.columns).fill(defaultColor));
		}
	}
	
	get text() {
		var t = "";
		
		for(var row = 0; row < this.rows; row++) {
			for(var col = 0; col < this.columns; col++) {
				t += this.p[row][col].luminance + " ";
			}
			t += "<br>";
		}
		
		return t;
	}
}