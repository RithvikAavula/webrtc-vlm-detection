export class Metrics {
  constructor() {
    this.samples = [];            // mixed: {overlayTs,...} and/or {latencyMs}
    this.windowStart = performance.now();
  }

  pushSample(s) {
    this.samples.push(s);
  }

  latest() {
    const dur = (performance.now() - this.windowStart) / 1000;
    const fps = dur > 0 ? this.samples.length / dur : 0;
    return {
      windowSec: +dur.toFixed(2),
      samples: this.samples.length,
      fps: +fps.toFixed(2),
    };
  }

  summary() {
    // pull latencies out of mixed samples
    const latencies = this.samples.map((s) => s.latencyMs).filter((v) => typeof v === "number");
    let median = null, p95 = null;
    if (latencies.length) {
      const sorted = [...latencies].sort((a, b) => a - b);
      const idxMed = Math.floor(sorted.length * 0.5);
      const idx95 = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
      median = sorted[idxMed];
      p95 = sorted[idx95];
    }

    return {
      mode: "wasm",
      processed_fps: this.latest().fps,
      e2e_latency_ms: { median, p95 },
      uplink_kbps: null,
      downlink_kbps: null,
    };
  }

  async save() {
    try {
      const res = await fetch("/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.summary()),
      });
      if (res.ok) {
        alert("✅ Metrics saved to metrics.json");
      } else {
        alert("❌ Failed to save metrics");
      }
    } catch (err) {
      console.error("Error saving metrics:", err);
      alert("❌ Error saving metrics, check console");
    }
  }
}
