// Worker for ray tracing a block of rows.
// Receives a message {cmd: 'trace', startRow, endRow, width, height, rayVectors, cameraPos, triangles, lightSources, scene}

function vec(x=0,y=0,z=0){return {x,y,z};}
function minus(a,b){return {x: a.x-b.x, y: a.y-b.y, z: a.z-b.z};} 
function plus(a,b){return {x: a.x+b.x, y: a.y+b.y, z: a.z+b.z};} 
function scale(a,s){return {x: a.x*s, y: a.y*s, z: a.z*s};} 
function dot(a,b){return a.x*b.x + a.y*b.y + a.z*b.z;} 
function cross(a,b){return {x: a.y*b.z - a.z*b.y, y: a.z*b.x - a.x*b.z, z: a.x*b.y - a.y*b.x};} 
function norm2(a){return dot(a,a);} 
function normalize(a){const n=Math.sqrt(norm2(a)); if(n===0) return {x:0,y:0,z:0}; return scale(a,1/n);} 

function clamp01(v){ return Math.max(0, Math.min(1, v)); }

let _triangles = [];
let _lightSources = [];
let _scene = {ambientStrength:0.2, shininess:32};
let _cameraPos = {x:0,y:0,z:0};
let _cameraParams = null; // {definitionH, definitionV, pixelSize, focalLength}

onmessage = function(e){
    const msg = e.data;
    if (msg.cmd === 'update') {
        // store scene data for subsequent trace jobs
        _triangles = msg.triangles || _triangles;
        _lightSources = msg.lightSources || _lightSources;
        _scene = msg.scene || _scene;
        _cameraPos = msg.cameraPos || _cameraPos;
        _cameraParams = msg.cameraParams || _cameraParams;
        // acknowledge
        postMessage({ cmd: 'updated' });
        return;
    }
    if(msg.cmd !== 'trace') return;
    const startRow = msg.startRow;
    const endRow = msg.endRow;
    const width = msg.width;
    const height = msg.height;
    const rayVectors = msg.rayVectors || null; // keep for compatibility
    const cameraPos = _cameraPos;
    const triangles = _triangles;
    const lightSources = _lightSources;
    const scene = _scene || {ambientStrength:0.2, shininess:32};

    const EPSILON = 1e-6;
    const rows = endRow - startRow;
    const out = new Float32Array(rows * width * 3);
    let outOff = 0;

    for(let row = startRow; row < endRow; row++){
        for(let col = 0; col < width; col++){
            let dirVec = null;
            if (rayVectors) {
                const rv = (rayVectors[row] && rayVectors[row][col]) || (rayVectors[row - startRow] && rayVectors[row - startRow][col]);
                if (rv) dirVec = normalize(rv);
            }
            if (!dirVec) {
                // compute ray direction from camera params if available
                if (!_cameraParams) { out[outOff++]=0; out[outOff++]=0; out[outOff++]=0; continue; }
                const defH = _cameraParams.definitionH;
                const defV = _cameraParams.definitionV;
                const pixelSize = _cameraParams.pixelSize;
                const focalLength = _cameraParams.focalLength;
                const cx = (defH - 1) / 2.0;
                const cy = (defV - 1) / 2.0;
                const pixelX = (col - cx) * pixelSize;
                const pixelY = -(row - cy) * pixelSize;
                const pixelZ = focalLength;
                const pixelPoint = { x: pixelX, y: pixelY, z: pixelZ };
                dirVec = normalize(minus(pixelPoint, cameraPos));
            }
            const dir = dirVec;

            let closestT = Infinity; let hitTri = null;
            for(let i=0;i<triangles.length;i++){
                const tri = triangles[i];
                const v0 = tri.v0, v1 = tri.v1, v2 = tri.v2;
                const edge1 = minus(v1,v0);
                const edge2 = minus(v2,v0);
                const h = cross(dir, edge2);
                const a = dot(edge1, h);
                if (a > -EPSILON && a < EPSILON) continue;
                const f = 1.0 / a;
                const s = minus(cameraPos, v0);
                const u = f * dot(s, h);
                if (u < 0.0 || u > 1.0) continue;
                const q = cross(s, edge1);
                const v = f * dot(dir, q);
                if (v < 0.0 || u + v > 1.0) continue;
                const t = f * dot(edge2, q);
                if (t > EPSILON && t < closestT){ closestT = t; hitTri = tri; }
            }

            if(!hitTri){ out[outOff++]=0; out[outOff++]=0; out[outOff++]=0; continue; }

            const P = plus(cameraPos, scale(dir, closestT));

            // illumination
            const triNormal = normalize(hitTri.normal);
            let finalR = hitTri.color.r * (scene.ambientStrength||0.2);
            let finalG = hitTri.color.g * (scene.ambientStrength||0.2);
            let finalB = hitTri.color.b * (scene.ambientStrength||0.2);
            const viewDir = normalize(minus(cameraPos, P));
            const shininess = scene.shininess || 32;

            for(let li=0; li<lightSources.length; li++){
                const light = lightSources[li];
                const PtoLight = minus(light.position, P);
                const PtoLightDist2 = norm2(PtoLight);
                const L = normalize(PtoLight);
                const NdotL = Math.max(0, dot(triNormal, L));
                const diffuse = (hitTri.diffuseReflectance || 1) * NdotL;
                const R = normalize( minus( scale(triNormal, 2 * dot(triNormal, L)), L) );
                const specAngle = Math.max(0, dot(R, viewDir));
                const spec = (hitTri.specularReflectance || 0) * Math.pow(specAngle, shininess);
                const attenuation = (light.power || 1) / (PtoLightDist2 + 1);
                const lightR = light.color.r * attenuation;
                const lightG = light.color.g * attenuation;
                const lightB = light.color.b * attenuation;

                finalR += (hitTri.color.r * lightR) * diffuse + lightR * spec;
                finalG += (hitTri.color.g * lightG) * diffuse + lightG * spec;
                finalB += (hitTri.color.b * lightB) * diffuse + lightB * spec;
            }

            out[outOff++] = clamp01(finalR);
            out[outOff++] = clamp01(finalG);
            out[outOff++] = clamp01(finalB);
        }
    }

    postMessage({startRow, endRow, width, height, pixels: out}, [out.buffer]);
};
