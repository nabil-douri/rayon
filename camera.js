class Camera {
	position;
	definitionH;
	definitionV;
	pixelSize;
	focalLength;
	
	constructor(position, definitionH, definitionV, pixelSize, focalLength) {
		this.position = position;
		this.definitionH = definitionH;
		this.definitionV = definitionV;
		this.pixelSize = pixelSize;
		this.focalLength = focalLength;
	}
}