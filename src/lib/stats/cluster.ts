// The same session is often recorded by several devices at once (watch + ring
// + strap). Recordings whose time spans overlap by at least `minOverlap` of the
// shorter one are grouped so the session is counted once, with every
// recording kept and named.

export interface Span {
  start: number;
  end: number;
}

export function overlapFraction(a: Span, b: Span): number {
  const ov = Math.min(a.end, b.end) - Math.max(a.start, b.start);
  if (ov <= 0) return 0;
  const shorter = Math.min(a.end - a.start, b.end - b.start);
  return shorter > 0 ? ov / shorter : 0;
}

export function clusterByOverlap<T>(items: T[], span: (t: T) => Span, minOverlap = 0.5): T[][] {
  const sorted = [...items].sort((a, b) => span(a).start - span(b).start);
  const clusters: T[][] = [];
  for (const it of sorted) {
    const s = span(it);
    let placed = false;
    // Only recent clusters can overlap a later-starting item; scan from the end.
    for (let i = clusters.length - 1; i >= 0 && i >= clusters.length - 5; i--) {
      if (clusters[i].some((m) => overlapFraction(span(m), s) >= minOverlap)) {
        clusters[i].push(it);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([it]);
  }
  return clusters;
}
