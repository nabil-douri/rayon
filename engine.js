class Engine {
	image;
	camera;
	lightSources = [];
	triangles = [];
	
	constructor() {
		this.load();
	}
	
	load() {
		this.camera = new Camera(new Point(0,0,0), 50, 25, 1, 100);
		this.lightSources.push(new LightSource(new Point(1000, 1000, 1000), 1, new Color(1, 1, 1)));
		this.triangles.push(new Point(500,500,500), new Point(800,800,500), new Point(800,500,500), new Color(1, 1, 1), 0.5, 0);
		this.image = new Image(50, 25, new Color(0,0,0));
	}
	
	traceAll() {
		for(var row = 0; row < this.image.rows; row++) {
			for(var col = 0; col < this.image.cols; col++) {
				this.image.p[row][col] = traceRay(col, row);
			}
		}
	}
	
	traceRay(col, row) {
	}
	
	getRayVector() {
		
	}
}