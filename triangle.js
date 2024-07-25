// https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/geometry-of-a-triangle.html

class Triangle {
	// Vertices
	v0;
	v1;
	v2;
	normal;
	color;
	diffuseReflectance;
	specularReflectance;
	
	constructor(v0, v1, v2, color, diffuseReflectance, specularReflectance) {
		// Initialize vertices
		this.v0 = v0;
		this.v1 = v1;
		this.v2 = v2;
		
		// Compute normal vector
		A = v1.minus(v0);
		B = v2.minus(v0);
		this.normal = A.cross(B);
		
		this.color = color;
		this.diffuseReflectance = diffuseReflectance;
		this.specularReflectance = specularReflectance;
	}
}