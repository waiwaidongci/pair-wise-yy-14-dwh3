import { FormEvent, useState } from "react";
import {
  HAZARD_GRADES,
  HAZARD_TYPES,
  HazardGrade,
  HazardOrder,
  HazardType,
  OrderStatus,
  RuleError,
  buildConstructionCsv,
  closeHazard,
  exportableOrders,
  findOpenOrder,
  isOpenOrder,
  registerHazard,
  reviewHazard,
} from "./business/hazardRules";
import { loadDimensions, loadOrders, saveOrders } from "./business/hazardStore";
import "./styles.css";

const pad = (n: number) => String(n).padStart(2, "0");

function nowLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtTime(t: string): string {
  return t ? t.slice(0, 16).replace("T", " ") : "—";
}

function hashOf(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const TYPE_COLORS: Record<HazardType, string> = { 渗水: "#0f766e", 裂缝: "#b45309", 松动: "#475569" };

const STATUS_CLASS: Record<OrderStatus, string> = {
  待复核: "tag st-review",
  待处置: "tag st-open",
  已关闭: "tag st-closed",
};

const GRADE_CLASS: Record<HazardGrade, string> = {
  一般: "tag g-normal",
  较大: "tag g-major",
  严重: "tag g-severe",
};

interface RegisterForm {
  building: string;
  componentNo: string;
  location: string;
  type: HazardType;
  grade: HazardGrade;
  discoverer: string;
  foundAt: string;
  content: string;
  conclusion: string;
}

const emptyForm = (): RegisterForm => ({
  building: "",
  componentNo: "",
  location: "",
  type: "渗水",
  grade: "一般",
  discoverer: "",
  foundAt: nowLocal(),
  content: "",
  conclusion: "",
});

interface OrderCardProps {
  order: HazardOrder;
  reviewDraft: { reviewer: string; note: string };
  closeDraft: { opinion: string; by: string };
  onReviewDraft: (patch: Partial<{ reviewer: string; note: string }>) => void;
  onCloseDraft: (patch: Partial<{ opinion: string; by: string }>) => void;
  onReview: (result: "通过" | "退回") => void;
  onClose: () => void;
}

function OrderCard({ order, reviewDraft, closeDraft, onReviewDraft, onCloseDraft, onReview, onClose }: OrderCardProps) {
  return (
    <article className="order-card">
      <header>
        <div className="order-title">
          <b>{order.id}</b>
          <div>
            <h3>
              {order.building} · {order.componentNo}
            </h3>
            <p>
              {order.location} · {order.type} · 发现人 {order.discoverer} · {fmtTime(order.foundAt)}
            </p>
          </div>
        </div>
        <div className="tags">
          <span className={GRADE_CLASS[order.grade]}>{order.grade}</span>
          <span className={STATUS_CLASS[order.status]}>{order.status}</span>
        </div>
      </header>

      <div className="inspections">
        <h4>检查记录（{order.inspections.length}）</h4>
        <ul>
          {order.inspections.map((ins) => (
            <li key={ins.id}>
              <time>{fmtTime(ins.time)}</time>
              <div>
                <b>{ins.inspector}</b>
                <p>{ins.content}</p>
                <em>结论：{ins.conclusion}</em>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {order.reviews.length > 0 && (
        <div className="reviews">
          <h4>复核记录</h4>
          <ul>
            {order.reviews.map((r, i) => (
              <li key={`${r.time}-${i}`}>
                <time>{fmtTime(r.time)}</time>
                <span>
                  {r.reviewer}：{r.result}
                  {r.note ? `（${r.note}）` : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {order.status === "待复核" && (
        <div className="action-box">
          <p className="hint">
            严重隐患待复核，复核人须为发现人（{order.discoverer}）以外的人；复核通过前，清单、尺寸表与病害图均显示待复核。
          </p>
          <div className="inline-form">
            <input
              placeholder="复核人"
              value={reviewDraft.reviewer}
              onChange={(e) => onReviewDraft({ reviewer: e.target.value })}
            />
            <input
              className="grow"
              placeholder="复核意见（选填）"
              value={reviewDraft.note}
              onChange={(e) => onReviewDraft({ note: e.target.value })}
            />
            <button className="primary" onClick={() => onReview("通过")}>
              复核通过
            </button>
            <button onClick={() => onReview("退回")}>退回</button>
          </div>
        </div>
      )}

      {order.status === "待处置" && (
        <div className="action-box">
          <div className="inline-form">
            <input
              className="grow"
              placeholder="处置意见"
              value={closeDraft.opinion}
              onChange={(e) => onCloseDraft({ opinion: e.target.value })}
            />
            <input
              placeholder="处置人"
              value={closeDraft.by}
              onChange={(e) => onCloseDraft({ by: e.target.value })}
            />
            <button className="primary" onClick={onClose}>
              填写处置意见并关闭
            </button>
          </div>
        </div>
      )}

      {order.status === "已关闭" && (
        <div className="closed-box">
          <p>
            <b>处置意见：</b>
            {order.disposalOpinion}
          </p>
          <p className="hint">
            处置人 {order.closedBy} · 关闭于 {fmtTime(order.closedAt)}
          </p>
        </div>
      )}
    </article>
  );
}

function App() {
  const [orders, setOrders] = useState<HazardOrder[]>(() => loadOrders());
  const [dimensions] = useState(() => loadDimensions());
  const [form, setForm] = useState<RegisterForm>(emptyForm);
  const [typeFilter, setTypeFilter] = useState<"全部" | HazardType>("全部");
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, { reviewer: string; note: string }>>({});
  const [closeDrafts, setCloseDrafts] = useState<Record<string, { opinion: string; by: string }>>({});
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const applyOrders = (next: HazardOrder[]) => {
    setOrders(next);
    saveOrders(next);
  };

  const ruleMessage = (err: unknown, fallback: string) =>
    err instanceof RuleError ? err.message : fallback;

  const submitRegister = (e: FormEvent) => {
    e.preventDefault();
    try {
      const result = registerHazard(orders, form);
      applyOrders(result.orders);
      setBanner({
        kind: "ok",
        text: result.merged
          ? `${result.order.componentNo} 还有未关闭隐患，已追加检查内容并沿用原单 ${result.order.id}`
          : result.order.status === "待复核"
            ? `已登记 ${result.order.id}，严重隐患待复核`
            : `已登记 ${result.order.id}，待处置`,
      });
      setForm({ ...emptyForm(), building: form.building, discoverer: form.discoverer });
    } catch (err) {
      setBanner({ kind: "err", text: ruleMessage(err, "登记失败") });
    }
  };

  const submitReview = (orderId: string, result: "通过" | "退回") => {
    const draft = reviewDrafts[orderId] ?? { reviewer: "", note: "" };
    try {
      applyOrders(reviewHazard(orders, orderId, draft.reviewer, result, draft.note, nowLocal()));
      setBanner({
        kind: "ok",
        text: result === "通过" ? `${orderId} 复核通过，转入待处置` : `${orderId} 已退回，继续待复核`,
      });
    } catch (err) {
      setBanner({ kind: "err", text: ruleMessage(err, "复核失败") });
    }
  };

  const submitClose = (orderId: string) => {
    const draft = closeDrafts[orderId] ?? { opinion: "", by: "" };
    try {
      applyOrders(closeHazard(orders, orderId, draft.opinion, draft.by, nowLocal()));
      setBanner({ kind: "ok", text: `${orderId} 已填写处置意见并关闭` });
    } catch (err) {
      setBanner({ kind: "err", text: ruleMessage(err, "关闭失败") });
    }
  };

  const exportCsv = () => {
    const list = exportableOrders(orders);
    if (list.length === 0) {
      setBanner({ kind: "err", text: "没有已关闭记录，未关闭记录不能导出施工清单" });
      return;
    }
    const blob = new Blob(["﻿" + buildConstructionCsv(orders)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `施工清单-${nowLocal().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setBanner({ kind: "ok", text: `已导出 ${list.length} 条已关闭记录，${unclosed} 条未关闭记录未纳入` });
  };

  const setReviewDraft = (id: string, patch: Partial<{ reviewer: string; note: string }>) =>
    setReviewDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { reviewer: "", note: "" }), ...patch } }));
  const setCloseDraft = (id: string, patch: Partial<{ opinion: string; by: string }>) =>
    setCloseDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? { opinion: "", by: "" }), ...patch } }));

  const pendingReview = orders.filter((o) => o.status === "待复核").length;
  const openCount = orders.filter((o) => o.status === "待处置").length;
  const closedCount = orders.filter((o) => o.status === "已关闭").length;
  const unclosed = orders.length - closedCount;

  const visibleOrders = typeFilter === "全部" ? orders : orders.filter((o) => o.type === typeFilter);
  const visibleOpen = visibleOrders.filter(isOpenOrder);
  const mergeTarget = findOpenOrder(orders, form.building, form.componentNo);

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62013 · 源提示词8 · Port 62013</p>
        <h1>雨后巡查隐患处置台账</h1>
        <span>
          渗水、裂缝、松动隐患统一登记：同一构件还有未关闭隐患时，新记录只追加检查内容并沿用原单；
          严重隐患经发现人以外的人复核后，方可填写处置意见关闭；每次检查的时间和结论均留痕，未关闭记录不导出施工清单。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>未关闭隐患</small>
          <strong>{unclosed}</strong>
        </article>
        <article>
          <small>待复核</small>
          <strong>{pendingReview}</strong>
        </article>
        <article>
          <small>待处置</small>
          <strong>{openCount}</strong>
        </article>
        <article>
          <small>已关闭</small>
          <strong>{closedCount}</strong>
        </article>
      </section>

      {banner && <div className={`banner ${banner.kind}`}>{banner.text}</div>}

      <section className="workspace">
        <aside className="panel">
          <h2>隐患类型筛选</h2>
          <div className="chips">
            {(["全部", ...HAZARD_TYPES] as const).map((t) => (
              <button key={t} className={typeFilter === t ? "active" : ""} onClick={() => setTypeFilter(t)}>
                {t}
              </button>
            ))}
          </div>
          <hr />
          <h2>施工清单</h2>
          <p className="hint">仅已关闭记录可导出；当前 {unclosed} 条未关闭记录不会纳入。</p>
          <br />
          <button className="primary block" onClick={exportCsv}>
            导出施工清单 CSV
          </button>
        </aside>

        <form className="panel form-panel" onSubmit={submitRegister}>
          <div className="heading">
            <div>
              <p>雨后巡查登记</p>
              <h2>登记隐患</h2>
            </div>
            <button type="submit" className="primary">
              保存登记
            </button>
          </div>
          <div className="field-grid">
            <label>
              <span>建筑</span>
              <input
                value={form.building}
                onChange={(e) => setForm({ ...form, building: e.target.value })}
                placeholder="如：万佛楼"
              />
            </label>
            <label>
              <span>构件编号</span>
              <input
                value={form.componentNo}
                onChange={(e) => setForm({ ...form, componentNo: e.target.value })}
                placeholder="如：梁架A-03"
              />
            </label>
            <label>
              <span>部位</span>
              <input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="如：梁端榫口"
              />
            </label>
            <label>
              <span>类型</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as HazardType })}>
                {HAZARD_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </label>
            <label>
              <span>等级</span>
              <select value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value as HazardGrade })}>
                {HAZARD_GRADES.map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </label>
            <label>
              <span>发现人</span>
              <input
                value={form.discoverer}
                onChange={(e) => setForm({ ...form, discoverer: e.target.value })}
                placeholder="巡查人姓名"
              />
            </label>
            <label>
              <span>发现时刻</span>
              <input
                type="datetime-local"
                value={form.foundAt}
                onChange={(e) => setForm({ ...form, foundAt: e.target.value })}
              />
            </label>
          </div>
          <div className="stack">
            <label>
              <span>检查内容</span>
              <textarea
                rows={2}
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                placeholder="渗水 / 裂缝 / 松动的位置、范围、程度"
              />
            </label>
            <label>
              <span>检查结论</span>
              <input
                value={form.conclusion}
                onChange={(e) => setForm({ ...form, conclusion: e.target.value })}
                placeholder="本次检查结论"
              />
            </label>
          </div>
          {mergeTarget && (
            <p className="merge-hint">
              构件 {mergeTarget.componentNo} 还有未关闭隐患单 {mergeTarget.id}
              ，提交后将只追加检查内容并沿用原单，不再开新单。
            </p>
          )}
        </form>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>隐患处置单</p>
            <h2>处置单清单</h2>
          </div>
          <span className="hint">{visibleOrders.length} 张单</span>
        </div>
        <div className="order-list">
          {visibleOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              reviewDraft={reviewDrafts[order.id] ?? { reviewer: "", note: "" }}
              closeDraft={closeDrafts[order.id] ?? { opinion: "", by: "" }}
              onReviewDraft={(patch) => setReviewDraft(order.id, patch)}
              onCloseDraft={(patch) => setCloseDraft(order.id, patch)}
              onReview={(result) => submitReview(order.id, result)}
              onClose={() => submitClose(order.id)}
            />
          ))}
          {visibleOrders.length === 0 && <p className="hint">当前筛选下没有处置单。</p>}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>测绘成果</p>
            <h2>构件尺寸记录表</h2>
          </div>
        </div>
        <table className="dim-table">
          <thead>
            <tr>
              <th>建筑</th>
              <th>构件编号</th>
              <th>木材</th>
              <th>截面尺寸</th>
              <th>长度</th>
              <th>变形情况</th>
              <th>隐患状态</th>
            </tr>
          </thead>
          <tbody>
            {dimensions.map((d) => {
              const open = findOpenOrder(orders, d.building, d.componentNo);
              const hasClosed =
                !open && orders.some((o) => o.building === d.building && o.componentNo === d.componentNo && o.status === "已关闭");
              return (
                <tr key={`${d.building}-${d.componentNo}`}>
                  <td>{d.building}</td>
                  <td>{d.componentNo}</td>
                  <td>{d.wood}</td>
                  <td>{d.section}</td>
                  <td>{d.length}</td>
                  <td>{d.deformation}</td>
                  <td>
                    {open ? (
                      <span className={STATUS_CLASS[open.status]}>{open.status}</span>
                    ) : hasClosed ? (
                      <span className="tag st-closed">已关闭</span>
                    ) : (
                      <span className="hint">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>病害标记图</p>
            <h2>未关闭隐患分布</h2>
          </div>
          <span className="hint">待复核以虚线圈标示</span>
        </div>
        {visibleOpen.length > 0 ? (
          <svg viewBox="0 0 640 320" className="hazard-map" role="img" aria-label="病害标记图">
            <rect x="20" y="272" width="600" height="14" rx="3" className="map-base" />
            {[90, 309, 528].map((x) => (
              <rect key={x} x={x} y="112" width="22" height="160" className="map-wood" />
            ))}
            <rect x="60" y="82" width="520" height="26" rx="4" className="map-wood" />
            {visibleOpen.map((o) => {
              const x = 70 + (hashOf(o.componentNo) % 500);
              const y = 70 + (hashOf(o.componentNo + o.location) % 190);
              return (
                <g key={o.id}>
                  {o.status === "待复核" && <circle cx={x} cy={y} r="14" className="map-review-ring" />}
                  <circle cx={x} cy={y} r="7" fill={TYPE_COLORS[o.type]} stroke="#fff" strokeWidth="2" />
                  <text x={x} y={y - 20} textAnchor="middle" className="map-label">
                    {o.componentNo}
                  </text>
                  {o.status === "待复核" && (
                    <text x={x} y={y + 28} textAnchor="middle" className="map-review-text">
                      待复核
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="hint">当前筛选下没有未关闭隐患。</p>
        )}
        <div className="legend">
          {HAZARD_TYPES.map((t) => (
            <span key={t}>
              <i style={{ background: TYPE_COLORS[t] }} />
              {t}
            </span>
          ))}
          <span>
            <i className="legend-ring" />
            待复核
          </span>
        </div>
      </section>
    </main>
  );
}

export default App;
