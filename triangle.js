// https://www.scratchapixel.com/lessons/3d-basic-rendering/ray-tracing-rendering-a-triangle/geometry-of-a-triangle.html

class Triangle {
	// Vertices
	v0;
	v1;
	v2;
	edge1;
	edge2;
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
		this.edge1 = v1.minus(v0);
		this.edge2 = v2.minus(v0);
		this.normal = this.edge1.cross(this.edge2).normalize();
		
		this.color = color;
		this.diffuseReflectance = diffuseReflectance;
		this.specularReflectance = specularReflectance;
	}
}