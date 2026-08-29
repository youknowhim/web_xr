import * as THREE from 'three';

/** A quadrilateral is treated as a rectangle when its diagonals match this closely. */
export const RECTANGLE_TOLERANCE = 95;

/** Number of corners the user taps to complete a measurement. */
export const CORNER_COUNT = 4;

/** How far above the surface the graphics float, in metres. */
export const SURFACE_LIFT = 0.006;

/** A tapped corner, plus the orientation of the surface it landed on. */
export type Corner = {
  position: THREE.Vector3;
  /** Local +Y points along the surface normal. */
  quaternion: THREE.Quaternion;
};

export function surfaceNormal(corner: Corner): THREE.Vector3 {
  return new THREE.Vector3(0, 1, 0).applyQuaternion(corner.quaternion);
}

/**
 * Where a corner's graphics should be drawn.
 *
 * Measurements use the true surface point, but a marker or a tube centred on
 * that point is half buried in the surface, so anything drawn is floated a few
 * millimetres along the normal. That also keeps coincident geometry - the
 * reticle sitting on a placed corner, say - from z-fighting.
 */
export function liftedPosition(corner: Corner): THREE.Vector3 {
  return corner.position.clone().addScaledVector(surfaceNormal(corner), SURFACE_LIFT);
}

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

/**
 * Sort four corners into a ring that does not cross itself.
 *
 * Tapped out of order - say 1, 2, 4, 3 - the outline becomes a bow-tie whose
 * "sides" are really the diagonals. That measures the wrong distances *and*
 * still scores 100%, because the true diagonals become equal sides. Sorting
 * the corners by angle around their centroid, in their own plane, yields a
 * simple quadrilateral whatever order they were tapped in. Returns the
 * permutation rather than the points, so the caller can reorder whatever it
 * keeps alongside them.
 */
export function ringOrder(corners: THREE.Vector3[]): number[] {
  const identity = corners.map((_, index) => index);
  if (corners.length !== CORNER_COUNT) return identity;

  const centroid = new THREE.Vector3();
  for (const corner of corners) centroid.add(corner);
  centroid.divideScalar(corners.length);

  // Take the best-conditioned triple: any single triple can be degenerate if
  // three of the taps happen to land in a line.
  const normal = new THREE.Vector3();
  const triples = [
    [0, 1, 2],
    [0, 1, 3],
    [0, 2, 3],
    [1, 2, 3],
  ];
  for (const [i, j, k] of triples) {
    const candidate = new THREE.Vector3()
      .subVectors(corners[j], corners[i])
      .cross(new THREE.Vector3().subVectors(corners[k], corners[i]));
    if (candidate.lengthSq() > normal.lengthSq()) normal.copy(candidate);
  }
  if (normal.lengthSq() < 1e-12) return identity;
  normal.normalize();

  // In-plane basis, with the first corner defining the zero angle.
  const xAxis = new THREE.Vector3()
    .subVectors(corners[0], centroid)
    .projectOnPlane(normal);
  if (xAxis.lengthSq() < 1e-12) return identity;
  xAxis.normalize();
  const yAxis = new THREE.Vector3().crossVectors(normal, xAxis);

  const angleOf = (corner: THREE.Vector3) => {
    const offset = new THREE.Vector3().subVectors(corner, centroid);
    return Math.atan2(offset.dot(yAxis), offset.dot(xAxis));
  };

  return identity.sort((a, b) => angleOf(corners[a]) - angleOf(corners[b]));
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
