'use strict';

/**
 * STL file loader — parses both binary and ASCII STL files and returns an
 * array of Triangle objects ready to be added to the ray-tracer engine.
 *
 * Usage (file-picker):
 *   STLLoader.fromFile(file, color, diffuse, specular, scale)
 *     .then(tris => engine.setMeshTriangles(tris));
 *
 * Usage (URL):
 *   STLLoader.fromURL('model.stl', color, diffuse, specular, scale)
 *     .then(tris => engine.setMeshTriangles(tris));
 *
 * Binary STL layout (per triangle, 50 bytes):
 *   12 bytes  normal  (skipped — Triangle ctor recomputes it)
 *   12 bytes  vertex 0
 *   12 bytes  vertex 1
 *   12 bytes  vertex 2
 *    2 bytes  attribute byte count (skipped)
 */
class STLLoader {

    /**
     * Parse an STL ArrayBuffer.  Returns Triangle[].
     * @param {ArrayBuffer} buffer
     * @param {Color}  color
     * @param {number} diffuse
     * @param {number} specular
     * @param {number} [scale=1]   uniform scale applied to every vertex
     * @param {Point}  [offset]    translation applied after scaling (optional)
     */
    static parse(buffer, color, diffuse, specular, scale = 1, offset = null) {
        return STLLoader._isBinary(buffer)
            ? STLLoader._parseBinary(buffer, color, diffuse, specular, scale, offset)
            : STLLoader._parseASCII( buffer, color, diffuse, specular, scale, offset);
    }

    /** Load from a File object (e.g. from <input type="file">). Returns Promise<Triangle[]>. */
    static fromFile(file, color, diffuse, specular, scale = 1, offset = null) {
        return file.arrayBuffer().then(buf =>
            STLLoader.parse(buf, color, diffuse, specular, scale, offset)
        );
    }

    /** Load from a URL (same-origin or CORS-enabled). Returns Promise<Triangle[]>. */
    static fromURL(url, color, diffuse, specular, scale = 1, offset = null) {
        return fetch(url)
            .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}: ${url}`); return r.arrayBuffer(); })
            .then(buf => STLLoader.parse(buf, color, diffuse, specular, scale, offset));
    }

    // ---- internal helpers -------------------------------------------------

    static _isBinary(buffer) {
        // Any non-ASCII byte in the first 512 bytes → binary
        const bytes = new Uint8Array(buffer, 0, Math.min(512, buffer.byteLength));
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] > 127) return true;
        }
        // Secondary check: binary triangle count must match file size exactly
        if (buffer.byteLength >= 84) {
            const nTri = new DataView(buffer).getUint32(80, true);
            if (84 + nTri * 50 === buffer.byteLength) return true;
        }
        return false;
    }

    static _pt(x, y, z, scale, offset) {
        x *= scale; y *= scale; z *= scale;
        if (offset) { x += offset.x; y += offset.y; z += offset.z; }
        return new Point(x, y, z);
    }

    static _parseBinary(buffer, color, diffuse, specular, scale, offset) {
        const view  = new DataView(buffer);
        const nTri  = Math.min(view.getUint32(80, true), Config.webgl.maxTriangles);
        const tris  = [];
        let o = 84; // skip 80-byte header + 4-byte count
        for (let i = 0; i < nTri; i++) {
            o += 12; // skip stored normal — Triangle ctor recomputes it from vertices
            const v0 = STLLoader._pt(view.getFloat32(o,    true), view.getFloat32(o+ 4, true), view.getFloat32(o+ 8, true), scale, offset); o += 12;
            const v1 = STLLoader._pt(view.getFloat32(o,    true), view.getFloat32(o+ 4, true), view.getFloat32(o+ 8, true), scale, offset); o += 12;
            const v2 = STLLoader._pt(view.getFloat32(o,    true), view.getFloat32(o+ 4, true), view.getFloat32(o+ 8, true), scale, offset); o += 12;
            o += 2; // skip attribute byte count
            tris.push(new Triangle(v0, v1, v2, color, diffuse, specular));
        }
        return tris;
    }

    static _parseASCII(buffer, color, diffuse, specular, scale, offset) {
        const text     = new TextDecoder().decode(buffer);
        const tris     = [];
        const facetRe  = /facet[\s\S]*?endfacet/g;
        const vertexRe = /vertex\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)\s+([\d.eE+\-]+)/g;
        let fm;
        while ((fm = facetRe.exec(text)) !== null && tris.length < Config.webgl.maxTriangles) {
            const verts = [];
            vertexRe.lastIndex = 0;
            let vm;
            while ((vm = vertexRe.exec(fm[0])) !== null) {
                verts.push(STLLoader._pt(
                    parseFloat(vm[1]), parseFloat(vm[2]), parseFloat(vm[3]),
                    scale, offset
                ));
            }
            if (verts.length === 3)
                tris.push(new Triangle(verts[0], verts[1], verts[2], color, diffuse, specular));
        }
        return tris;
    }
}

window.STLLoader = STLLoader;
