// Source of the sandboxed plugin worker. Served by /plugin-worker.js with a strict
// Content-Security-Policy so the BROWSER (not just our script) blocks all network access,
// including dynamic import(), which no amount of deleting globals can stop.
export const PLUGIN_WORKER_SOURCE = `
      // Plugins are pure (pixels, params) -> pixels. Remove every way to reach the network or load
      // other code, and make the removal permanent so plugin code cannot put it back.
      (function lockdown() {
        var names = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts',
          'indexedDB', 'caches', 'BroadcastChannel', 'SharedWorker', 'Worker', 'WebTransport',
          'navigator', 'close', 'Request', 'Response', 'Headers', 'FileReaderSync', 'webkitRequestFileSystem',
          'WorkerNavigator', 'Cache', 'CacheStorage', 'IDBFactory', 'XMLHttpRequestEventTarget', 'XMLHttpRequestUpload'];
        // The originals also live on the prototype chain (WorkerGlobalScope.prototype etc.), so
        // shadowing only 'self' is not enough: remove them from every object on the chain.
        var seen = [];
        var o = self;
        while (o && seen.indexOf(o) === -1) {
          seen.push(o);
          names.forEach(function (n) {
            try {
              if (Object.prototype.hasOwnProperty.call(o, n)) {
                Object.defineProperty(o, n, { value: undefined, writable: false, configurable: false });
              }
            } catch (_) {
              try { delete o[n]; } catch (__) {}
            }
          });
          o = Object.getPrototypeOf(o);
        }
        // Make sure 'self' itself shadows every name even if it had no own property.
        names.forEach(function (n) {
          try { Object.defineProperty(self, n, { value: undefined, writable: false, configurable: false }); } catch (_) {}
        });
        try { Object.defineProperty(self, 'postMessage', { value: self.postMessage.bind(self), writable: false, configurable: false }); } catch (_) {}
        // Block constructor-based escapes to a fresh Function/eval bound to the real global.
        try { Object.freeze(Object.prototype); } catch (_) {}
      })();
      self.onmessage = function(e) {
        var d = e.data || {};
        if (d.type === 'run') {
          try {
            var data = new Uint8ClampedArray(d.buffer);
            var ctx = { width: d.width, height: d.height, data: data, params: d.params || {} };
            var fn = new Function('ctx', d.code);
            var start = Date.now();
            fn(ctx);
            self.postMessage({ id: d.id, ok: true, buffer: data.buffer, ms: Date.now() - start }, [data.buffer]);
          } catch (err) {
            self.postMessage({ id: d.id, ok: false, error: String(err && err.message || err) });
          }
        }
      };
    `;

/**
 * connect-src 'none' blocks fetch/XHR/WebSocket/EventSource AND import() inside the worker.
 * script-src needs 'unsafe-eval' only because plugins are compiled with new Function(); the
 * worker has no DOM, no storage and no network, so eval here cannot reach anything.
 */
export const PLUGIN_WORKER_CSP =
  "default-src 'none'; connect-src 'none'; script-src 'self' 'unsafe-eval'; worker-src 'none'; " +
  "img-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
