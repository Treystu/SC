// Jest setup file for ESM support
// This file ensures Jest globals are available in all test files when using experimental-vm-modules

// Jest globals are already available in the test environment.
// If needed, assign globalThis.jest only if not present.
if (typeof globalThis.jest === "undefined") {
  globalThis.jest = require("@jest/globals").jest;
}

// Provide TextEncoder/TextDecoder globals for test environments that don't expose them
if (
  typeof globalThis.TextEncoder === "undefined" ||
  typeof globalThis.TextDecoder === "undefined"
) {
  try {
    const { TextEncoder, TextDecoder } = require("util");
    if (typeof globalThis.TextEncoder === "undefined")
      globalThis.TextEncoder = TextEncoder;
    if (typeof globalThis.TextDecoder === "undefined")
      globalThis.TextDecoder = TextDecoder;
  } catch (e) {
    // ignore if util.TextEncoder is unavailable
  }
}

// Provide Web Crypto `crypto.subtle` using Node's webcrypto if unavailable
if (
  typeof globalThis.crypto === "undefined" ||
  typeof globalThis.crypto.subtle === "undefined"
) {
  try {
    const nodeCrypto = require("crypto");
    if (nodeCrypto && nodeCrypto.webcrypto) {
      globalThis.crypto = nodeCrypto.webcrypto;
    }
  } catch (e) {
    // ignore if webcrypto isn't available
  }
}

// Minimal RTCPeerConnection mock for jsdom environment used by Jest.
if (typeof globalThis.RTCPeerConnection === "undefined") {
  class MockRTCPeerConnection {
    constructor() {
      this.connectionState = "new";
      this.iceGatheringState = "complete";
      this.iceConnectionState = "new";
      this._listeners = {};
      this.onicecandidate = null;
      this._channels = {};
    }
    addEventListener(event, fn) {
      (this._listeners[event] = this._listeners[event] || []).push(fn);
    }
    removeEventListener(event, fn) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter((x) => x !== fn);
    }
    _emit(event, detail) {
      const list = this._listeners[event] || [];
      for (const fn of list)
        try {
          fn(detail);
        } catch (e) {}
    }
    createOffer() {
      return Promise.resolve({ type: "offer", sdp: "v=0\n" });
    }
    createAnswer() {
      return Promise.resolve({ type: "answer", sdp: "v=0\n" });
    }
    setLocalDescription(desc) {
      this.localDescription = desc;
      return Promise.resolve();
    }
    setRemoteDescription(desc) {
      this.remoteDescription = desc;
      return Promise.resolve();
    }
    addTrack() {
      /* noop */
    }
    close() {
      this.connectionState = "closed";
      this.iceConnectionState = "closed";
    }
    createDataChannel(label, opts) {
      const channel = {
        label,
        ...opts,
        readyState: "open",
        ordered: opts?.ordered ?? true,
        maxRetransmits: opts?.maxRetransmits ?? null,
        send: () => {},
        close: () => {
          channel.readyState = "closed";
        },
        addEventListener: (event, cb) => {
          (this._listeners[event] = this._listeners[event] || []).push(cb);
        },
        removeEventListener: () => {},
      };
      this._channels[label] = channel;
      return channel;
    }
    getChannel(label) {
      return this._channels[label];
    }
  }
  globalThis.RTCPeerConnection = MockRTCPeerConnection;
  globalThis.RTCSessionDescription = class {
    constructor(init) {
      Object.assign(this, init);
    }
  };
}
