export type ConstructionKind = "centroid" | "circumcenter" | "orthocenter" | "incenter" | "angle-bisector" | "parallelogram" | "rectangle" | "square" | "rhombus" | "reflect-axis" | "reflect-center" | "rotate" | "dilate" | "translate" | "vector-sum" | "vector-difference";
export type Coordinate = { x: number; y: number };

/** Numerical evaluation shared by the live renderer and geometry checks. */
export function constructionPoint(kind: ConstructionKind, points: Coordinate[], factor=1): Coordinate | null {
  if(points.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const [p,q,r]=points;
  if(["square","rotate","dilate","reflect-center"].includes(kind)) {
    if(!p||!q || kind==="square" && Math.hypot(p.x-q.x,p.y-q.y)<1e-10)return null;
    if(kind==="reflect-center")return{x:2*q.x-p.x,y:2*q.y-p.y};
    if(kind==="dilate")return{x:q.x+factor*(p.x-q.x),y:q.y+factor*(p.y-q.y)};
    const angle=(kind==="square"?-90:factor)*Math.PI/180, x=p.x-q.x,y=p.y-q.y;
    return{x:q.x+x*Math.cos(angle)-y*Math.sin(angle),y:q.y+x*Math.sin(angle)+y*Math.cos(angle)};
  }
  if(["parallelogram","rectangle","rhombus","reflect-axis","translate","vector-sum","vector-difference"].includes(kind)) {
    if(!p||!q||!r)return null;
    if(kind==="parallelogram")return{x:p.x+r.x-q.x,y:p.y+r.y-q.y};
    if(kind==="translate")return{x:p.x+factor*(r.x-q.x),y:p.y+factor*(r.y-q.y)};
    if(kind==="vector-sum")return{x:q.x+r.x-p.x,y:q.y+r.y-p.y};
    if(kind==="vector-difference")return{x:p.x+q.x-r.x,y:p.y+q.y-r.y};
    const dx=q.x-p.x,dy=q.y-p.y,l2=dx*dx+dy*dy;
    if(l2<1e-16)return null;
    if(kind==="rectangle") {const t=((r.x-q.x)*(-dy)+(r.y-q.y)*dx)/l2;return{x:q.x-t*dy,y:q.y+t*dx};}
    if(kind==="rhombus") {const l=Math.hypot(r.x-p.x,r.y-p.y);if(l<1e-8)return null;return{x:p.x+(r.x-p.x)*Math.sqrt(l2)/l,y:p.y+(r.y-p.y)*Math.sqrt(l2)/l};}
    // P reflected across QR.
    const ux=r.x-q.x,uy=r.y-q.y,den=ux*ux+uy*uy;if(den<1e-16)return null;const t=((p.x-q.x)*ux+(p.y-q.y)*uy)/den;
    return{x:2*(q.x+t*ux)-p.x,y:2*(q.y+t*uy)-p.y};
  }
  if (points.length !== 3 || points.some(p => !Number.isFinite(p.x) || !Number.isFinite(p.y))) return null;
  const [a, b, c] = points;
  const ab = Math.hypot(b.x - a.x, b.y - a.y), ac = Math.hypot(c.x - a.x, c.y - a.y), bc = Math.hypot(c.x - b.x, c.y - b.y);
  const area2 = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  if (Math.min(ab, ac, bc) < 1e-8 || Math.abs(area2) < 1e-9 * Math.max(ab, ac, bc) ** 2) return null;
  if (kind === "centroid") return { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
  if (kind === "angle-bisector") return { x: (ac * b.x + ab * c.x) / (ab + ac), y: (ac * b.y + ab * c.y) / (ab + ac) };
  if (kind === "incenter") { const sum = ab + ac + bc; return { x: (bc * a.x + ac * b.x + ab * c.x) / sum, y: (bc * a.y + ac * b.y + ab * c.y) / sum }; }
  // Translate to A before squaring to avoid cancellation for remote coordinates.
  const bx = b.x - a.x, by = b.y - a.y, cx = c.x - a.x, cy = c.y - a.y;
  const center = { x: a.x + ((bx * bx + by * by) * cy - (cx * cx + cy * cy) * by) / (2 * area2), y: a.y + (bx * (cx * cx + cy * cy) - cx * (bx * bx + by * by)) / (2 * area2) };
  return kind === "orthocenter" ? { x: a.x + b.x + c.x - 2 * center.x, y: a.y + b.y + c.y - 2 * center.y } : center;
}
