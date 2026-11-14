import { z } from "zod";
import { BoardItemSchema } from "./board-content";
import { LessonBoardSchema } from "./lesson-board";
import { ExamFigureSchema, ExamQuestionSchema, ExamSettingsSchema } from "./exam-document";

const id = z.string().regex(/^[a-zA-Z][\w-]{0,63}$/);
const scalar = z.union([
  z.number().finite().min(-1e6).max(1e6),
  z.string().min(1).max(256),
]);
export const ParameterSchema = z
  .object({
    id,
    label: z.string().max(80),
    min: z.number().finite(),
    max: z.number().finite(),
    value: z.number().finite(),
    step: z.number().positive().default(0.1),
  })
  .strict()
  .refine(
    (p) => p.min < p.max && p.value >= p.min && p.value <= p.max,
    "Invalid parameter range",
  );
export const CircularEdgeKeySchema = z.enum(["top-ring", "bottom-ring", "great-x", "great-y", "great-z"]);
const AnnotationFields = {
  label: z.string().max(100).optional(),
  measurement: z.string().max(80).optional(),
  note: z.string().max(300).optional(),
};
const VertexAnnotationsSchema = z.record(z.string().regex(/^(0|[1-9][0-9]{0,2})$/), z.object(AnnotationFields).strict());
const EdgeStyleSchema = z.object({
  edgeIndex: z.number().int().min(0).max(65535),
  edgePart: z.number().int().min(0).max(8).default(0),
  edgeKey: CircularEdgeKeySchema.optional(),
  hidden: z.boolean().optional(),
  lineStyle: z.enum(["solid", "dashed"]).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  strokeWidth: z.number().finite().min(1).max(10).optional(),
  ...AnnotationFields,
}).strict();
const StrokeStyleFields = {
  strokeWidth: z.number().finite().min(1).max(10).optional(),
  edgeStyles: z.array(EdgeStyleSchema).max(512).optional(),
};
export const ObjectSchema = z
  .object({
    id,
    type: z.enum([
      "point",
      "line",
      "segment",
      "arrow",
      "circle",
      "polygon",
      "angle",
      "glider",
      "intersection",
      "midpoint",
      "projection",
      "perpendicular",
      "parallel",
      "functionGraph",
      "parametric",
      "implicit",
      "inequality",
      "sequence",
      "text",
      "verticalMarker",
      "horizontalMarker",
      "relationMark",
    ]),
    ...AnnotationFields,
    labelOffset: z.tuple([z.number().finite().min(-2000).max(2000), z.number().finite().min(-2000).max(2000)]).optional(),
    showAnnotationLabel: z.boolean().optional(),
    pointStyle: z.enum(["dot","circle","cross","square","diamond"]).optional(),
    ariaLabel: z.string().max(200).optional(),
    annotationKind: z.enum(["structure", "vertex", "length", "angle", "face", "helper"]).optional(),
    markKind: z.enum(["equal-length", "equal-angle", "right-angle"]).optional(),
    markCount: z.number().int().min(1).max(8).optional(),
    parents: z.array(id).max(12).default([]),
    removeWhenUnused: z.literal(true).optional(),
    x: scalar.optional(),
    y: scalar.optional(),
    edgeRatio: z.number().finite().min(-1e6).max(1e6).optional(),
    angleParameter: id.optional(),
    expression: z.string().max(256).optional(),
    expressionY: z.string().max(256).optional(),
    tangentOf: z.object({sourceId:id,at:z.number().finite()}).strict().optional(),
    radius: scalar.optional(),
    offset: z.boolean().optional(),
    construction: z.enum(["centroid", "circumcenter", "orthocenter", "incenter", "angle-bisector", "parallelogram", "rectangle", "square", "rhombus", "reflect-axis", "reflect-center", "rotate", "dilate", "translate", "vector-sum", "vector-difference"]).optional(),
    constructionFactor: scalar.optional(),
    intersectionIndex: z.number().int().min(0).max(1).optional(),
    ray: z.boolean().optional(),
    constraint: z.enum(["rectangle", "square"]).optional(),
    domain: z.tuple([z.number().finite(), z.number().finite()]).refine(([a,b]) => a < b).optional(),
    text: z.string().max(300).optional(),
    free: z.boolean().default(false),
    visible: z.boolean().default(true),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#4767dc"),
    lineStyle: z.enum(["solid", "dashed"]).optional(),
    strokeOpacity: z.number().finite().min(0).max(1).optional(),
    ...StrokeStyleFields,
  })
  .strict();
const ConnectionAnchorSchema = z.object({
  objectId: id,
  edgeKey: CircularEdgeKeySchema.optional(),
  vertexIndex: z.number().int().min(0).max(79).optional(),
  edgeIndex: z.number().int().min(0).max(65535).optional(),
  edgeRatio: z.number().finite().min(0).max(1).optional(),
}).strict();
const SpatialConnectionSchema = z.object({
  id, ...AnnotationFields,
  showAnnotationLabel: z.boolean().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#17835e"),
  lineStyle: z.enum(["solid", "dashed"]).default("solid"),
  strokeWidth: z.number().finite().min(1).max(10).optional(),
  endpoints: z.tuple([
    ConnectionAnchorSchema,
    ConnectionAnchorSchema,
  ]),
}).strict();
export const TwoDVisualSpecSchema = z
  .object({
    id,
    version: z.literal(1),
    dimension: z.literal("2d").default("2d"),
    engine: z.literal("jsxgraph").default("jsxgraph"),
    source: z
      .object({ key: id, version: z.number().int().min(1).max(1000) })
      .strict()
      .optional(),
    kind: z.enum(["cartesian", "geometry", "number-line", "statistics"]),
    boardItems: z.array(BoardItemSchema).max(50).optional(),
    savedSpatialObjects: z.array(z.lazy(()=>ThreeObjectSchema)).max(120).optional(),
    savedSpatialParameters: z.array(ParameterSchema).max(12).optional(),
    savedNative3d: z.lazy(() => NativeThreeVisualSpecSchema).optional(),
    surfaceFill: z.boolean().default(true),
    // Display coordinates are a projection; their distances are not spatial lengths.
    projectionOf3d: z.boolean().optional(),
    viewport: z
      .object({
        x: z.tuple([z.number().finite(), z.number().finite()]),
        y: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .refine(
        (v) =>
          v.x[0] < v.x[1] &&
          v.y[0] < v.y[1] &&
          Math.max(...v.x.map(Math.abs), ...v.y.map(Math.abs)) <= 1e6,
        "Invalid viewport",
      ),
    parameters: z.array(ParameterSchema).max(12),
    camera2d: z.object({x:z.tuple([z.number().finite(),z.number().finite()]),y:z.tuple([z.number().finite(),z.number().finite()])}).refine(v=>v.x[0]<v.x[1] && v.y[0]<v.y[1] && [...v.x,...v.y].every(n=>Math.abs(n)<=1e6)).optional(),
    objects: z.array(ObjectSchema).min(1).max(80),
    // Spatial-only edges survive returning to the source plane, without
    // fabricating a 2D projection or altering the planar construction.
    spatialConnections: z.array(SpatialConnectionSchema).max(40).optional(),
    spatialStyles: z.array(z.object({objectId: id, color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(), lineStyle: z.enum(["solid", "dashed"]).optional(), ...StrokeStyleFields, ...AnnotationFields, showAnnotationLabel: z.boolean().optional(), vertexAnnotations: VertexAnnotationsSchema.optional()}).strict()).max(120).optional(),
    spatialPoints: z.array(z.object({id, position: z.tuple([z.number().finite().min(-1e6).max(1e6),z.number().finite().min(-1e6).max(1e6),z.number().finite().min(-1e6).max(1e6)]),color:z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#168265")}).strict()).max(80).optional(),
    accessibility: z.object({ description: z.string().max(1000) }).optional(),
  })
  .strict();
export const ActionSchema = z.discriminatedUnion("type", [
  z
    .object({ type: z.literal("focus"), targets: z.array(id).min(1).max(80) })
    .strict(),
  z
    .object({
      type: z.literal("highlight"),
      targets: z.array(id).min(1).max(80),
    })
    .strict(),
  z
    .object({ type: z.literal("show"), targets: z.array(id).min(1).max(80) })
    .strict(),
  z
    .object({ type: z.literal("hide"), targets: z.array(id).min(1).max(80) })
    .strict(),
  z
    .object({
      type: z.literal("setParameter"),
      parameter: id,
      value: z.number().finite(),
    })
    .strict(),
  z
    .object({
      type: z.literal("animateParameter"),
      parameter: id,
      from: z.number().finite(),
      to: z.number().finite(),
      durationMs: z.number().min(100).max(30000),
      loop: z.boolean().optional(),
    })
    .strict(),
  z.object({ type: z.literal("reset") }).strict(),
]);
export const EntitySchema = z
  .object({
    id,
    type: z.enum([
      "number",
      "point",
      "line",
      "circle",
      "function",
      "equation",
      "polygon",
      "vector",
      "derived",
    ]),
    label: z.string().max(200),
    expression: z.string().max(256).optional(),
    dependsOn: z.array(id).optional(),
    role: z.enum(["given", "unknown", "derived", "parameter"]).optional(),
  })
  .strict();
export const StepSchema = z
  .object({
    id,
    title: z.string().max(200),
    content: z.string().max(6000),
    visualId: id.optional(),
    visualActions: z.array(ActionSchema).max(20).default([]),
  })
  .strict();

/**
 * A restricted program that describes a 2D construction.  This is the only
 * "code" an LLM may produce: it has no JavaScript, callbacks or renderer
 * attributes. `compileVisualProgram()` turns it into the renderer contract.
 */
const ProgramStyleSchema = z
  .object({
    label: z.string().max(100).optional(),
    ariaLabel: z.string().max(200).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    visible: z.boolean().optional(),
    lineStyle: z.enum(["solid", "dashed"]).optional(),
    strokeOpacity: z.number().finite().min(0).max(1).optional(),
  })
  .strict();
const ProgramPointSchema = ProgramStyleSchema.extend({
  op: z.literal("point"),
  id,
  // Fixed dependent points may use safe expressions over declared parameters.
  // Free points stay numeric and are checked below by the semantic compiler.
  x: scalar,
  y: scalar,
  free: z.boolean().optional(),
}).strict();
const ProgramParentsSchema = z.tuple([id, id]);
const ProgramRectangleSchema = ProgramStyleSchema.extend({
  op: z.literal("rectangle"),
  id,
  vertices: z.tuple([id, id, id, id]),
  widthParameter: id,
  heightRatioParameter: id,
  origin: z
    .tuple([
      z.number().finite().min(-1e4).max(1e4),
      z.number().finite().min(-1e4).max(1e4),
    ])
    .default([0, 0]),
}).strict();
const ProgramPrimitiveSchema = z.discriminatedUnion("op", [
  ProgramPointSchema,
  ProgramStyleSchema.extend({op:z.literal("offsetPoint"),id,parents:z.tuple([id]),x:scalar,y:scalar}).strict(),
  ProgramRectangleSchema,
  ProgramStyleSchema.extend({
    op: z.literal("line"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("segment"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("circle"),
    id,
    parents: z.array(id).min(1).max(2),
    radius: scalar.optional(),
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("polygon"),
    id,
    parents: z.array(id).min(3).max(20),
    constraint: z.enum(["rectangle", "square"]).optional(),
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("angle"),
    id,
    parents: z.tuple([id, id, id]),
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("intersection"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("midpoint"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  // parents are [point, line-or-segment] for a perpendicular foot.
  ProgramStyleSchema.extend({
    op: z.literal("projection"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  // parents are [line-or-segment, point].
  ProgramStyleSchema.extend({
    op: z.literal("perpendicular"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("parallel"),
    id,
    parents: ProgramParentsSchema,
  }).strict(),
  ProgramStyleSchema.extend({
    op: z.literal("functionGraph"),
    id,
    expression: z.string().min(1).max(256),
  }).strict(),
]);
export const VisualProgramSchema = z
  .object({
    version: z.literal(1),
    dimension: z.literal("2d"),
    engine: z.literal("jsxgraph"),
    kind: z.enum(["cartesian", "geometry", "number-line", "statistics"]),
    title: z.string().min(1).max(200),
    description: z.string().max(1000).default(""),
    viewport: z
      .object({
        x: z.tuple([z.number().finite(), z.number().finite()]),
        y: z.tuple([z.number().finite(), z.number().finite()]),
      })
      .refine((v) => v.x[0] < v.x[1] && v.y[0] < v.y[1], "Invalid viewport"),
    parameters: z.array(ParameterSchema).max(12).default([]),
    primitives: z.array(ProgramPrimitiveSchema).min(1).max(80),
  })
  .strict();

export const VisualProgramResponseSchema = z
  .object({
    status: z.enum(["supported", "unsupported"]),
    program: VisualProgramSchema.nullable(),
    message: z.string().max(1000).default(""),
  })
  .strict();

export const LearningStepSchema = z
  .object({
    id,
    title: z.string().min(1).max(200),
    description: z.string().max(2000).default(""),
    // A learning step is the pedagogical unit. Blocks are the authoring
    // components that belong to it, rather than the lesson flow itself.
    phase: z
      .enum([
        "warmup",
        "objective",
        "explore",
        "concept",
        "practice",
        "assess",
        "summary",
      ])
      .default("explore"),
    objective: z.string().max(1000).default(""),
    estimatedMinutes: z.number().int().min(0).max(600).default(0),
    blockIds: z.array(id).max(100).default([]),
    actionLabels: z.array(z.string().max(100)).max(20).default([]),
    visualId: id.optional(),
    visualActions: z.array(ActionSchema).max(20).default([]),
  })
  .strict();

const Vector3Schema = z.tuple([
  z.number().finite().min(-1e4).max(1e4),
  z.number().finite().min(-1e4).max(1e4),
  z.number().finite().min(-1e4).max(1e4),
]);

export const ThreeObjectSchema = z
  .object({
    id,
    type: z.enum([
      "box",
      "tetrahedron",
      "octahedron",
      "dodecahedron",
      "icosahedron",
      "prism",
      "pyramid",
      "cylinder",
      "cone",
      "sphere",
      "slicePlane",
      "curve3d",
      "extrudedPolygon",
      "polyhedron3d",
      "face3d",
      "label3d",
    ]),
    ...AnnotationFields,
    ariaLabel: z.string().max(200).optional(),
    vertexAnnotations: VertexAnnotationsSchema.optional(),
    showAnnotationLabel: z.boolean().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .default("#2b5c47"),
    visible: z.boolean().default(true),
    lineStyle: z.enum(["solid", "dashed"]).optional(),
    ...StrokeStyleFields,
    marker: z.boolean().default(false),
    userCreated: z.boolean().optional(),
    net: z.object({sourceId:id,parameter:id,rootFace:z.number().int().min(0).max(31).optional()}).strict().optional(),
    annotationKind: z.enum(["structure", "vertex", "length", "angle", "face", "helper"]).optional(),
    text: z.string().max(300).optional(),
    position: Vector3Schema.default([0, 0, 0]),
    spatialConstruction: z.object({
      tool: z.enum(["edgePoint", "distance", "midpoint", "centroid", "parallel", "footLine", "footPlane", "distancePlane", "intersectionLines", "intersectionLinePlane", "intersectionPlanes", "commonPerpendicular", "angle", "angleLinePlane", "anglePlanes", "plane", "circumsphere", "section", "flatten"]),
      inputs: z.array(z.object({ anchor: ConnectionAnchorSchema.optional(), position: Vector3Schema }).strict()).min(1).max(6),
      sourceId: id.optional(),
      faceIndex: z.number().int().min(0).optional(),
    }).strict().optional(),
    rotation: Vector3Schema.default([0, 0, 0]),
    size: z.number().finite().positive().max(1e4).optional(),
    radius: z.number().finite().positive().max(1e4).optional(),
    height: z.number().finite().positive().max(1e4).optional(),
    apexOffset: Vector3Schema.optional(),
    topRadius: z.number().finite().min(0).max(1e4).optional(),
    boxDimensions: z.tuple([z.number().finite().positive().max(1e4),z.number().finite().positive().max(1e4),z.number().finite().positive().max(1e4)]).optional(),
    sides: z.number().int().min(3).max(64).optional(),
    points3d: z.array(Vector3Schema).min(2).max(256).optional(),
    faces3d: z.array(z.array(Vector3Schema).min(3).max(64)).min(1).max(128).optional(),
    closed: z.boolean().optional(),
    segments: z.boolean().optional(),
    vertexEndpoints: z.tuple([
      ConnectionAnchorSchema,
      ConnectionAnchorSchema,
    ]).optional(),
    thickness: z.number().finite().positive().max(10).optional(),
    expression: z.string().max(256).optional(),
    xRange: z.tuple([z.number().finite(), z.number().finite()]).optional(),
    samples: z.number().int().min(16).max(512).optional(),
    vertices2d: z.array(z.tuple([z.number().finite(), z.number().finite()])).min(3).max(32).optional(),
    depth: z.number().finite().positive().max(1e4).optional(),
    parameterBindings: z
      .object({
        size: id.optional(),
        radius: id.optional(),
        height: id.optional(),
        depth: id.optional(),
        sides: id.optional(),
        positionX: id.optional(),
        positionY: id.optional(),
        positionZ: id.optional(),
        rotationX: id.optional(),
        rotationY: id.optional(),
        rotationZ: id.optional(),
      })
      .strict()
      .optional(),
  })
  .strict()
  .superRefine((object, context) => {
    if (object.type === "curve3d" && !object.points3d?.length && !object.expression && !object.vertexEndpoints)
      context.addIssue({ code: "custom", path: ["points3d"], message: "Đường cong 3D cần điểm hoặc biểu thức." });
    if (object.type === "extrudedPolygon" && !object.vertices2d?.length)
      context.addIssue({ code: "custom", path: ["vertices2d"], message: "Khối đùn cần các đỉnh đa giác." });
    if (object.type === "face3d" && (!object.points3d || object.points3d.length < 3))
      context.addIssue({ code: "custom", path: ["points3d"], message: "Mặt tam giác 3D cần đúng ba đỉnh." });
    if (object.type === "polyhedron3d" && (!object.faces3d || object.faces3d.length < 4))
      context.addIssue({ code: "custom", path: ["faces3d"], message: "Khối cắt cần ít nhất bốn mặt." });
    if (object.type === "label3d" && !object.text)
      context.addIssue({ code: "custom", path: ["text"], message: "Nhãn 3D cần nội dung." });
  });

const NativeThreeVisualSpecSchema = z
  .object({
    id,
    version: z.literal(1),
    dimension: z.literal("3d"),
    engine: z.literal("threejs"),
    source: z
      .object({ key: id, version: z.number().int().min(1).max(1000) })
      .strict()
      .optional(),
    kind: z.enum(["solid", "derived-sketch"]),
    boardItems: z.array(BoardItemSchema).max(50).optional(),
    surfaceFill: z.boolean().default(true),
    parameters: z.array(ParameterSchema).max(12),
    objects: z.array(ThreeObjectSchema).min(1).max(120),
    cubeConstruction: z.object({vertexNames:z.array(z.string().min(1).max(4)).length(8)}).strict().optional(),
    construction: z.object({
      kind: z.literal("tetrahedron-problem"),
      prompt: z.string().min(1).max(8000),
      rightAtD: z.boolean(),
      lineAngleDegrees: z.number().finite().gt(0).lt(90),
    }).strict().optional(),
    camera: z
      .object({
        position: Vector3Schema,
        target: Vector3Schema.default([0, 0, 0]),
      })
      .strict()
      .default({ position: [5, 4, 6], target: [0, 0, 0] }),
    accessibility: z.object({ description: z.string().max(1000) }).optional(),
  })
  .strict();

export const ThreeVisualSpecSchema = NativeThreeVisualSpecSchema.extend({
  planarBoard: TwoDVisualSpecSchema.omit({ savedNative3d: true }).optional(),
  derivedFrom2d: z.object({
    source: TwoDVisualSpecSchema,
    mode: z.enum(["auto", "planar", "cylinder"]),
    positions: z.record(id, z.tuple([z.number().finite(), z.number().finite()])).optional(),
    // Controls for derived solids are separate from the original 2D construction.
    radiusLinks: z.array(z.object({ circleId: id, parameterId: id }).strict()).max(80).optional(),
  }).strict().optional(),
});

// Keep v1 2D documents valid while allowing a separate, constrained 3D scene
// contract. Neither branch accepts executable renderer code.
export const VisualSpecSchema = z.union([
  TwoDVisualSpecSchema,
  ThreeVisualSpecSchema,
]);
export const BlockSchema = z
  .object({
    id,
    type: z.enum([
      "heading",
      "paragraph",
      "math",
      "visual",
      "exercise",
      "callout",
    ]),
    authorKind: z
      .enum([
        "heading",
        "text",
        "formula",
        "visual2d",
        "visual3d",
        "image",
        "question",
        "hint",
      ])
      .optional(),
    title: z.string().max(200).optional(),
    teachingRole: z.literal("example").optional(),
    content: z.string().max(20000).default(""),
    visualId: id.optional(),
    board: LessonBoardSchema.optional(),
    examQuestion: ExamQuestionSchema.optional(),
    examFigure: ExamFigureSchema.optional(),
    assessment: z
      .object({
        type: z.enum(["multiple", "short", "drag"]),
        points: z.number().int().min(0).max(100),
        options: z.array(z.string().max(400)).max(6).optional(),
        correctIndex: z.number().int().min(0).max(5).optional(),
        answer: z.string().max(400).optional(),
        explanation: z.string().max(1200).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export const MaterialSchema = z
  .object({
    id: z.string().uuid(),
    ownerId: z.string().uuid().optional(),
    title: z.string().min(1).max(200),
    summary: z.string().max(2000).default(""),
    sourcePages: z.array(z.object({
      name: z.string().max(200),
      imageUrl: z.string().max(500).optional(),
      transcription: z.string().max(8000),
    }).strict()).max(10).optional(),
    reviewNotes: z.array(z.string().max(500)).max(50).optional(),
    sourceReviewedAt: z.string().datetime().optional(),
    blocks: z.array(BlockSchema).max(100),
    exam: ExamSettingsSchema.optional(),
    slidePlan: z.array(z.object({
      id: z.string().min(1).max(240), sources: z.array(z.string().min(1).max(240)).max(20),
      title: z.string().max(200).optional(), text: z.string().max(6000).optional(), notes: z.string().max(2000).optional(),
      layout: z.enum(["auto", "split", "stack"]).optional(),
    }).strict()).max(500).optional(),
    metadata: z
      .object({
        grade: z.string().max(60).default("10"),
        topic: z.string().max(100).default("Hàm số"),
        type: z
          .enum(["lesson", "exploration", "problem", "exercise"])
          .default("lesson"),
        tags: z.array(z.string().max(50)).max(20).default([]),
      })
      .strict(),
    visuals: z.array(VisualSpecSchema).max(30),
    status: z.enum(["draft", "published"]).default("draft"),
    visibility: z
      .enum(["private", "link", "school", "public"])
      .default("private"),
    learningSteps: z.array(LearningStepSchema).max(50).default([]),
    revision: z.number().int().min(1).default(1),
    slug: z
      .string()
      .regex(/^[a-z0-9-]{1,240}$/)
      .nullable()
      .default(null),
    publishedAt: z.string().datetime().nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();
export const AgentResultSchema = z
  .object({
    // Match the maximum object count of VisualSpec. A multi-line sketch can
    // legitimately produce more than 30 point and segment entities.
    entities: z.array(EntitySchema).max(80),
    visual: VisualSpecSchema,
    title: z.string().max(200),
    explanation: z.string().max(10000),
    methods: z
      .array(
        z.object({
          id: z.string().max(50),
          label: z.string().max(150),
          description: z.string().max(500),
        }),
      )
      .max(10),
    steps: z.array(StepSchema).max(30),
    suggestions: z.array(z.string().max(300)).max(8),
    exploration: z
      .object({
        detected: z.string().max(300),
        question: z.string().max(500),
        alternatives: z
          .array(
            z
              .object({
                key: id,
                label: z.string().max(120),
                reason: z.string().max(300),
              })
              .strict(),
          )
          .max(4),
      })
      .strict()
      .optional(),
    program: VisualProgramSchema.optional(),
    source: z.enum(["template", "llm"]),
  })
  .strict();
export type VisualSpec = z.infer<typeof VisualSpecSchema>;
export type VisualObject = z.infer<typeof ObjectSchema>;
export type ThreeVisualObject = z.infer<typeof ThreeObjectSchema>;
export type TwoDVisualSpec = z.infer<typeof TwoDVisualSpecSchema>;
export type ThreeVisualSpec = z.infer<typeof ThreeVisualSpecSchema>;
export type VisualAction = z.infer<typeof ActionSchema>;
export type Material = z.infer<typeof MaterialSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type VisualStateSummary = {
  visualId: string;
  parameters: Record<string, number>;
  objects: Record<string, { x?: number; y?: number; visible?: boolean }>;
};
export type VisualProgram = z.infer<typeof VisualProgramSchema>;

export function isThreeVisual(spec: VisualSpec): spec is ThreeVisualSpec {
  return spec.dimension === "3d";
}
