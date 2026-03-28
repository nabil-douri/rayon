// Minimal Parallel.For-like helper using Web Worker pool with dynamic chunking.
// Usage:
// parallelFor({start:0, end:height, workerScript:'worker-raytracer.js', numWorkers, chunkSize,
//   payloadBase, onChunkResult: (startRow,endRow,pixels)=>{...} })

function parallelFor(options) {
    const start = options.start || 0;
    const end = options.end || 0;
    const workerScript = options.workerScript;
    const numWorkers = options.numWorkers || navigator.hardwareConcurrency || 4;
    const chunkSize = options.chunkSize || 8;
    const payloadBase = options.payloadBase || {};
    const onChunkResult = options.onChunkResult || function(){};

    return new Promise((resolve, reject) => {
        if (typeof Worker === 'undefined') {
            reject(new Error('Workers not supported'));
            return;
        }

        let nextStart = start;
        let active = 0;
        let finished = false;
        const workers = [];

        function assignWork(w, id) {
            if (nextStart >= end) {
                // tell worker no more work
                return;
            }
            const s = nextStart;
            const e = Math.min(end, s + chunkSize);
            nextStart = e;
            active++;
            const payload = Object.assign({}, payloadBase, { startRow: s, endRow: e, rayVectors: (payloadBase.rayVectors||[]).slice(s, e) });
            w.postMessage(Object.assign({ cmd: 'trace', width: options.width, height: options.height }, payload));
        }

        function makeWorker(i) {
            const w = new Worker(workerScript);
            w.onmessage = (ev) => {
                try {
                    const msg = ev.data;
                    onChunkResult(msg.startRow, msg.endRow, new Float32Array(msg.pixels));
                } catch (err) {
                    console.error('Error processing chunk result', err);
                }
                active--;
                if (nextStart < end) {
                    assignWork(w, i);
                } else if (active === 0) {
                    // all done
                    finished = true;
                    cleanup();
                    resolve();
                }
            };
            w.onerror = (ev) => {
                console.error('Worker error', ev);
                cleanup();
                reject(ev);
            };
            workers.push(w);
            assignWork(w, i);
        }

        function cleanup() {
            for (const w of workers) try { w.terminate(); } catch(e){}
        }

        for (let i = 0; i < numWorkers; i++) makeWorker(i);
    });
}

// Export to global for simple inclusion
window.parallelFor = parallelFor;
