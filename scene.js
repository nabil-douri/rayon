class Scene {
    ambientStrength = 0.25;
    shininess = 256;
	lightSources = [];
	triangles = [];
	cubes = [];

    constructor() {
        this.createDefault();
    }

    createDefault() {
        // single bright white light
        this.lightSources.push(new LightSource(new Point(1000, 1000, 100), 1000000, new Color(1,1,1)));
        this.lightSources.push(new LightSource(new Point(-100, 100, -500), 1000000, new Color(1,1,1)));

        // one cube at Z=500
        const cube = new Cube(new Point(30,20,300), 40, new Color(0.2,0.6,0.9));
        this.cubes.push(cube);
        for (let t of cube.triangles) this.triangles.push(t);

        const cube2 = new Cube(new Point(-30,0,200), 40, new Color(0.9,0.2,0.6));
        this.cubes.push(cube2);
        for (let t of cube2.triangles) this.triangles.push(t);
    }

    // convenience setters
    setDiffuseAll(v) { for (let t of this.triangles) t.diffuseReflectance = v; }
    setSpecularAll(v) { for (let t of this.triangles) t.specularReflectance = v; }
}