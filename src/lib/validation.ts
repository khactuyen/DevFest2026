import {
  VisualSpecSchema,
  MaterialSchema,
  AgentResultSchema,
  isThreeVisual,
  type VisualSpec,
  type VisualAction,
} from "./contracts";
import { compileExpression } from "./expression";
import { compileGraphExpression,compileRegionExpression } from "./function-analysis";
import { AppError } from "./app-error";
import { supportsCircularEdge } from "./circular-edge";
import { materialPublishIssues } from "./material-publish";
import { SPATIAL_TOOLS } from "./spatial-tools";
export function validateVisual(input: unknown): VisualSpec {
  const s = VisualSpecSchema.parse(input),
    ids = new Set<string>();
  for (const p of s.parameters) {
    if (
      ids.has(p.id) ||
      ["x", "pi", "sin", "cos", "tan", "sqrt", "abs", "exp", "log"].includes(
        p.id,
      )
    )
      throw Error(`ID tham số không hợp lệ: ${p.id}`);
    ids.add(p.id);
  }

  if (isThreeVisual(s)) {
    for (const object of s.objects) {
      if (ids.has(object.id)) throw Error(`ID trùng: ${object.id}`);
      ids.add(object.id);
      if (object.spatialConstruction) {
        if(object.spatialConstruction.inputs.length !== SPATIAL_TOOLS[object.spatialConstruction.tool].count)throw Error("Phép dựng 3D chưa đủ điểm đầu vào.");
        const sources = [...object.spatialConstruction.inputs.flatMap(p => p.anchor ? [p.anchor.objectId] : []), ...(object.spatialConstruction.sourceId ? [object.spatialConstruction.sourceId] : [])];
        if (sources.some(source => !s.objects.some(parent => parent.id === source))) throw Error("Phép dựng 3D tham chiếu nguồn không tồn tại.");
        for(const {anchor} of object.spatialConstruction.inputs){if(!anchor)continue;const parent=s.objects.find(o=>o.id===anchor.objectId)!;
          if(["label3d","slicePlane"].includes(parent.type))throw Error("Nguồn điểm dựng 3D phải là đỉnh hoặc cạnh hình học.");
          if(anchor.vertexIndex===undefined&&anchor.edgeIndex===undefined&&!anchor.edgeKey&&!parent.marker)throw Error("Thiếu đỉnh hoặc cạnh của điểm dựng 3D.");
          if(anchor.edgeRatio!==undefined&&anchor.edgeIndex===undefined&&!anchor.edgeKey)throw Error("Điểm bám cạnh thiếu cạnh nguồn.");
          if(anchor.edgeIndex!==undefined&&anchor.vertexIndex!==undefined || anchor.edgeKey&&(anchor.edgeIndex!==undefined||anchor.vertexIndex!==undefined))throw Error("Điểm dựng không thể đồng thời bám nhiều loại nguồn.");
          const vertexCounts:Record<string,number>={box:8,tetrahedron:4,octahedron:6,dodecahedron:20,icosahedron:12,prism:2*(parent.sides||6),pyramid:(parent.sides||6)+1,extrudedPolygon:2*(parent.vertices2d?.length||0),face3d:parent.points3d?.length||3};
          if(anchor.vertexIndex!==undefined&&vertexCounts[parent.type]!==undefined&&anchor.vertexIndex>=vertexCounts[parent.type])throw Error("Chỉ số đỉnh dựng 3D không tồn tại.");
        }
      }
      if(object.net && (!s.objects.some(o=>o.id===object.net!.sourceId) || !s.parameters.some(p=>p.id===object.net!.parameter)))throw Error("Khai triển thiếu khối hoặc tham số nguồn.");
      for (const parameter of Object.values(object.parameterBindings || {})) {
        if (parameter && !s.parameters.some((item) => item.id === parameter))
          throw Error(`3D parameter binding không tồn tại: ${parameter}`);
      }
      if (
        object.type === "slicePlane" &&
        !object.parameterBindings?.positionY
      )
        throw Error("Mặt phẳng cắt cần gắn tham số positionY");
      if (object.vertexEndpoints) {
        if (object.type !== "curve3d") throw Error("Chỉ đường nối 3D được gắn hai đỉnh.");
        for (const anchor of object.vertexEndpoints) {
          const parent = s.objects.find((p) => p.id === anchor.objectId);
          if (!parent || ["label3d", "slicePlane"].includes(parent.type) || parent.type === "curve3d" && anchor.edgeIndex === undefined)
            throw Error("Đỉnh tham chiếu của đường nối 3D không tồn tại hoặc không hợp lệ.");
          if (anchor.edgeKey !== undefined) {
            if (!supportsCircularEdge(parent.type, anchor.edgeKey) || parent.marker || anchor.edgeRatio === undefined || anchor.edgeIndex !== undefined || anchor.vertexIndex !== undefined)
              throw Error("Điểm trên viền tròn không hợp lệ.");
          } else if (anchor.edgeIndex !== undefined) {
            if (anchor.vertexIndex !== undefined || anchor.edgeRatio === undefined || parent.marker)
              throw Error("Điểm trên cạnh cần vị trí hợp lệ, không đồng thời là đỉnh.");
            if (parent.type === "curve3d" && parent.points3d && anchor.edgeIndex + 1 >= parent.points3d.length + (parent.closed ? 1 : 0))
              throw Error("Chỉ số cạnh của đường nối không tồn tại.");
            const counts: Record<string,number> = {box:24,tetrahedron:12,octahedron:24,dodecahedron:60,icosahedron:60,face3d:6};
            const edgeCount=parent.type === "extrudedPolygon" ? (parent.vertices2d?.length || 0)*6 : counts[parent.type];
            if (parent.type !== "curve3d" && (anchor.edgeIndex%2!==0 || edgeCount!==undefined && anchor.edgeIndex+1>=edgeCount)) throw Error("Chỉ số cạnh của đường nối không tồn tại.");
            if (parent.segments && anchor.edgeIndex%2!==0) throw Error("Điểm nối phải thuộc một đoạn của đường ghép.");
          } else if (anchor.edgeRatio !== undefined) throw Error("Thiếu cạnh của điểm nối.");
          if (anchor.vertexIndex === undefined && anchor.edgeIndex === undefined && anchor.edgeKey === undefined && !parent.marker)
            throw Error("Đường nối cần đỉnh của khối hoặc điểm đánh dấu.");
          const counts: Record<string, number> = { box: 8, tetrahedron: 4, octahedron: 6, dodecahedron: 20, icosahedron: 12, face3d: 3 };
          const count = parent.type === "extrudedPolygon" ? (parent.vertices2d?.length || 0)*2 : counts[parent.type];
          if (anchor.vertexIndex !== undefined && (parent.marker || count !== undefined && anchor.vertexIndex >= count))
            throw Error("Chỉ số đỉnh của đường nối không tồn tại.");
        }
        if (JSON.stringify(object.vertexEndpoints[0]) === JSON.stringify(object.vertexEndpoints[1]))
          throw Error("Đường nối cần hai đỉnh khác nhau.");
      }
    }
    const visited = new Set<string>(), visiting = new Set<string>();
    const visitConnection = (id: string) => {
      if (visiting.has(id)) throw Error("Đường nối có phụ thuộc vòng.");
      if (visited.has(id)) return;
      visiting.add(id);
      s.objects.find((o) => o.id === id)?.vertexEndpoints?.forEach((anchor) => visitConnection(anchor.objectId));
      const definition = s.objects.find(o => o.id === id)?.spatialConstruction;
      definition?.inputs.forEach(p => { if(p.anchor) visitConnection(p.anchor.objectId); });
      if(definition?.sourceId) visitConnection(definition.sourceId);
      const net=s.objects.find(o=>o.id===id)?.net;if(net)visitConnection(net.sourceId);
      visiting.delete(id); visited.add(id);
    };
    s.objects.forEach((o) => visitConnection(o.id));
    return s;
  }

  const objects = new Map(s.objects.map((o) => [o.id, o]));
  for (const o of s.objects) {
    if (ids.has(o.id)) throw Error(`ID trùng: ${o.id}`);
    ids.add(o.id);
  }
  const done = new Set<string>(),
    active = new Set<string>();
  function visit(id: string) {
    if (done.has(id)) return;
    if (active.has(id)) throw Error("Dependency cycle");
    const o = objects.get(id);
    if (!o) throw Error(`Reference không tồn tại: ${id}`);
    active.add(id);
    o.parents.forEach(visit);
    const tangent=objects.get(id)?.tangentOf;
    if(tangent){const source=objects.get(tangent.sourceId);if(source?.type!=="functionGraph"||source.tangentOf)throw Error("Tiếp tuyến cần một hàm nguồn hợp lệ.");visit(tangent.sourceId);}
    active.delete(id);
    done.add(id);
  }
  const pointTypes = ["point", "glider", "intersection", "midpoint", "projection"];
  for (const o of s.objects) {
    visit(o.id);
    const count = o.parents.length;
    const required: Record<string, number> = {
      point: o.construction ? ["square","reflect-center","rotate","dilate"].includes(o.construction) ? 2 : 3 : o.offset ? 1 : 0,
      functionGraph: 0,
      parametric: 0,
      implicit: 0,
      inequality: 0,
      sequence: 0,
      text: 0,
      line: 2,
      segment: 2,
      arrow: 2,
      circle: o.radius === undefined ? 2 : 1,
      angle: 3,
      glider: 1,
      intersection: 2,
      midpoint: 2,
      projection: 2,
      perpendicular: 2,
      parallel: 2,
      verticalMarker: 0,
      horizontalMarker: 0,
      relationMark: o.markKind === "equal-length" ? 4 : o.markKind === "equal-angle" ? 6 : 3,
    };
    if (o.type === "polygon" ? count < 3 : o.type === "relationMark" ? count < required[o.type] || count > required[o.type] + 2 : count !== required[o.type])
      throw Error(`Parents sai: ${o.id}`);
    if (o.type === "relationMark") {
      if (!o.markKind || o.free || o.parents.slice(0, required[o.type]).some(p => !pointTypes.includes(objects.get(p)!.type))) throw Error("Ký hiệu cần các điểm nguồn hợp lệ, không được kéo độc lập.");
    } else if (o.markKind || o.markCount) throw Error("Thông tin ký hiệu chỉ dùng cho relationMark.");
    if (o.offset && (o.type !== "point" || o.free || !pointTypes.includes(objects.get(o.parents[0])!.type))) throw Error("Điểm offset cần tâm phụ thuộc và không được kéo độc lập.");
    if (o.construction && (o.type !== "point" || o.free || o.offset || o.parents.some(p => !pointTypes.includes(objects.get(p)!.type)))) throw Error("Điểm dựng cần ba điểm tham chiếu và không được kéo độc lập.");
    if (o.ray && o.type !== "line") throw Error("Tia cần đối tượng đường thẳng.");
    if (o.constraint && (o.type !== "polygon" || count !== 4 || o.parents.some(p=>objects.get(p)?.type!=="point"))) throw Error("Ràng buộc chữ nhật/vuông cần bốn điểm.");
    if(o.constraint) {
      const values=Object.fromEntries(s.parameters.map(p=>[p.id,p.value]));
      const scalar=(v:number|string|undefined)=>typeof v==="number" ? v : typeof v==="string" ? compileExpression(v,Object.keys(values))(values) : NaN;
      const coordinates=(id:string):[number,number]=>{
        const point=objects.get(id)!;
        if(point.type==="midpoint") {
          const a=coordinates(point.parents[0]),b=coordinates(point.parents[1]);
          return [(a[0]+b[0])/2,(a[1]+b[1])/2];
        }
        const parent=point.offset ? coordinates(point.parents[0]) : [0,0];
        return [parent[0]+scalar(point.x),parent[1]+scalar(point.y)];
      };
      const points=o.parents.map(coordinates),edges=points.map((p,i)=>[points[(i+1)%4][0]-p[0],points[(i+1)%4][1]-p[1]]);
      const lengths=edges.map(e=>Math.hypot(...e));
      if(lengths.some(l=>!Number.isFinite(l) || l<0.001) || edges.some((e,i)=>Math.abs(e[0]*edges[(i+1)%4][0]+e[1]*edges[(i+1)%4][1])>lengths[i]*lengths[(i+1)%4]*1e-5)
        || o.constraint==="square" && Math.max(...lengths)-Math.min(...lengths)>Math.max(...lengths)*1e-5)
        throw Error("Các đỉnh không thỏa ràng buộc chữ nhật/vuông đã khai báo.");
    }
    if (
      ["line", "segment", "arrow", "circle", "polygon", "angle", "midpoint"].includes(o.type) &&
      o.parents.some((p) => !pointTypes.includes(objects.get(p)!.type))
    )
      throw Error("Parent cần là point");
    if (
      o.type === "glider" &&
      !["line", "segment", "arrow", "circle", "functionGraph"].includes(
        objects.get(o.parents[0])!.type,
      )
    )
      throw Error("Glider cần đường hoặc đường tròn");
    if (
      o.type === "intersection" &&
      o.parents.some(
        (p) => !["line", "segment", "circle", "parallel", "perpendicular"].includes(objects.get(p)!.type),
      )
    )
      throw Error("Intersection cần line/circle");
    if (
      o.type === "projection" &&
      (!pointTypes.includes(objects.get(o.parents[0])!.type) ||
        !["line", "segment", "arrow", "parallel", "perpendicular"].includes(objects.get(o.parents[1])!.type))
    )
      throw Error("Projection cần point và line/segment");
    if (
      ["perpendicular", "parallel"].includes(o.type) &&
      (!["line", "segment", "arrow", "parallel", "perpendicular"].includes(objects.get(o.parents[0])!.type) ||
        !pointTypes.includes(objects.get(o.parents[1])!.type))
    )
      throw Error("Đường song song/vuông góc cần line/segment và point");
    if (
      ["point", "glider", "text"].includes(o.type) &&
      (o.x === undefined || o.y === undefined)
    )
      throw Error("Thiếu tọa độ");
    if (["functionGraph","parametric","implicit","inequality","sequence"].includes(o.type) && !o.expression)
      throw Error("Thiếu expression");
    if(o.type === "parametric" && !o.expressionY)throw Error("Đường tham số cần cả x(t) và y(t).");
    if (
      (o.type === "verticalMarker" && o.x === undefined) ||
      (o.type === "horizontalMarker" && o.y === undefined)
    )
      throw Error("Thiếu marker coordinate");
    if (o.free && o.type !== "point" && o.type !== "glider")
      throw Error("Chỉ point/glider được kéo");
    if (o.edgeRatio !== undefined) {
      const target = objects.get(o.parents[0]);
      if (o.type !== "glider" || o.free || !target || !["segment", "line", "arrow", "circle"].includes(target.type))
        throw Error("Điểm bám cạnh cần một đường/đường tròn hợp lệ và không được kéo độc lập.");
      if (target.type !== "line" && (o.edgeRatio < 0 || o.edgeRatio > 1)) throw Error("Vị trí điểm bám nằm ngoài cạnh.");
    }
    if(o.angleParameter && (o.type!=="glider" || !o.free || o.edgeRatio!==undefined || objects.get(o.parents[0])?.type!=="circle" || !s.parameters.some(p=>p.id===o.angleParameter)))throw Error("Điểm góc cần bám một đường tròn và một tham số hợp lệ.");
    if (
      o.free &&
      o.type === "point" &&
      (typeof o.x !== "number" || typeof o.y !== "number")
    )
      throw Error("Free point cần tọa độ số");
    for (const value of [o.x, o.y, o.radius, o.expression, o.expressionY, o.constructionFactor])
      if (typeof value === "string")
        (o.type === "functionGraph" && value === o.expression ? compileGraphExpression : o.type === "inequality" && value === o.expression ? compileRegionExpression : compileExpression)(
          value,
          [...s.parameters.map((p) => p.id), ...(["parametric","sequence"].includes(o.type)?["t"]:["implicit","inequality"].includes(o.type)?["y"]:[])],
        );
  }
  return s;
}
export function validateActions(actions: VisualAction[], s: VisualSpec) {
  for (const a of actions) {
    if (
      "targets" in a &&
      a.targets.some((id) => !s.objects.some((o) => o.id === id))
    )
      throw Error("Action target không tồn tại");
    if ("parameter" in a) {
      const p = s.parameters.find((p) => p.id === a.parameter);
      if (!p) throw Error("Action parameter không tồn tại");
      const values = a.type === "setParameter" ? [a.value] : [a.from, a.to];
      if (values.some((v) => v < p.min || v > p.max))
        throw Error("Action vượt giới hạn tham số");
    }
  }
}
export function validateMaterial(input: unknown) {
  const m = MaterialSchema.parse(input);
  const ids = new Set<string>();
  m.visuals.forEach((v) => {
    validateVisual(v);
    if (ids.has(v.id)) throw Error("Visual ID trùng");
    ids.add(v.id);
  });
  const blocks = new Set<string>();
  m.blocks.forEach((b) => {
    if (blocks.has(b.id)) throw Error("Block ID trùng");
    blocks.add(b.id);
    if (b.examQuestion && (!m.exam || b.type !== "exercise" || !b.assessment ||
      b.assessment.type !== (b.examQuestion.kind === "multiple" ? "multiple" : "short") ||
      ((b.examQuestion.kind === "multiple" || b.examQuestion.kind === "true-false") && b.assessment.options?.length !== 4))) {
      throw Error("Cấu trúc câu hỏi trong đề không hợp lệ");
    }
    if (b.examFigure && (!m.exam || (b.type !== "visual" && b.authorKind !== "image")))
      throw Error("Hình minh họa phải thuộc đề kiểm tra");
    if (b.board && b.type !== "visual") throw Error("Bảng vẽ phải thuộc khối trực quan");
    if (b.type === "visual" && (b.visualId ? !ids.has(b.visualId) : !b.board))
      throw Error("Visual reference bị thiếu");
  });
  const stepIds = new Set<string>();
  const assignedBlockIds = new Set<string>();
  m.learningSteps.forEach((step) => {
    if (stepIds.has(step.id)) throw Error("Step ID trùng");
    stepIds.add(step.id);
    if (step.blockIds.some((blockId) => !blocks.has(blockId)))
      throw Error("Step tham chiếu block không tồn tại");
    if (step.blockIds.some((blockId) => assignedBlockIds.has(blockId)))
      throw Error("Một block không thể thuộc nhiều bước học tập");
    step.blockIds.forEach((blockId) => assignedBlockIds.add(blockId));
    if (step.visualId) {
      const visual = m.visuals.find((item) => item.id === step.visualId);
      if (!visual) throw Error("Step visual không tồn tại");
      validateActions(step.visualActions, visual);
    } else if (step.visualActions.length) {
      throw Error("Step có action nhưng chưa gắn mô hình");
    }
  });
  if (m.exam) {
    if (m.blocks.some((block) => !assignedBlockIds.has(block.id))) throw Error("Nội dung đề chưa gắn vào câu hỏi");
    const byId = new Map(m.blocks.map((block) => [block.id, block]));
    for (const step of m.learningSteps) {
      const children = step.blockIds.map((id) => byId.get(id)!);
      if (children.filter((block) => block.examQuestion).length !== 1 ||
        children.some((block) => !block.examQuestion && block.type !== "visual" && block.authorKind !== "image"))
        throw Error("Mỗi mục của đề phải có một câu hỏi và các hình minh họa của câu đó");
    }
  }
  return m;
}

/** Validate the extra completeness rules required for learner-facing release. */
export function validateMaterialForPublish(input: unknown) {
  const m = validateMaterial(input);
  const issues = materialPublishIssues(m).map(issue => issue.message);

  if (issues.length)
    throw new AppError(422, `Chưa thể xuất bản:\n• ${issues.join("\n• ")}`, "material_publish_validation");
  return m;
}

export function validateAgent(input: unknown) {
  const r = AgentResultSchema.parse(input);
  validateVisual(r.visual);
  for (const step of r.steps) {
    if (step.visualId && step.visualId !== r.visual.id)
      throw Error("Step visual không tồn tại");
    validateActions(step.visualActions, r.visual);
  }
  return r;
}
