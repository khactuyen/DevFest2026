"use client";
import { useMemo, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, Save, Sparkles, Check, ChevronRight } from "lucide-react";
import { Visual } from "./Visual";
import { MathInput } from "./MathInput";
import { FormattedAIAnswer } from "./FormattedMath";
import { pattern, patternNames } from "@/lib/patterns";
import { threePattern, threePatternNames } from "@/lib/three-patterns";
import { getModelReadout } from "@/lib/model-inspector";
import {
  getLearningSection,
  type LearningSection,
  type LearningTab,
} from "@/lib/model-learning";
import { getLearningSources } from "@/lib/learning-sources";
import { makeMaterial } from "@/lib/material-factory";
import { request } from "@/lib/client";
import type {
  AgentResult,
  Material,
  VisualSpec,
  VisualStateSummary,
} from "@/lib/contracts";
import type { VisualRuntime } from "@/lib/runtime";
import type { ThreeVisualRuntime } from "@/lib/three-runtime";

const modelNames: Record<string, string> = { ...patternNames, ...threePatternNames };

export function Playground() {
  const params = useSearchParams(),
    router = useRouter();
  const requestedPattern = params.get("pattern") || "quadratic-roots";
  const [mode, setMode] = useState(params.get("mode") || "explore"),
    [prompt, setPrompt] = useState(
      modelNames[requestedPattern] || "y = ax²",
    ),
    [selected, setSelected] = useState(requestedPattern);
  const initial = useMemo(() => {
    if (Object.hasOwn(patternNames, selected)) return pattern(selected);
    if (Object.hasOwn(threePatternNames, selected))
      return threePattern(selected as keyof typeof threePatternNames);
    return pattern("quadratic-roots");
  }, [selected]);
  const [result, setResult] = useState<AgentResult | null>(null),
    [visual, setVisual] = useState<VisualSpec | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [step, setStep] = useState(-1),
    [insight, setInsight] = useState<LearningSection | null>(null),
    [math, setMath] = useState(false),
    [visualState, setVisualState] = useState<VisualStateSummary>();
  const runtime = useRef<VisualRuntime | ThreeVisualRuntime>(undefined),
    state = useRef<VisualStateSummary>(undefined);
  const current = visual || initial;
  const currentValues =
    visualState?.parameters ||
    Object.fromEntries(current.parameters.map((parameter) => [parameter.id, parameter.value]));
  const modelReadout = useMemo(
    () => getModelReadout(selected, currentValues),
    [currentValues, selected],
  );
  const learningSources = useMemo(() => getLearningSources(selected), [selected]);
  /**
   * A renderer can be remounted while the learner changes a model.  Keep the
   * React state as the durable source for parameter values, and only accept a
   * runtime snapshot when it belongs to the visual currently on screen.
   */
  function visualForPersistence(): VisualSpec {
    const runtimeSnapshot = runtime.current?.serialized();
    const base: VisualSpec =
      (runtimeSnapshot?.source?.key === current.source?.key
        ? runtimeSnapshot
        : structuredClone(current)) as VisualSpec;
    const latestState = state.current;
    if (latestState?.visualId !== base.id) return base;

    return {
      ...base,
      parameters: base.parameters.map((parameter) => {
        const value = latestState.parameters[parameter.id];
        return typeof value === "number" ? { ...parameter, value } : parameter;
      }),
    };
  }
  async function generate(method?: string) {
    setBusy(true);
    setError("");
    try {
      const data = await request<AgentResult & { material?: Material }>(
        `/api/agent/${mode === "author" ? "material" : mode}`,
        {
          method: "POST",
          body: JSON.stringify({
            prompt,
            method,
            pattern:
              mode !== "solve" && Object.hasOwn(modelNames, selected) &&
              prompt === modelNames[selected]
                ? selected
                : undefined,
            visual: current,
            state: state.current,
          }),
        },
      );
      setResult(data);
      setVisual(data.visual);
      state.current = undefined;
      setVisualState(undefined);
      const resolvedKey = data.visual.source?.key;
      if (resolvedKey && Object.hasOwn(modelNames, resolvedKey)) {
        setSelected(resolvedKey);
      }
      setStep(-1);
      setInsight(null);
      if (mode === "author" && data.material) {
        const saved = await request<Material>("/api/materials", {
          method: "POST",
          body: JSON.stringify(data.material),
        });
        router.push(`/material/${saved.id}/edit`);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const r = result || {
        title: modelNames[selected],
        explanation: current.accessibility?.description || "",
        visual: current,
        entities: [],
        methods: [],
        steps: [],
        suggestions: [],
        source: "template" as const,
      };
      const material = makeMaterial(r, visualForPersistence());
      const saved = await request<Material>("/api/materials", {
        method: "POST",
        body: JSON.stringify(material),
      });
      router.push(`/material/${saved.id}/edit`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function choose(key: string) {
    setSelected(key);
    setVisual(null);
    setResult(null);
    setPrompt(modelNames[key]);
    setStep(-1);
    setInsight(null);
    state.current = undefined;
    setVisualState(undefined);
  }
  return (
    <>
      <header className="topbar">
        <span>
          Không gian của bạn <span className="slash">/</span>{" "}
          <strong>Playground</strong>
        </span>
        <button className="outline" onClick={save} disabled={busy}>
          <Save size={15} /> Lưu thành học liệu
        </button>
      </header>
      <main className="playground">
        <div className="workspace-heading">
          <div>
            <div className="eyebrow">THỬ · QUAN SÁT · THẤU HIỂU</div>
            <h1>Không gian khám phá</h1>
          </div>
          <div className="mode-tabs">
            {[
              ["explore", "Khám phá"],
              ["solve", "Giải toán"],
              ["author", "Soạn bài"],
            ].map(([id, label]) => (
              <button
                className={mode === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setMode(id);
                  setResult(null);
                  setStep(-1);
                  setError("");
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="workspace-grid">
          <section className="canvas-panel">
            <div className="canvas-heading">
              <span>
                01 <strong>Trực quan hóa</strong>
              </span>
              <select
                aria-label="Mẫu trực quan"
                value={selected}
                onChange={(e) => choose(e.target.value)}
              >
                <optgroup label="Mô hình 2D">
                  {Object.entries(patternNames).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </optgroup>
                <optgroup label="Mô hình 3D">
                  {Object.entries(threePatternNames).map(([key, name]) => (
                    <option key={key} value={key}>{name}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <Visual
              spec={current}
              ref={runtime}
              onState={(s) => {
                state.current = s;
                setVisualState(s);
              }}
            />
            <div className="entity-list">
              <span>ĐỐI TƯỢNG</span>
              {(
                result?.entities ||
                current.objects.map((o) => ({
                  id: o.id,
                  label: o.label || o.id,
                }))
              ).map((e) => (
                <button
                  key={e.id}
                  onClick={() =>
                    runtime.current?.actions([
                      { type: "focus", targets: [e.id] },
                    ])
                  }
                >
                  <span className="entity-dot" />
                  {e.label}
                </button>
              ))}
            </div>
          </section>
          <section className="explanation-panel">
            <div className="panel-label">
              <Sparkles size={16} /> CÙNG NHAU TÌM HIỂU{" "}
              <span>{result?.source === "llm" ? "AI" : "Mẫu toán học"}</span>
            </div>
            <h2>{result?.title || modelNames[selected]}</h2>
            <p className="intro-text">
              {result?.explanation ||
                (mode === "solve"
                  ? "Nhập một phương trình bậc hai. Bạn sẽ chọn cách giải trước khi khám phá từng bước."
                  : "Toán học trở nên rõ ràng hơn khi bạn có thể chạm vào nó. Thử thay đổi tham số và quan sát điều gì giữ nguyên, điều gì thay đổi.")}
            </p>
            <section className="model-inspector" aria-label={`Thông tin ${modelNames[selected]}`}>
              <div className="inspector-heading">
                <div><span>ĐỌC HÌNH TRỰC TIẾP</span><strong>{modelReadout.heading}</strong></div>
                <em>Live</em>
              </div>
              <div className="formula-readout">{modelReadout.formula}</div>
              <div className="metric-grid">
                {modelReadout.metrics.map((metric) => <article key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></article>)}
              </div>
              <ul className="math-observations">
                {modelReadout.observations.map((observation, index) => <li key={observation}><span>{String(index + 1).padStart(2, "0")}</span>{observation}</li>)}
              </ul>
              {modelReadout.note && <p className="inspector-note">{modelReadout.note}</p>}
              {modelReadout.focus.length > 0 && <div className="focus-actions" aria-label="Làm nổi bật trên hình">
                {modelReadout.focus.map((action) => <button key={action.label} onClick={() => runtime.current?.actions([{ type: "focus", targets: action.targets }])}>{action.label}</button>)}
              </div>}
            </section>
            {!result && (
              <div className="tip">
                <span>✳</span>
                <div>
                  <strong>Bắt đầu bằng một thay đổi nhỏ</strong>
                  <p>
                    Kéo thanh trượt hoặc chọn một đối tượng để làm nổi bật nó
                    trên hình.
                  </p>
                </div>
              </div>
            )}
            {result?.methods.length !== 0 && result?.methods && (
              <div className="methods">
                <h3>Chọn cách tiếp cận</h3>
                {result.methods.map((m) => (
                  <button
                    disabled={busy}
                    key={m.id}
                    onClick={() => generate(m.id)}
                  >
                    <div>
                      <strong>{m.label}</strong>
                      <small>{m.description}</small>
                    </div>
                    <ChevronRight size={16} />
                  </button>
                ))}
              </div>
            )}
            {mode === "explore" && result?.exploration && (
              <section className="explore-result" aria-label="Kết quả nhận diện chủ đề">
                <div className="explore-result-heading">
                  <span>ĐÃ NHẬN DIỆN</span>
                  <strong>{result.exploration.detected}</strong>
                </div>
                <p>{result.exploration.question}</p>
                {result.exploration.alternatives.length > 1 && (
                  <div className="explore-alternatives">
                    <small>Mô hình liên quan</small>
                    {result.exploration.alternatives.map((alternative) => (
                      <button
                        className={alternative.key === selected ? "active" : ""}
                        key={alternative.key}
                        onClick={() => choose(alternative.key)}
                        title={alternative.reason}
                      >
                        {alternative.label}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            )}
            {result?.steps.map((s, i) => (
              <button
                className={"solution-step " + (step === i ? "active" : "")}
                key={s.id}
                onClick={() => {
                  setStep(i);
                  runtime.current?.actions(s.visualActions);
                }}
              >
                <span className="step-number">
                  {step === i ? <Check size={14} /> : i + 1}
                </span>
                <div>
                  <strong>{s.title}</strong>
                  <FormattedAIAnswer text={s.content} />
                </div>
              </button>
            ))}
            {mode !== "solve" && (
              <>
                <div className="section-divider" />
                <h3>Bạn muốn hiểu thêm điều gì?</h3>
                <div className="suggestions">
                  {(["Giới thiệu", "Tính chất", "Ứng dụng", "Thử ví dụ"] as LearningTab[]).map(
                    (tab) => (
                      <button
                        key={tab}
                        onClick={() => {
                          setInsight(getLearningSection(selected, tab, modelReadout));
                        }}
                      >
                        {tab}
                        <ArrowRight size={13} />
                      </button>
                    ),
                  )}
                </div>
                {insight && (
                  <section className="learning-detail" aria-live="polite">
                    <header>
                      <div>
                        <span>HỌC CÙNG MÔ HÌNH</span>
                        <h4>{insight.title}</h4>
                      </div>
                      <button aria-label="Đóng nội dung học" onClick={() => setInsight(null)}>×</button>
                    </header>
                    <p>{insight.lead}</p>
                    <div className="learning-flow" aria-label="Lộ trình học tập">
                      {[
                        ["Quan sát", "Giới thiệu"],
                        ["Khái quát", "Tính chất"],
                        ["Áp dụng", "Ứng dụng"],
                        ["Kiểm chứng", "Thử ví dụ"],
                      ].map(([label, tab], index) => (
                        <span className={tab === insight.tab ? "active" : ""} key={label}>
                          <b>{index + 1}</b>{label}
                        </span>
                      ))}
                    </div>
                    {insight.groups.map((group) => (
                      <div className="learning-group" key={group.label}>
                        <strong>{group.label}</strong>
                        <ol>
                          {group.items.map((item) => <li key={item}>{item}</li>)}
                        </ol>
                      </div>
                    ))}
                    <footer className="learning-sources">
                      <strong>Nguồn học liệu mở</strong>
                      <p>
                        {learningSources.some((source) => source.role === "adapted")
                          ? "Bản tiếng Việt do Math Vision AI biên soạn theo nguồn CC BY 4.0 được ghi bên dưới; không dùng logo hoặc hình minh họa của nhà xuất bản."
                          : "Nội dung do Math Vision AI biên soạn bằng tiếng Việt; các nguồn dưới đây để đối chiếu và học tiếp, không sao chép nguyên văn."}
                      </p>
                      {learningSources.map((source) => (
                        <a href={source.url} key={source.url} rel="noreferrer" target="_blank">
                          <span>{source.role === "adapted" ? "BIÊN SOẠN THEO" : source.provider}</span>
                          <div>
                            <b>{source.title}</b>
                            <small>{source.license} · {source.use}</small>
                            {source.attribution && <small className="source-attribution">{source.attribution}</small>}
                          </div>
                          <ArrowRight size={13} />
                        </a>
                      ))}
                    </footer>
                  </section>
                )}
              </>
            )}
          </section>
        </div>
        <section className="prompt-panel">
          <label htmlFor="prompt">
            {mode === "author"
              ? "Bạn muốn tạo bài học nào?"
              : "Bạn đang tò mò về điều gì?"}
          </label>
          <div className="prompt-row">
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              maxLength={8000}
              rows={2}
              placeholder="Nhập khái niệm, công thức hoặc bài toán…"
            />
            <button
              className="primary"
              disabled={busy || !prompt.trim()}
              onClick={() => generate()}
            >
              {busy
                ? "Đang xử lý…"
                : mode === "author"
                  ? "Tạo bản nháp"
                  : "Khám phá"}
              <ArrowRight size={16} />
            </button>
          </div>
          <div className="prompt-bottom">
            <button className="subtle" onClick={() => setMath(!math)}>
              ƒx {math ? "Ẩn" : "Nhập"} công thức
            </button>
            <small>
              Canvas cập nhật trực tiếp · Lưu trạng thái khi tạo học liệu
            </small>
          </div>
          {math && <MathInput onChange={setPrompt} />}{" "}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
      </main>
    </>
  );
}
