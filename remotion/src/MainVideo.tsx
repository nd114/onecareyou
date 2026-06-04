import { AbsoluteFill } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { loadFont as loadSG } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

import { PersistentBackground } from "./components/PersistentBackground";
import { SplitScene } from "./components/SplitScene";
import { HookScene } from "./scenes/HookScene";
import { MarketScene } from "./scenes/MarketScene";
import { ClosingScene } from "./scenes/ClosingScene";

loadSG("normal", { weights: ["500", "700"], subsets: ["latin"] });
loadInter("normal", { weights: ["400", "600"], subsets: ["latin"] });

// Scenes are sequenced with overlapping fades. Each duration includes the outgoing fade window.
// Total = sum(scene durations) - (transitions * fadeFrames). 7 scenes, 6 transitions of 15f each.
// 7 * 165 - 6 * 15 = 1155 - 90 = 1065. Composition is 1080 to give a small tail.

const SCENE = 165;
const FADE = 15;
const fadeTiming = linearTiming({ durationInFrames: FADE });

export const MainVideo: React.FC = () => {
  return (
    <AbsoluteFill>
      <PersistentBackground />
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <HookScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <SplitScene
            kicker="FOR PATIENTS"
            title={<>Your health, <span style={{ color: "#1FD1A1" }}>in one place.</span></>}
            body="Log vitals, medications, and questions from home — and keep your care team in the loop, automatically."
            image="images/patient-dashboard.png"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <SplitScene
            kicker="VITALS & MEDS"
            title={<>Track what matters, <span style={{ color: "#56C2E6" }}>every day.</span></>}
            body="Blood pressure, glucose, weight, adherence — a 90-day picture that follows the patient between visits."
            image="images/patient-vitals.png"
            reverse
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <SplitScene
            kicker="AI COMPANION"
            title={<>An AI that <span style={{ color: "#1FD1A1" }}>knows their record.</span></>}
            body="Record-grounded answers in plain language — voice, text, or photo. Read-only by design."
            image="images/patient-assist.png"
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <SplitScene
            kicker="FOR CLINICIANS"
            title={<>Every patient, <span style={{ color: "#56C2E6" }}>at a glance.</span></>}
            body="One live panel. Real-time alerts on adherence drops and out-of-range vitals — before they become readmissions."
            image="images/clinician-dashboard.png"
            reverse
          />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <MarketScene />
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={fadeTiming} />

        <TransitionSeries.Sequence durationInFrames={SCENE}>
          <ClosingScene />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
