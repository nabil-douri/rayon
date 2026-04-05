'use strict';

/**
 * ParallelTracer — persistent Web Worker pool for CPU ray tracing.
 *
 * Workers are created once and reused across frames. Scene data is broadcast
 * to all workers before tracing; only row-range messages are sent per chunk.
 *
 * Usage:
 *   const pt = new ParallelTracer('worker-raytracer.js', numWorkers, chunkSize);
 *   pt.broadcast({ cmd:'update', triSoa, lightSoa, ... });   // scene data
 *   await pt.trace(height, (startRow, endRow, pixels) => { ... });
 *   pt.terminate();   // free workers when done
 */
class ParallelTracer {
    constructor(workerScript, numWorkers, chunkSize) {
        this._workerScript = workerScript;
        this._numWorkers   = Math.max(1, numWorkers);
        this._chunkSize    = Math.max(1, chunkSize);
        this._workers      = [];
        this._busy         = false;
        this._spawn();
    }

    _spawn() {
        for (let i = 0; i < this._numWorkers; i++) {
            const w = new Worker(this._workerScript);
            w.onerror = (ev) => console.error('ParallelTracer worker error', ev);
            this._workers.push(w);
        }
    }

    /** Broadcast a message to every worker (fire-and-forget, no reply expected). */
    broadcast(msg) {
        for (const w of this._workers) w.postMessage(msg);
    }

    /**
     * Distribute rows [0, height) to workers in chunks of _chunkSize.
     * onChunkResult(startRow, endRow, pixels: Float32Array) is called on the
     * main thread as each chunk completes.
     * Returns a Promise that resolves when all chunks are finished.
     */
    trace(height, onChunkResult) {
        return new Promise((resolve, reject) => {
            if (this._workers.length === 0) { reject(new Error('No workers')); return; }

            let nextStart = 0;
            let active    = 0;

            const assign = (w) => {
                if (nextStart >= height) return false;
                const s = nextStart;
                const e = Math.min(height, s + this._chunkSize);
                nextStart = e;
                active++;
                w.postMessage({ cmd: 'trace', startRow: s, endRow: e });
                return true;
            };

            const makeHandler = (w) => (ev) => {
                const msg = ev.data;
                if (msg.pixels) {
                    try {
                        onChunkResult(msg.startRow, msg.endRow, new Float32Array(msg.pixels));
                    } catch (err) {
                        console.error('ParallelTracer: onChunkResult error', err);
                    }
                }
                active--;
                if (!assign(w) && active === 0) resolve();
            };

            for (const w of this._workers) {
                w.onmessage = makeHandler(w);
                assign(w);
            }
        });
    }

    /** Terminate all workers. Create a new ParallelTracer to use again. */
    terminate() {
        for (const w of this._workers) w.terminate();
        this._workers = [];
    }
}

window.ParallelTracer = ParallelTracer;
