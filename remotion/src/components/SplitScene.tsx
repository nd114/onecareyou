import { useCurrentFrame, useVideoConfig, spring, interpolate, Img, staticFile } from "remotion";
import { theme, fonts } from "../theme";

type Props = {
  kicker?: string;
  title: React.ReactNode;
  body?: string;
  stat?: { value: string; label: string };
  image: string;
  reverse?: boolean;
};

// Reusable left-text / right-screenshot scene layout.
// Each scene is its own <Sequence>, so frame restarts at 0 here.
export const SplitScene: React.FC<Props> = ({ kicker, title, body, stat, image, reverse }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const inSpring = spring({ frame, fps, config: { damping: 22, stiffness: 110 } });
  const imgSpring = spring({ frame: frame - 6, fps, config: { damping: 24, stiffness: 90 } });

  // Outro fade so transitions overlap cleanly
  const outro = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames - 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  const textX = interpolate(inSpring, [0, 1], [reverse ? 60 : -60, 0]);
  const imgX = interpolate(imgSpring, [0, 1], [reverse ? -80 : 80, 0]);
  const imgScale = interpolate(imgSpring, [0, 1], [0.94, 1]);

  // Subtle parallax on the screenshot
  const bob = Math.sin((frame / fps) * 0.9) * 6;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: reverse ? "row-reverse" : "row",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 120px",
        gap: 80,
        opacity: outro,
      }}
    >
      {/* Text column */}
      <div
        style={{
          flex: "0 0 38%",
          transform: `translateX(${textX}px)`,
          opacity: inSpring,
        }}
      >
        {kicker && (
          <div
            style={{
              fontFamily: fonts.body,
              fontSize: 22,
              letterSpacing: 4,
              textTransform: "uppercase",
              color: theme.primary,
              marginBottom: 24,
              fontWeight: 600,
            }}
          >
            {kicker}
          </div>
        )}
        <h1
          style={{
            fontFamily: fonts.display,
            fontSize: 78,
            lineHeight: 1.02,
            margin: 0,
            color: theme.ink,
            fontWeight: 700,
            letterSpacing: -1.5,
          }}
        >
          {title}
        </h1>
        {body && (
          <p
            style={{
              fontFamily: fonts.body,
              fontSize: 26,
              lineHeight: 1.45,
              color: theme.mute,
              marginTop: 32,
              maxWidth: 560,
            }}
          >
            {body}
          </p>
        )}
        {stat && (
          <div
            style={{
              marginTop: 40,
              padding: "20px 28px",
              borderLeft: `4px solid ${theme.primary}`,
              background: "rgba(31,209,161,0.07)",
              borderRadius: 8,
              maxWidth: 520,
            }}
          >
            <div
              style={{
                fontFamily: fonts.display,
                fontSize: 56,
                color: theme.ink,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {stat.value}
            </div>
            <div
              style={{
                fontFamily: fonts.body,
                fontSize: 20,
                color: theme.mute,
                marginTop: 8,
                letterSpacing: 0.5,
              }}
            >
              {stat.label}
            </div>
          </div>
        )}
      </div>

      {/* Image column */}
      <div
        style={{
          flex: "0 0 52%",
          transform: `translate(${imgX}px, ${bob}px) scale(${imgScale})`,
          opacity: imgSpring,
        }}
      >
        <div
          style={{
            borderRadius: 18,
            overflow: "hidden",
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: `0 40px 80px rgba(0,0,0,0.55), 0 0 0 1px ${theme.primary}22`,
            background: theme.bgSoft,
          }}
        >
          <Img
            src={staticFile(image)}
            style={{ width: "100%", display: "block" }}
          />
        </div>
      </div>
    </div>
  );
};
