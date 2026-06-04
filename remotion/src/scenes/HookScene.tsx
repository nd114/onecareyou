import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, fonts } from "../theme";

// Opening hook — typographic, no screenshot
export const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const line1 = spring({ frame, fps, config: { damping: 22, stiffness: 110 } });
  const line2 = spring({ frame: frame - 30, fps, config: { damping: 22, stiffness: 110 } });
  const accent = spring({ frame: frame - 55, fps, config: { damping: 18, stiffness: 90 } });

  const outro = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames - 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "0 160px",
        opacity: outro,
      }}
    >
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 24,
          letterSpacing: 6,
          color: theme.primary,
          fontWeight: 600,
          marginBottom: 32,
          opacity: line1,
          transform: `translateY(${interpolate(line1, [0, 1], [20, 0])}px)`,
        }}
      >
        ONECARE · CONTINUOUS CARE PLATFORM
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 132,
          lineHeight: 0.98,
          color: theme.ink,
          fontWeight: 700,
          letterSpacing: -3,
          opacity: line1,
          transform: `translateY(${interpolate(line1, [0, 1], [40, 0])}px)`,
          maxWidth: 1500,
        }}
      >
        Care doesn't end<br />at discharge.
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 32,
          color: theme.mute,
          marginTop: 40,
          opacity: line2,
          transform: `translateY(${interpolate(line2, [0, 1], [24, 0])}px)`,
          maxWidth: 1200,
        }}
      >
        Most patients leave the hospital with a plan — and disappear from their doctor's view.
      </div>
      <div
        style={{
          marginTop: 56,
          height: 6,
          width: interpolate(accent, [0, 1], [0, 320]),
          background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
          borderRadius: 3,
        }}
      />
    </AbsoluteFill>
  );
};
