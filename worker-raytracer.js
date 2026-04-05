'use strict';
// Worker for ray tracing a block of rows using the engine's compact SOA buffers.
//
// Protocol:
//   update { cmd:'update', triSoa, lightSoa, triCount, lightCount,
//             cam:{pixelSize,focalLength,definitionH,definitionV},
//             rot9 (Float32Array[9], column-major 3x3, same layout as webgl-renderer),
//             scene:{ambientStrength,shininess} }
//     ? stores scene data; no reply.
//
//   trace  { cmd:'trace', startRow, endRow }
//     ? postMessage({ startRow, endRow, pixels: Float32Array }) [transferred]
//
// triSoa layout (20 floats per triangle, index base = i*20):
//   [0..2]  s.xyz  (camOrigin-v0)   [3]  0
//   [4..6]  e1.xyz                   [7]  0
//   [8..10] e2.xyz                  [11]  0
//   [12..14] n.xyz                  [15]  specular
//   [16..18] color.rgb              [19]  diffuse
//
// lightSoa layout (8 floats per light, index base = j*8):
//   [0..2] pos.xyz (camera-relative) [3] power
//   [4..6] color.rgb                  [7] 0

let _triSoa     = null;
let _lightSoa   = null;
let _triCount   = 0;
let _lightCount = 0;
let _cam        = { pixelSize: 1, focalLength: 1000, definitionH: 960, definitionV: 480 };
let _rot9       = null;  // Float32Array(9) or null for identity
let _scene      = { ambientStrength: 0.25, shininess: 256 };

onmessage = function(e) {
    const msg = e.data;

    if (msg.cmd === 'update') {
        _triSoa     = msg.triSoa;
        _lightSoa   = msg.lightSoa;
        _triCount   = msg.triCount   | 0;
        _lightCount = msg.lightCount | 0;
        _cam        = msg.cam;
        _rot9       = msg.rot9 || null;
        _scene      = msg.scene;
        return;
    }

    if (msg.cmd !== 'trace') return;

    const startRow = msg.startRow | 0;
    const endRow   = msg.endRow   | 0;
    const { pixelSize, focalLength, definitionH: width, definitionV: height } = _cam;
    const centerX   = width  * 0.5;
    const centerY   = height * 0.5;
    const ambient   = _scene.ambientStrength;
    const shininess = _scene.shininess;
    const EPSILON   = 1e-6;
    const rows      = endRow - startRow;
    const out       = new Float32Array(rows * width * 3);
    let   outOff    = 0;

    for (let row = startRow; row < endRow; row++) {
        for (let col = 0; col < width; col++) {

            // ---- Build normalised ray direction ----
            let dx =  (col - centerX) * pixelSize;
            let dy = -(row - centerY) * pixelSize;
            let dz =  focalLength;
            if (_rot9) {
                const r = _rot9;
                const tx = r[0]*dx + r[3]*dy + r[6]*dz;
                const ty = r[1]*dx + r[4]*dy + r[7]*dz;
                const tz = r[2]*dx + r[5]*dy + r[8]*dz;
                dx = tx; dy = ty; dz = tz;
            }
            const invLen = 1.0 / Math.sqrt(dx*dx + dy*dy + dz*dz);
            dx *= invLen; dy *= invLen; dz *= invLen;

            // ---- Möller–Trumbore intersection ----
            let closestT = Infinity;
            let hitTri   = -1;

            for (let i = 0; i < _triCount; i++) {
                const b   = i * 20;
                const sx  = _triSoa[b],    sy  = _triSoa[b+1],  sz  = _triSoa[b+2];
                const e1x = _triSoa[b+4],  e1y = _triSoa[b+5],  e1z = _triSoa[b+6];
                const e2x = _triSoa[b+8],  e2y = _triSoa[b+9],  e2z = _triSoa[b+10];

                const hx = dy*e2z - dz*e2y;
                const hy = dz*e2x - dx*e2z;
                const hz = dx*e2y - dy*e2x;
                const a  = e1x*hx + e1y*hy + e1z*hz;
                if (a > -EPSILON && a < EPSILON) continue;

                const f = 1.0 / a;
                const u = f * (sx*hx + sy*hy + sz*hz);
                if (u < 0.0 || u > 1.0) continue;

                const qx = sy*e1z - sz*e1y;
                const qy = sz*e1x - sx*e1z;
                const qz = sx*e1y - sy*e1x;
                const v  = f * (dx*qx + dy*qy + dz*qz);
                if (v < 0.0 || u+v > 1.0) continue;

                const t = f * (e2x*qx + e2y*qy + e2z*qz);
                if (t > EPSILON && t < closestT) { closestT = t; hitTri = i; }
            }

            if (hitTri < 0) { out[outOff++]=0; out[outOff++]=0; out[outOff++]=0; continue; }

            // ---- Phong illumination ----
            const b    = hitTri * 20;
            const nx   = _triSoa[b+12], ny   = _triSoa[b+13], nz   = _triSoa[b+14];
            const spec = _triSoa[b+15];
            const cr   = _triSoa[b+16], cg   = _triSoa[b+17], cb   = _triSoa[b+18];
            const diff = _triSoa[b+19];

            const Px = dx*closestT, Py = dy*closestT, Pz = dz*closestT;
            // view = normalize(-P); since dir is normalised, normalize(-dir*t) = -dir
            const vx = -dx, vy = -dy, vz = -dz;

            let r = cr * ambient;
            let g = cg * ambient;
            let bl = cb * ambient;

            for (let li = 0; li < _lightCount; li++) {
                const lb   = li * 8;
                const lx   = _lightSoa[lb]   - Px;
                const ly   = _lightSoa[lb+1] - Py;
                const lz   = _lightSoa[lb+2] - Pz;
                const lpow = _lightSoa[lb+3];
                const lcr  = _lightSoa[lb+4];
                const lcg  = _lightSoa[lb+5];
                const lcb  = _lightSoa[lb+6];

                const dist2  = lx*lx + ly*ly + lz*lz;
                const invLD  = 1.0 / Math.sqrt(dist2 + 1e-30);
                const Lx = lx*invLD, Ly = ly*invLD, Lz = lz*invLD;

                const NdotL  = Math.max(0, nx*Lx + ny*Ly + nz*Lz);
                const diffuse = diff * NdotL;

                const rx2 = 2*NdotL*nx - Lx;
                const ry2 = 2*NdotL*ny - Ly;
                const rz2 = 2*NdotL*nz - Lz;
                const rlen = Math.sqrt(rx2*rx2 + ry2*ry2 + rz2*rz2);
                let Rx=0, Ry=0, Rz=0;
                if (rlen > 0) { const inv=1/rlen; Rx=rx2*inv; Ry=ry2*inv; Rz=rz2*inv; }

                const specAngle = Math.max(0, Rx*vx + Ry*vy + Rz*vz);
                const specular  = spec * Math.pow(specAngle, shininess);

                const atten = lpow / (dist2 + 1);
                const lr = lcr*atten, lg = lcg*atten, lbv = lcb*atten;

                r  += cr*lr*diffuse + lr*specular;
                g  += cg*lg*diffuse + lg*specular;
                bl += cb*lbv*diffuse + lbv*specular;
            }

            out[outOff++] = Math.max(0, Math.min(1, r));
            out[outOff++] = Math.max(0, Math.min(1, g));
            out[outOff++] = Math.max(0, Math.min(1, bl));
        }
    }

    postMessage({ startRow, endRow, pixels: out }, [out.buffer]);
};
