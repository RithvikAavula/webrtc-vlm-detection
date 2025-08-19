import * as tf from "@tensorflow/tfjs";
import * as wasm from "@tensorflow/tfjs-backend-wasm";   // import wasm explicitly
import * as cocoSsd from "@tensorflow-models/coco-ssd";
import { drawBoxes } from "./overlay.js";

// Tell TFJS where to load .wasm binaries from
wasm.setWasmPaths("/");   // files will be served from frontend/public/

export async function initDetector() {
  await tf.setBackend("wasm");
  await tf.ready();
  return await cocoSsd.load({ base: "lite_mobilenet_v2" });
}

export async function detectLoop(videoEl, canvasEl, model, metrics) {
  const ctx = canvasEl.getContext("2d");
  let lastTime = performance.now();

  async function tick() {
    const t0 = performance.now();
    ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);

    if (t0 - lastTime >= 100) {
      lastTime = t0;
      const preds = await model.detect(canvasEl, 10, 0.4); // detect up to 10 objects
      drawBoxes(ctx, preds);
      metrics.pushSample({
        overlayTs: performance.now(),
        predsCount: preds.length,
      });
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
