// Jest setup file for ESM support
// This file ensures Jest globals are available in all test files when using experimental-vm-modules


// Jest globals are already available in the test environment.
// If needed, assign globalThis.jest only if not present.
if (typeof globalThis.jest === 'undefined') {
    globalThis.jest = require('@jest/globals').jest;
}
const util = require('node:util');

jest.mock('./src/database.js', () => ({
    getDatabase: jest.fn().mockResolvedValue(null),
    Database: jest.fn()
}));

// Debug helper: when tests finish, print active handles to help locate leaks.
// If `TEST_HANDLE_STACKS=1` is set, also print creation stacks using
// `why-is-node-running` for deeper tracing.
if (process.env.NODE_ENV === 'test' && typeof process._getActiveHandles === 'function') {
    afterAll(async () => {
        try {
            const handles = process._getActiveHandles();
            // Filter obvious internals and print a summary
            const summary = [];
            for (const h of handles) {
                const type = h && h.constructor && h.constructor.name ? h.constructor.name : typeof h;
                const entry = { type };
                try {
                    // Common socket-ish fields
                    if (typeof h.remoteAddress !== 'undefined' || typeof h.remotePort !== 'undefined') {
                        entry.remoteAddress = h.remoteAddress;
                        entry.remotePort = h.remotePort;
                    }
                    if (typeof h.localAddress !== 'undefined' || typeof h.localPort !== 'undefined') {
                        entry.localAddress = h.localAddress;
                        entry.localPort = h.localPort;
                    }
                    // address() method (Server/Socket)
                    if (typeof h.address === 'function') {
                        try {
                            entry.address = h.address();
                        } catch (e) {
                            // ignore
                        }
                    }
                    if (type === 'Pipe' && h.path) entry.path = h.path;
                    // Some handles expose a readable/writable flag
                    if (typeof h.readable !== 'undefined') entry.readable = h.readable;
                    if (typeof h.writable !== 'undefined') entry.writable = h.writable;

                    // Include a short object dump for deeper inspection
                    entry.inspect = util.inspect(h, { showHidden: true, depth: 1 });
                } catch (e) {
                    // ignore introspection errors
                    entry.inspectError = String(e);
                }
                summary.push(entry);
            }

            // Print a concise list for debugging
            // eslint-disable-next-line no-console
            console.log('[TEST-DEBUG] Active handles at exit (detailed):');
            // eslint-disable-next-line no-console
            console.log(JSON.stringify(summary, null, 2));

            // Optionally print creation stacks using why-is-node-running for deeper traces
            if (process.env.TEST_HANDLE_STACKS) {
                try {
                    // dynamic import to avoid hard dependency unless requested
                    const why = await import('why-is-node-running');
                    // eslint-disable-next-line no-console
                    console.log('[TEST-DEBUG] Running why-is-node-running to get handle stacks...');
                    // Call the module (default export) which prints stacks
                    // It may return a function; ensure it's callable
                    const fn = why && (why.default || why) ;
                    if (typeof fn === 'function') {
                        fn();
                    }
                } catch (e) {
                    // eslint-disable-next-line no-console
                    console.error('[TEST-DEBUG] why-is-node-running failed:', e && e.stack ? e.stack : e);
                }
            }
        } catch (e) {
            // ignore
        }
    });
}
