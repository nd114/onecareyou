import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, fonts } from "../theme";

export const ClosingScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const logo = spring({ frame, fps, config: { damping: 20, stiffness: 110 } });
  const tag = spring({ frame: frame - 18, fps, config: { damping: 22, stiffness: 100 } });
  const url = spring({ frame: frame - 40, fps, config: { damping: 22 } });

  const outro = interpolate(
    frame,
    [durationInFrames - 14, durationInFrames - 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{ alignItems: "center", justifyContent: "center", opacity: outro }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 28,
          opacity: logo,
          transform: `scale(${interpolate(logo, [0, 1], [0.85, 1])})`,
        }}
      >
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: `0 30px 80px ${theme.primary}55`,
          }}
        >
          <svg width="54" height="54" viewBox="0 0 24 24" fill="none">
            <path
              d="M12 21s-7-4.5-7-10a4.5 4.5 0 0 1 8-2.7A4.5 4.5 0 0 1 19 11c0 5.5-7 10-7 10z"
              fill="white"
            />
          </svg>
        </div>
        <div
          style={{
            fontFamily: fonts.display,
            fontSize: 120,
            fontWeight: 700,
            color: theme.ink,
            letterSpacing: -3,
          }}
        >
          OneCare
        </div>
      </div>

      <div
        style={{
          marginTop: 40,
          fontFamily: fonts.display,
          fontSize: 48,
          color: theme.ink,
          opacity: tag,
          transform: `translateY(${interpolate(tag, [0, 1], [20, 0])}px)`,
          fontWeight: 500,
          letterSpacing: -0.5,
        }}
      >
        Continuous care,{" "}
        <span
          style={{
            background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          between visits.
        </span>
      </div>

      <div
        style={{
          marginTop: 56,
          fontFamily: fonts.body,
          fontSize: 26,
          color: theme.mute,
          opacity: url,
          letterSpacing: 3,
        }}
      >
        ONECARE.YOU
      </div>
    </AbsoluteFill>
  );
};
