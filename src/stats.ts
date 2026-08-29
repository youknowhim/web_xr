/** Live health of the AR session, shown in the status strip. */
export type RuntimeStats = {
  /** A hit-test source was successfully acquired. */
  hitSource: boolean;
  /** The renderer has an XR reference space. */
  refSpace: boolean;
  fps: number;
  /** Frames in the last sample that found a surface. */
  hits: number;
  /** Planes ARCore is currently tracking. Zero means it has mapped nothing. */
  planes: number;
  /** Corners pinned to a real-world anchor. */
  anchors: number;
};

export const IDLE_STATS: RuntimeStats = {
  hitSource: false,
  refSpace: false,
  fps: 0,
  hits: 0,
  planes: 0,
  anchors: 0,
};
