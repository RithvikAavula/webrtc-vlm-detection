export function drawBoxes(ctx, preds) {
    ctx.lineWidth = 2;
    ctx.font = "12px monospace";
    for (const p of preds) {
      const [x, y, w, h] = p.bbox;
      ctx.strokeStyle = "lime";
      ctx.fillStyle = "rgba(0,0,0,0.6)";
      ctx.strokeRect(x, y, w, h);
      const label = `${p.class} ${(p.score * 100).toFixed(1)}%`;
      const tw = ctx.measureText(label).width + 6;
      ctx.fillRect(x, y - 14, tw, 14);
      ctx.fillStyle = "white";
      ctx.fillText(label, x + 3, y - 3);
    }
  }
  