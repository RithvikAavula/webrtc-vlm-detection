import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { createPeer } from "./webrtc.js";
import { initDetector, detectLoop } from "./detection.js";
import { Metrics } from "./metrics.js";
import FpsChart from "./FpsChart.jsx";

export default function App() {
  const [roomId, setRoomId] = useState(
    () =>
      new URLSearchParams(location.search).get("room") ||
      Math.random().toString(36).slice(2, 8)
  );
  const [role, setRole] = useState(null);
  const [joined, setJoined] = useState(false);
  const [qrData, setQrData] = useState("");
  const videoRef = useRef();
  const canvasRef = useRef();
  const [metrics] = useState(() => new Metrics());

  // store peer handle so we can destroy later
  const peerRef = useRef(null);

  useEffect(() => {
    const url = `${location.origin}/?room=${roomId}`;
    QRCode.toDataURL(url).then(setQrData);
  }, [roomId]);

  async function start(roleSel) {
    // cleanup previous session if any
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }

    setRole(roleSel);
    const peer = await createPeer(
      roomId,
      roleSel,
      async (remoteStream) => {
        // attach remote video
        if (videoRef.current) {
          videoRef.current.srcObject = remoteStream;
          await videoRef.current.play().catch(() => {});
        }

        // start detection loop only for viewer (laptop)
        if (roleSel === "viewer") {
          const detector = await initDetector();
          detectLoop(videoRef.current, canvasRef.current, detector, metrics);
        }
      },
      metrics
    );

    peerRef.current = peer;
    setJoined(true);
  }

  function leave() {
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch {}
      peerRef.current = null;
    }
    if (videoRef.current) {
      try {
        videoRef.current.pause();
      } catch {}
      videoRef.current.srcObject = null;
    }
    setJoined(false);
    setRole(null);
  }

  async function saveMetrics() {
    await fetch("/metrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(metrics.summary()),
    });
    alert("metrics.json written");
  }

  return (
    <div>
      <h2>Real-time WebRTC Multi-Object Detection</h2>
      {qrData && <img id="qr" src={qrData} alt="QR" />}

      {!joined ? (
        <div>
          <button onClick={() => start("publisher")}>I am Phone</button>
          <button onClick={() => start("viewer")}>I am Laptop</button>
        </div>
      ) : (
        <button onClick={leave}>Leave</button>
      )}

      <div>
        <video ref={videoRef} playsInline muted={role !== "viewer"}></video>
        <canvas ref={canvasRef} width="480" height="360"></canvas>
      </div>

      <button onClick={saveMetrics}>Save metrics.json</button>

      {/* FPS chart */}
      <FpsChart metrics={metrics} />
    </div>
  );
}
