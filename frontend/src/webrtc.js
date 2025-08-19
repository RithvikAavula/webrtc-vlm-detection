const WS_URL = `${location.origin.replace("http", "ws")}/ws`;

/**
 * @param {string} roomId
 * @param {"publisher"|"viewer"} role
 * @param {(stream: MediaStream) => void} onRemoteStream
 * @param {*} metrics  // optional: for latency
 */
export async function createPeer(roomId, role, onRemoteStream, metrics) {
  const pc = new RTCPeerConnection({ iceServers: [] });
  const ws = new WebSocket(WS_URL);

  // resources to cleanup
  let localStream = null;
  let debugVideoEl = null;
  let telemetryDC = null;
  let telemetryIv = null;
  let disconnectedTimer = null;
  let destroyed = false;

  // ---- destroy (idempotent) ----
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;

    // stop telemetry timer
    if (telemetryIv) {
      clearInterval(telemetryIv);
      telemetryIv = null;
    }

    // close datachannel
    try {
      if (telemetryDC && telemetryDC.readyState !== "closed") telemetryDC.close();
    } catch {}
    telemetryDC = null;

    // stop camera
    if (localStream) {
      try {
        localStream.getTracks().forEach((t) => t.stop());
      } catch {}
      localStream = null;
    }

    // remove debug video if we created it
    if (debugVideoEl && debugVideoEl.parentNode) {
      try { debugVideoEl.pause(); } catch {}
      debugVideoEl.srcObject = null;
      debugVideoEl.parentNode.removeChild(debugVideoEl);
    }
    debugVideoEl = null;

    // close peer
    try { pc.close(); } catch {}
    // close ws
    try { ws.close(); } catch {}

    if (disconnectedTimer) {
      clearTimeout(disconnectedTimer);
      disconnectedTimer = null;
    }

    // console.log("[webrtc] destroyed connection for room:", roomId);
  };

  // ---- signaling ----
  ws.addEventListener("open", () => {
    if (destroyed) return;
    ws.send(JSON.stringify({ type: "join", roomId }));
  });

  ws.addEventListener("message", async (ev) => {
    if (destroyed) return;
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "joined") return;

    try {
      if (msg.type === "offer" && role === "viewer") {
        await pc.setRemoteDescription(msg.sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        ws.send(JSON.stringify({ type: "answer", roomId, sdp: pc.localDescription }));
      } else if (msg.type === "answer" && role === "publisher") {
        await pc.setRemoteDescription(msg.sdp);
      } else if (msg.type === "ice") {
        try { await pc.addIceCandidate(msg.candidate); } catch {}
      }
    } catch (e) {
      console.warn("[webrtc] signaling error:", e);
      destroy();
    }
  });

  ws.addEventListener("close", () => destroy());
  ws.addEventListener("error", () => destroy());

  // ICE candidates
  pc.onicecandidate = (e) => {
    if (destroyed) return;
    if (e.candidate) {
      try {
        ws.send(JSON.stringify({ type: "ice", roomId, candidate: e.candidate }));
      } catch {
        destroy();
      }
    }
  };

  // remote media to app
  pc.ontrack = (e) => {
    if (destroyed) return;
    if (onRemoteStream && e.streams && e.streams[0]) {
      onRemoteStream(e.streams[0]);
    }
  };

  // connection lifecycle
  pc.onconnectionstatechange = () => {
    const st = pc.connectionState;
    if (st === "failed" || st === "closed") {
      destroy();
    }
  };

  pc.oniceconnectionstatechange = () => {
    const st = pc.iceConnectionState;
    if (st === "disconnected") {
      if (!disconnectedTimer) {
        disconnectedTimer = setTimeout(() => {
          destroy();
        }, 4000); // wait 4s before giving up
      }
    } else {
      if (disconnectedTimer) {
        clearTimeout(disconnectedTimer);
        disconnectedTimer = null;
      }
    }
  };

  if (role === "publisher") {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    // (debug) local preview on phone
    debugVideoEl = document.getElementById("___local_preview");
    if (!debugVideoEl) {
      debugVideoEl = document.createElement("video");
      debugVideoEl.id = "___local_preview";
      debugVideoEl.autoplay = true;
      debugVideoEl.muted = true;
      debugVideoEl.playsInline = true;
      debugVideoEl.style.width = "1px";
      debugVideoEl.style.height = "1px";
      debugVideoEl.style.opacity = "0";
      document.body.appendChild(debugVideoEl);
    }
    debugVideoEl.srcObject = localStream;

    for (const track of localStream.getTracks()) pc.addTrack(track, localStream);

    // latency pings via DataChannel
    telemetryDC = pc.createDataChannel("telemetry");
    telemetryDC.onopen = () => {
      telemetryIv = setInterval(() => {
        if (telemetryDC && telemetryDC.readyState === "open") {
          telemetryDC.send(JSON.stringify({ type: "ts", t: Date.now() }));
        }
      }, 1000);
    };
    telemetryDC.onclose = () => {
      if (telemetryIv) {
        clearInterval(telemetryIv);
        telemetryIv = null;
      }
    };

    // make an offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    ws.send(JSON.stringify({ type: "offer", roomId, sdp: pc.localDescription }));
  } else {
    // viewer: receive DC for telemetry
    pc.ondatachannel = (e) => {
      const dc = e.channel;
      if (dc.label === "telemetry") {
        dc.onmessage = (evt) => {
          if (destroyed) return;
          try {
            const msg = JSON.parse(evt.data);
            if (msg.type === "ts" && metrics) {
              const latencyMs = Date.now() - msg.t;
              metrics.pushSample({ latencyMs });
            }
          } catch {}
        };
      }
    };
  }

  // cleanup on tab close / refresh
  window.addEventListener("beforeunload", destroy, { once: true });

  return { pc, ws, destroy };
}
