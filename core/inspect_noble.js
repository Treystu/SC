import * as curve from "@noble/curves/ed25519.js";
console.log("Exports:", Object.keys(curve));
if (curve.ed25519) {
  console.log("ed25519 properties:", Object.keys(curve.ed25519));
  if (curve.ed25519.ExtendedPoint) {
    console.log("ed25519.ExtendedPoint exists");
  }
}
if (curve.ed25519 && curve.ed25519.utils) {
  console.log("ed25519.utils properties:", Object.keys(curve.ed25519.utils));
}
if (curve.x25519 && curve.x25519.utils) {
  console.log("x25519.utils properties:", Object.keys(curve.x25519.utils));
}
if (curve.ed25519.CURVE) {
  console.log("ed25519.CURVE exists");
  console.log("Fp:", !!curve.ed25519.CURVE.Fp);
} else {
  console.log("ed25519.CURVE MISSING");
  // Try identifying symbols?
}
if (curve.x25519) {
  console.log("x25519 properties:", Object.keys(curve.x25519));
}
if (curve.ExtendedPoint) {
  console.log("ExtendedPoint exported at top level");
}
