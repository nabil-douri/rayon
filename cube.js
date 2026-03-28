class Cube {
    // center: Point, size: number, color: Color
    center;
    size;
    color;
    baseVertices = [];
    triangles = [];
    triVertexIndices = [];

    constructor(center, size, color, diffuseReflectance=0.5, specularReflectance=0.5) {
        this.center = center;
        this.size = size;
        this.color = color;

        const h = size / 2;
        const verts = [
            new Point(center.x - h, center.y - h, center.z - h), // 0
            new Point(center.x + h, center.y - h, center.z - h), // 1
            new Point(center.x + h, center.y + h, center.z - h), // 2
            new Point(center.x - h, center.y + h, center.z - h), // 3
            new Point(center.x - h, center.y - h, center.z + h), // 4
            new Point(center.x + h, center.y - h, center.z + h), // 5
            new Point(center.x + h, center.y + h, center.z + h), // 6
            new Point(center.x - h, center.y + h, center.z + h)  // 7
        ];

        const faces = [
            [4,5,6], [4,6,7], // front +z
            [0,2,1], [0,3,2], // back -z
            [0,4,5], [0,5,1], // bottom -y
            [3,2,6], [3,6,7], // top +y
            [0,3,7], [0,7,4], // left -x
            [1,5,6], [1,6,2]  // right +x
        ];

        this.baseVertices = verts;
        this.triVertexIndices = faces;

        for (let fi = 0; fi < faces.length; fi++) {
            const idx = faces[fi];
            const t = new Triangle(
                new Point(verts[idx[0]].x, verts[idx[0]].y, verts[idx[0]].z),
                new Point(verts[idx[1]].x, verts[idx[1]].y, verts[idx[1]].z),
                new Point(verts[idx[2]].x, verts[idx[2]].y, verts[idx[2]].z),
                color,
                diffuseReflectance,
                specularReflectance
            );
            this.triangles.push(t);
        }
    }

    // rotate a point around center by ax,ay,az radians
    rotatePoint(p, ax, ay, az) {
        let x = p.x - this.center.x;
        let y = p.y - this.center.y;
        let z = p.z - this.center.z;

        if (ax !== 0) {
            const ca = Math.cos(ax), sa = Math.sin(ax);
            const y1 = y * ca - z * sa;
            const z1 = y * sa + z * ca;
            y = y1; z = z1;
        }
        if (ay !== 0) {
            const cb = Math.cos(ay), sb = Math.sin(ay);
            const x1 = x * cb + z * sb;
            const z1 = -x * sb + z * cb;
            x = x1; z = z1;
        }
        if (az !== 0) {
            const cc = Math.cos(az), sc = Math.sin(az);
            const x1 = x * cc - y * sc;
            const y1 = x * sc + y * cc;
            x = x1; y = y1;
        }

        return new Point(x + this.center.x, y + this.center.y, z + this.center.z);
    }

    // rotate the cube and update triangle vertices and normals
    rotate(ax, ay, az) {
        // Build combined rotation matrix (Rz * Ry * Rx)
        const ca = Math.cos(ax), sa = Math.sin(ax);
        const cb = Math.cos(ay), sb = Math.sin(ay);
        const cc = Math.cos(az), sc = Math.sin(az);

        // Rotation about X (ax), Y (ay), Z (az) combined
        // Compute R = Rz * Ry * Rx (row-major)
        const r00 = cc * cb;
        const r01 = cc * sb * sa - sc * ca;
        const r02 = cc * sb * ca + sc * sa;

        const r10 = sc * cb;
        const r11 = sc * sb * sa + cc * ca;
        const r12 = sc * sb * ca - cc * sa;

        const r20 = -sb;
        const r21 = cb * sa;
        const r22 = cb * ca;

        const rotated = new Array(this.baseVertices.length);
        for (let vi = 0; vi < this.baseVertices.length; vi++) {
            const v = this.baseVertices[vi];
            let x = v.x - this.center.x;
            let y = v.y - this.center.y;
            let z = v.z - this.center.z;
            const nx = r00 * x + r01 * y + r02 * z;
            const ny = r10 * x + r11 * y + r12 * z;
            const nz = r20 * x + r21 * y + r22 * z;
            rotated[vi] = new Point(nx + this.center.x, ny + this.center.y, nz + this.center.z);
        }

        for (let i = 0; i < this.triangles.length; i++) {
            const tri = this.triangles[i];
            const idx = this.triVertexIndices[i];
            tri.v0 = rotated[idx[0]];
            tri.v1 = rotated[idx[1]];
            tri.v2 = rotated[idx[2]];
            tri.edge1 = tri.v1.minus(tri.v0);
            tri.edge2 = tri.v2.minus(tri.v0);
            tri.normal = tri.edge1.cross(tri.edge2).normalize();
        }
    }
}
