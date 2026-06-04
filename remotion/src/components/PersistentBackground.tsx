import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

export const PersistentBackground: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  // Slow drifting mesh
  const drift = interpolate(frame, [0, durationInFrames], [0, 1]);
  const x1 = 20 + Math.sin(drift * Math.PI * 2) * 8;
  const y1 = 30 + Math.cos(drift * Math.PI * 2) * 6;
  const x2 = 80 + Math.cos(drift * Math.PI * 2) * 8;
  const y2 = 70 + Math.sin(drift * Math.PI * 2) * 6;

  return (
    <AbsoluteFill style={{ background: theme.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${x1}% ${y1}%, ${theme.primary}33 0%, transparent 45%), radial-gradient(circle at ${x2}% ${y2}%, ${theme.accent}33 0%, transparent 50%)`,
        }}
      />
      {/* subtle grid */}
      <AbsoluteFill
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)",
          backgroundSize: "80px 80px",
          opacity: 0.5,
        }}
      />
      {/* vignette */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.55) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
