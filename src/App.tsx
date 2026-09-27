import { useMemo, useState } from "react";
import "./styles.css";
import { loadTickets, nowLocal, resetTickets, saveTickets } from "./storage";
import {
  constructionListCsv,
  canExportConstructionList,
  findOpenTicket,
  fmtTime,
  HAZARD_TYPES,
  HazardTicket,
  highestSeverity,
  Inspection,
  latestInspection,
  MARKER_POSITIONS,
  MarkerPosition,
  registerFinding,
  reviewTicket,
  Severity,
  STATUS_CLOSED,
  STATUS_DISPOSAL,
  STATUS_REVIEW,
  TicketStatus,
  closeTicket,
} from "./rules";

type StatusFilter = "全部" | TicketStatus;

interface FormState {
  building: string;
  componentNo: string;
  part: string;
  hazardType: string;
  severity: Severity;
  inspector: string;
  time: string;
  content: string;
  conclusion: string;
  dimName: string;
  dimValue: string;
  markerPos: MarkerPosition;
  markerLabel: string;
}

const emptyForm = (): FormState => ({
  building: "",
  componentNo: "",
  part: "",
  hazardType: HAZARD_TYPES[0],
  severity: "一般",
  inspector: "",
  time: nowLocal(),
  content: "",
  conclusion: "",
  dimName: "",
  dimValue: "",
  markerPos: "节点",
  markerLabel: "",
});

const STATUS_FILTERS: StatusFilter[] = ["全部", STATUS_REVIEW, STATUS_DISPOSAL, STATUS_CLOSED];

const POSITION_X: Record<MarkerPosition, number> = {
  左端: 58,
  节点: 158,
  中段: 222,
  右端: 342,
};

function StatusPill({ status }: { status: TicketStatus }) {
  const cls =
    status === STATUS_REVIEW ? "pill-review" : status === STATUS_CLOSED ? "pill-closed" : "pill-disposal";
  return <span className={`pill ${cls}`}>{status}</span>;
}

function DiseaseDiagram({ ticket }: { ticket: HazardTicket }) {
  const locked = ticket.status === STATUS_REVIEW;
  return (
    <div className={`diagram-wrap ${locked ? "locked" : ""}`}>
      <svg viewBox="0 0 400 120" role="img" aria-label="构件病害标记示意图">
        <rect x="20" y="48" width="360" height="28" rx="3" className="beam" />
        <rect x="150" y="40" width="20" height="44" className="joint" />
        <text x="58" y="104" textAnchor="middle" className="svg-label">左端</text>
        <text x="160" y="104" textAnchor="middle" className="svg-label">节点</text>
        <text x="222" y="104" textAnchor="middle" className="svg-label">中段</text>
        <text x="342" y="104" textAnchor="middle" className="svg-label">右端</text>
        {ticket.markers.map((m, idx) => {
          const x = POSITION_X[m.position];
          const y = idx % 2 === 0 ? 30 : 18;
          return (
            <g key={m.id}>
              <line x1={x} y1={y + 8} x2={x} y2="48" className="marker-line" />
              <circle cx={x} cy={y} r="7" className="marker-dot" />
              <text x={x} y={y - 11} textAnchor="middle" className="marker-label">{m.label}</text>
            </g>
          );
        })}
      </svg>
      {locked && <div className="lock-mask">待复核</div>}
    </div>
  );
}

function InspectionCard({ insp }: { insp: Inspection }) {
  return (
    <article className="inspection">
      <header>
        <b>第{insp.seq}次检查</b>
        <span>{fmtTime(insp.time)}</span>
        <span className="tag">{insp.hazardType}</span>
        <span className={insp.severity === "严重" ? "tag tag-severe" : "tag"}>{insp.severity}</span>
      </header>
      <p className="kv"><span>部位</span>{insp.part}</p>
      <p className="kv"><span>检查人</span>{insp.inspector}</p>
      <p className="kv"><span>检查内容</span>{insp.content}</p>
      <p className="kv"><span>结论</span>{insp.conclusion || "（本次未填结论）"}</p>
    </article>
  );
}

function App() {
  const [tickets, setTickets] = useState<HazardTicket[]>(() => loadTickets());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("全部");
  const [typeFilter, setTypeFilter] = useState<string>("全部");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [notice, setNotice] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [reviewer, setReviewer] = useState("");
  const [reviewComment, setReviewComment] = useState("");
  const [handler, setHandler] = useState("");
  const [opinion, setOpinion] = useState("");

  const persist = (next: HazardTicket[]) => {
    setTickets(next);
    saveTickets(next);
  };

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const counts = useMemo(
    () => ({
      total: tickets.length,
      review: tickets.filter((t) => t.status === STATUS_REVIEW).length,
      disposal: tickets.filter((t) => t.status === STATUS_DISPOSAL).length,
      closed: tickets.filter((t) => t.status === STATUS_CLOSED).length,
    }),
    [tickets]
  );

  const buildings = useMemo(() => Array.from(new Set(tickets.map((t) => t.building))), [tickets]);
  const components = useMemo(
    () => Array.from(new Set(tickets.map((t) => `${t.building} ${t.componentNo}`))),
    [tickets]
  );

  const filtered = useMemo(
    () =>
      tickets
        .filter((t) => statusFilter === "全部" || t.status === statusFilter)
        .filter((t) => typeFilter === "全部" || latestInspection(t).hazardType === typeFilter)
        .slice()
        .sort((a, b) => latestInspection(b).time.localeCompare(latestInspection(a).time)),
    [tickets, statusFilter, typeFilter]
  );

  const openHint = findOpenTicket(tickets, form.building, form.componentNo);
  const exportable = canExportConstructionList(tickets);

  const update = (patch: Partial<FormState>) => {
    setForm((f) => ({ ...f, ...patch }));
    setError("");
  };

  const submitFinding = () => {
    try {
      const result = registerFinding(
        tickets,
        { building: form.building, componentNo: form.componentNo },
        {
          time: form.time,
          inspector: form.inspector,
          part: form.part,
          hazardType: form.hazardType,
          severity: form.severity,
          content: form.content,
          conclusion: form.conclusion,
          dimension:
            form.dimName.trim() || form.dimValue.trim()
              ? { name: form.dimName, value: form.dimValue }
              : undefined,
          marker:
            form.markerLabel.trim() || form.part.trim()
              ? { position: form.markerPos, label: form.markerLabel || form.part }
              : undefined,
        }
      );
      persist(result.tickets);
      setSelectedId(result.ticketId);
      setNotice(
        result.appended
          ? `该构件有未关闭原单 ${result.ticketId}，本次检查已追加，未另开新单。`
          : `已登记处置单 ${result.ticketId}。`
      );
      setForm((f) => ({
        ...emptyForm(),
        building: f.building,
        componentNo: f.componentNo,
        inspector: f.inspector,
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "登记失败");
    }
  };

  const doReview = (passed: boolean) => {
    if (!selected) return;
    try {
      const next = reviewTicket(selected, { reviewer, comment: reviewComment, passed, time: nowLocal() });
      persist(tickets.map((t) => (t.id === next.id ? next : t)));
      setReviewer("");
      setReviewComment("");
      setNotice(passed ? `处置单 ${next.id} 复核通过，可填写处置意见关闭。` : `处置单 ${next.id} 复核退回，仍处待复核，需补充检查后再次复核。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "复核失败");
    }
  };

  const doClose = () => {
    if (!selected) return;
    try {
      const next = closeTicket(selected, { handler, opinion, time: nowLocal() });
      persist(tickets.map((t) => (t.id === next.id ? next : t)));
      setHandler("");
      setOpinion("");
      setNotice(`处置单 ${next.id} 已填写处置意见并关闭，检查记录全部保留。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "关闭失败");
    }
  };

  const doExport = () => {
    try {
      const csv = constructionListCsv(tickets);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "施工清单.csv";
      a.click();
      URL.revokeObjectURL(url);
      setNotice("施工清单已导出（仅含已关闭处置单）。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "导出失败");
    }
  };

  const doReset = () => {
    const seed = resetTickets();
    setTickets(seed);
    setSelectedId(null);
    setNotice("已恢复示例台账。");
    setError("");
  };

  return (
    <main className="app">
      <section className="hero">
        <p>雨后巡查 · 隐患处置台 · 一构件一处置单</p>
        <h1>木结构隐患处置台账</h1>
        <span>
          纸单回工棚直接登记：建筑、构件编号、部位、类型、等级、发现人和时刻。同一构件仍有未关闭处置单时，复查只追加检查内容并沿用原单；严重隐患须他人复核，复核通过后才能填写处置意见关闭，每次检查的时间与结论均留痕。
        </span>
      </section>

      <section className="metrics">
        <article><small>处置单</small><strong>{counts.total}</strong></article>
        <article><small>待复核</small><strong className="num-warn">{counts.review}</strong></article>
        <article><small>待处置</small><strong>{counts.disposal}</strong></article>
        <article><small>已关闭</small><strong className="num-ok">{counts.closed}</strong></article>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>清单筛选</h2>
          <p className="filter-label">状态</p>
          <div className="chips">
            {STATUS_FILTERS.map((s) => (
              <button key={s} className={statusFilter === s ? "chip-on" : ""} onClick={() => setStatusFilter(s)}>
                {s}
              </button>
            ))}
          </div>
          <p className="filter-label">病害类型</p>
          <div className="chips">
            {["全部", ...HAZARD_TYPES].map((t) => (
              <button key={t} className={typeFilter === t ? "chip-on" : ""} onClick={() => setTypeFilter(t)}>
                {t}
              </button>
            ))}
          </div>
          <hr />
          <button className="ghost" onClick={doReset}>恢复示例台账</button>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>雨后巡查登记</p>
              <h2>登记新发现 / 复查追加</h2>
            </div>
            <button className="primary" onClick={submitFinding}>登记入台账</button>
          </div>

          {openHint && (
            <div className="banner banner-hint">
              {openHint.building} {openHint.componentNo} 存在未关闭处置单 {openHint.id}（{openHint.status}），
              本次为复查，检查内容将追加到原单，不另开新单。
            </div>
          )}
          {notice && <div className="banner banner-ok" onClick={() => setNotice("")}>{notice}（点击关闭）</div>}
          {error && <div className="banner banner-err" onClick={() => setError("")}>{error}（点击关闭）</div>}

          <div className="field-grid">
            <label>
              <span>建筑 *</span>
              <input list="building-list" value={form.building} onChange={(e) => update({ building: e.target.value })} placeholder="如：大成殿" />
              <datalist id="building-list">
                {buildings.map((b) => <option key={b} value={b} />)}
              </datalist>
            </label>
            <label>
              <span>构件编号 *</span>
              <input list="component-list" value={form.componentNo} onChange={(e) => update({ componentNo: e.target.value })} placeholder="如：梁架A-03" />
              <datalist id="component-list">
                {components.map((c) => <option key={c} value={c.split(" ")[1]} />)}
              </datalist>
            </label>
            <label>
              <span>部位 *</span>
              <input value={form.part} onChange={(e) => update({ part: e.target.value })} placeholder="如：东次间五架梁端部" />
            </label>
            <label>
              <span>类型 *</span>
              <select value={form.hazardType} onChange={(e) => update({ hazardType: e.target.value })}>
                {HAZARD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </label>
            <label>
              <span>等级 *</span>
              <select value={form.severity} onChange={(e) => update({ severity: e.target.value as Severity })}>
                <option value="一般">一般</option>
                <option value="严重">严重（须他人复核）</option>
              </select>
            </label>
            <label>
              <span>发现人 *</span>
              <input value={form.inspector} onChange={(e) => update({ inspector: e.target.value })} placeholder="巡查人姓名" />
            </label>
            <label>
              <span>发现时刻 *</span>
              <input type="datetime-local" value={form.time} onChange={(e) => update({ time: e.target.value })} />
            </label>
            <label>
              <span>检查内容 *</span>
              <input value={form.content} onChange={(e) => update({ content: e.target.value })} placeholder="渗水、裂缝、松动等具体情况" />
            </label>
            <label className="span-2">
              <span>本次检查结论（可留空，后续补填）</span>
              <input value={form.conclusion} onChange={(e) => update({ conclusion: e.target.value })} placeholder="如：裂缝稳定，继续监测" />
            </label>
            <label>
              <span>随附尺寸-名称</span>
              <input value={form.dimName} onChange={(e) => update({ dimName: e.target.value })} placeholder="如：裂缝长" />
            </label>
            <label>
              <span>随附尺寸-数值</span>
              <input value={form.dimValue} onChange={(e) => update({ dimValue: e.target.value })} placeholder="如：90mm" />
            </label>
            <label>
              <span>病害图位置</span>
              <select value={form.markerPos} onChange={(e) => update({ markerPos: e.target.value as MarkerPosition })}>
                {MARKER_POSITIONS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </label>
            <label>
              <span>病害标记文字</span>
              <input value={form.markerLabel} onChange={(e) => update({ markerLabel: e.target.value })} placeholder="留空则用部位名" />
            </label>
          </div>
        </section>
      </section>

      <section className="panel list-panel">
        <div className="heading">
          <div>
            <p>隐患清单</p>
            <h2>处置单（{filtered.length}）</h2>
          </div>
          <button
            className={exportable ? "primary" : "primary disabled-btn"}
            onClick={exportable ? doExport : undefined}
            disabled={!exportable}
            title={exportable ? "导出全部已关闭处置单" : "存在未关闭记录，全部关闭后方可导出施工清单"}
          >
            导出施工清单
          </button>
        </div>
        <div className="records">
          {filtered.map((t) => {
            const last = latestInspection(t);
            return (
              <article
                key={t.id}
                className={selectedId === t.id ? "ticket-row selected" : "ticket-row"}
                onClick={() => setSelectedId(t.id)}
              >
                <b>{t.status === STATUS_REVIEW ? "!" : String(t.inspections.length)}</b>
                <div className="ticket-main">
                  <h3>
                    {t.building} · {t.componentNo}
                    <StatusPill status={t.status} />
                    {highestSeverity(t) === "严重" && <span className="tag tag-severe">严重</span>}
                  </h3>
                  <p>
                    {t.id} · 第{last.seq}次：{last.part} · {last.hazardType} · {last.severity} · {fmtTime(last.time)}
                  </p>
                </div>
              </article>
            );
          })}
          {filtered.length === 0 && <p className="empty">当前筛选下没有处置单。</p>}
        </div>
      </section>

      {selected && (
        <section className="panel detail">
          <div className="heading">
            <div>
              <p>处置单详情</p>
              <h2>{selected.id} · {selected.building} {selected.componentNo}</h2>
            </div>
            <StatusPill status={selected.status} />
          </div>

          <div className="detail-grid">
            <div>
              <h3>检查记录（每次检查的时间与结论均保留）</h3>
              <div className="timeline">
                {selected.inspections.map((i) => <InspectionCard key={i.id} insp={i} />)}
              </div>

              <h3>尺寸表</h3>
              <div className={`table-wrap ${selected.status === STATUS_REVIEW ? "locked" : ""}`}>
                <table className="dim-table">
                  <thead><tr><th>序号</th><th>项目</th><th>尺寸</th><th>来源</th></tr></thead>
                  <tbody>
                    {selected.dimensions.map((d, idx) => (
                      <tr key={d.id}>
                        <td>{idx + 1}</td>
                        <td>{d.name}</td>
                        <td>{d.value}</td>
                        <td>第{selected.inspections.find((i) => i.id === d.inspectionId)?.seq ?? "-"}次检查</td>
                      </tr>
                    ))}
                    {selected.dimensions.length === 0 && (
                      <tr><td colSpan={4} className="empty-cell">暂无尺寸记录</td></tr>
                    )}
                  </tbody>
                </table>
                {selected.status === STATUS_REVIEW && <div className="lock-mask">待复核</div>}
              </div>
            </div>

            <div>
              <h3>病害图</h3>
              <DiseaseDiagram ticket={selected} />
              {selected.status === STATUS_REVIEW && (
                <p className="lock-note">严重隐患复核前，清单、尺寸表与病害图均标记「待复核」。</p>
              )}

              {selected.status === STATUS_REVIEW && (
                <div className="action-box">
                  <h3>他人复核</h3>
                  <label>
                    <span>复核人（不得为发现人 {latestInspection(selected).inspector}）</span>
                    <input value={reviewer} onChange={(e) => setReviewer(e.target.value)} placeholder="复核人姓名" />
                  </label>
                  <label>
                    <span>复核意见</span>
                    <input value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="现场复核情况" />
                  </label>
                  <div className="btn-row">
                    <button className="primary" onClick={() => doReview(true)}>复核通过</button>
                    <button onClick={() => doReview(false)}>退回补充检查</button>
                  </div>
                </div>
              )}

              {selected.status === STATUS_DISPOSAL && (
                <div className="action-box">
                  <h3>填写处置意见并关闭</h3>
                  <label>
                    <span>处置人</span>
                    <input value={handler} onChange={(e) => setHandler(e.target.value)} placeholder="负责处置的木匠/工长" />
                  </label>
                  <label>
                    <span>处置意见</span>
                    <input value={opinion} onChange={(e) => setOpinion(e.target.value)} placeholder="如：剔补糟朽层后墩接柱脚" />
                  </label>
                  <div className="btn-row">
                    <button className="primary" onClick={doClose}>关闭处置单</button>
                  </div>
                </div>
              )}

              {selected.status === STATUS_CLOSED && selected.disposal && (
                <div className="action-box closed-box">
                  <h3>处置结论（已关闭）</h3>
                  <p className="kv"><span>处置人</span>{selected.disposal.handler}</p>
                  <p className="kv"><span>处置时间</span>{fmtTime(selected.disposal.time)}</p>
                  <p className="kv"><span>处置意见</span>{selected.disposal.opinion}</p>
                </div>
              )}

              {selected.reviews.length > 0 && (
                <>
                  <h3>复核历史</h3>
                  <div className="review-list">
                    {selected.reviews.map((r, idx) => (
                      <p key={idx} className="kv">
                        <span>{r.passed ? "通过" : "退回"} · {fmtTime(r.time)} · {r.reviewer}</span>
                        {r.comment || "（无意见）"}
                      </p>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
