import { Composition } from "remotion";
import { Scene, calculateMetadata, SceneProps } from "./Composition";

export const Root: React.FC = () => (
  <Composition
    id="InformaticCat"
    component={Scene}
    durationInFrames={32 * 30}
    fps={30}
    width={1080}
    height={1920}
    defaultProps={{ timeline: { fps: 30, duration: 32, lines: [] } } as SceneProps}
    calculateMetadata={calculateMetadata}
  />
);
