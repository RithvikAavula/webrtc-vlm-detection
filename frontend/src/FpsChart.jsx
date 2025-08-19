import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";

export default function FpsChart({ metrics }) {
  const [data, setData] = useState([]);

  useEffect(() => {
    const iv = setInterval(() => {
      setData((prev) => [
        ...prev.slice(-20), // last 20 points
        { time: new Date().toLocaleTimeString(), fps: metrics.latest().fps },
      ]);
    }, 1000);
    return () => clearInterval(iv);
  }, [metrics]);

  return (
    <div>
      <h4>FPS (last ~20s)</h4>
      <LineChart width={480} height={220} data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="time" hide />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line type="monotone" dataKey="fps" dot={false} />
      </LineChart>
    </div>
  );
}
