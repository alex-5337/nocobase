// html-docx-js internal module 65 IIFE resolves `global` as:
//   typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {}
//
// In Node 18+, `self` exists but lacks `Buffer`/`Blob`.
// In Node < 18, `self` is undefined and the IIFE creates an ephemeral `{}`,
// which we can never patch — so we CREATE `self` on globalThis instead.
import { Blob, Buffer } from 'buffer';

const g = globalThis as any;

if (typeof g.self === 'undefined') {
  // Node < 18: create global `self` with the needed polyfills
  g.self = { Buffer, Blob };
} else {
  // Node 18+: patch existing `self`
  if (typeof g.self.Buffer === 'undefined') {
    g.self.Buffer = Buffer;
  }
  if (typeof g.self.Blob === 'undefined') {
    g.self.Blob = Blob;
  }
}
