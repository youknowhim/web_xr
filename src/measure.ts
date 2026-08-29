import * as THREE from 'three';

/** A quadrilateral is treated as a rectangle when its diagonals match this closely. */
export const RECTANGLE_TOLERANCE = 95;

/** Number of corners the user taps to complete a measurement. */
export const CORNER_COUNT = 4;

export type Units = {
  cm: string;
  inches: string;
};

export function toUnits(meters: number): Units {
  return {
    cm: (meters * 100).toFixed(1),
    inches: (meters * 39.3701).toFixed(1),
  };
}

export function midpoint(a: THREE.Vector3, b: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
}

export type RectangleMetrics = {
  /** Longer of the two averaged side pairs, in metres. */
  length: number;
  /** Shorter of the two averaged side pairs, in metres. */
  breadth: number;
  /** Where to float the length label. */
  lengthAnchor: THREE.Vector3;
  /** Where to float the breadth label. */
  breadthAnchor: THREE.Vector3;
  /** The two diagonals, in metres. */
  diagonals: [number, number];
  /** How closely the diagonals agree, 0-100. 100 means a perfect rectangle. */
  diagonalMatch: number;
  /** True when `diagonalMatch` clears `RECTANGLE_TOLERANCE`. */
  isRectangular: boolean;
  /** length x breadth, in square metres. */
  area: number;
};

/**
 * Derive length and breadth from four corners tapped around a face.
 *
 * Opposite sides are averaged so a slightly-off tap on one corner does not
 * skew the result, and the two diagonals are compared to score how close the
 * tapped shape really is to a rectangle.
 */
export function rectangleMetrics(corners: THREE.Vector3[]): RectangleMetrics | null {
  if (corners.length !== CORNER_COUNT) return null;

  const [a, b, c, d] = corners;

  const sideAB = (a.distanceTo(b) + c.distanceTo(d)) / 2;
  const sideBC = (b.distanceTo(c) + d.distanceTo(a)) / 2;

  const abIsLonger = sideAB >= sideBC;
  const length = abIsLonger ? sideAB : sideBC;
  const breadth = abIsLonger ? sideBC : sideAB;
  const lengthAnchor = abIsLonger ? midpoint(a, b) : midpoint(b, c);
  const breadthAnchor = abIsLonger ? midpoint(b, c) : midpoint(a, b);

  const diagonalAC = a.distanceTo(c);
  const diagonalBD = b.distanceTo(d);
  const longest = Math.max(diagonalAC, diagonalBD);
  const diagonalMatch = longest > 0 ? (Math.min(diagonalAC, diagonalBD) / longest) * 100 : 0;

  return {
    length,
    breadth,
    lengthAnchor,
    breadthAnchor,
    diagonals: [diagonalAC, diagonalBD],
    diagonalMatch,
    isRectangular: diagonalMatch >= RECTANGLE_TOLERANCE,
    area: length * breadth,
  };
}

/** Edges of the tapped outline, closing back to the first corner once complete. */
export function outlineEdges(corners: THREE.Vector3[]): [THREE.Vector3, THREE.Vector3][] {
  const edges: [THREE.Vector3, THREE.Vector3][] = [];
  for (let i = 0; i < corners.length - 1; i++) {
    edges.push([corners[i], corners[i + 1]]);
  }
  if (corners.length === CORNER_COUNT) {
    edges.push([corners[CORNER_COUNT - 1], corners[0]]);
  }
  return edges;
}
