class Scene {
    ambientStrength = Config.scene.ambientStrength;
    shininess = Config.scene.shininess;
	lightSources = [];
	triangles = [];
	cubes = [];

    constructor() {
        this.createDefault();
    }

    createDefault() {
        for (const l of Config.lights) {
            this.lightSources.push(new LightSource(
                new Point(l.x, l.y, l.z), l.power, new Color(l.r, l.g, l.b)
            ));
        }
        for (const c of Config.cubes) {
            const cube = new Cube(
                new Point(c.x, c.y, c.z), c.size, new Color(c.r, c.g, c.b),
                Config.material.defaultDiffuse, Config.material.defaultSpecular
            );
            this.cubes.push(cube);
            for (const t of cube.triangles) this.triangles.push(t);
        }
    }

    // convenience setters
    setDiffuseAll(v) { for (let t of this.triangles) t.diffuseReflectance = v; }
    setSpecularAll(v) { for (let t of this.triangles) t.specularReflectance = v; }
}