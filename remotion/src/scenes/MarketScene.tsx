import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from "remotion";
import { theme, fonts } from "../theme";

type Metric = { value: string; label: string; sub?: string };

const METRICS: Metric[] = [
  { value: "$26B", label: "U.S. readmission cost", sub: "Reducible with continuous monitoring" },
  { value: "70%", label: "Of patients miss follow-up signals", sub: "Between discharge and next visit" },
  { value: "$99", label: "Per clinician / month", sub: "Pays back in one avoided readmission" },
  { value: "10x", label: "Net revenue per clinician seat", sub: "SaaS margin profile, sticky workflow" },
];

export const MarketScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const title = spring({ frame, fps, config: { damping: 22, stiffness: 110 } });
  const outro = interpolate(
    frame,
    [durationInFrames - 18, durationInFrames - 2],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ padding: "100px 120px", opacity: outro }}>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 22,
          letterSpacing: 4,
          color: theme.primary,
          fontWeight: 600,
          marginBottom: 20,
          opacity: title,
        }}
      >
        THE OPPORTUNITY
      </div>
      <div
        style={{
          fontFamily: fonts.display,
          fontSize: 84,
          lineHeight: 1,
          color: theme.ink,
          fontWeight: 700,
          letterSpacing: -1.5,
          opacity: title,
          transform: `translateY(${interpolate(title, [0, 1], [30, 0])}px)`,
        }}
      >
        A profitable<br />path to scale.
      </div>

      <div
        style={{
          marginTop: 80,
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 32,
        }}
      >
        {METRICS.map((m, i) => {
          const delay = 18 + i * 10;
          const card = spring({ frame: frame - delay, fps, config: { damping: 22, stiffness: 120 } });
          return (
            <div
              key={m.value}
              style={{
                padding: "36px 40px",
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 16,
                opacity: card,
                transform: `translateY(${interpolate(card, [0, 1], [40, 0])}px)`,
              }}
            >
              <div
                style={{
                  fontFamily: fonts.display,
                  fontSize: 86,
                  fontWeight: 700,
                  background: `linear-gradient(90deg, ${theme.primary}, ${theme.accent})`,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  lineHeight: 1,
                  letterSpacing: -2,
                }}
              >
                {m.value}
              </div>
              <div
                style={{
                  fontFamily: fonts.body,
                  fontSize: 26,
                  color: theme.ink,
                  marginTop: 14,
                  fontWeight: 600,
                }}
              >
                {m.label}
              </div>
              {m.sub && (
                <div
                  style={{
                    fontFamily: fonts.body,
                    fontSize: 18,
                    color: theme.mute,
                    marginTop: 8,
                  }}
                >
                  {m.sub}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
