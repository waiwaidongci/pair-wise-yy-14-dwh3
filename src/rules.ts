// 业务规则：雨后木结构隐患处置单的开立、追加、复核、关闭与导出
// 本文件只放规则，不依赖 React 与浏览器存储，全部为纯函数，便于核对与测试。

export type Severity = "一般" | "严重";
export type TicketStatus = "待复核" | "待处置" | "已关闭";
export type MarkerPosition = "左端" | "节点" | "中段" | "右端";

export const HAZARD_TYPES = ["渗水", "裂缝", "松动", "糟朽", "变形"] as const;
export const SEVERITIES: Severity[] = ["一般", "严重"];
export const MARKER_POSITIONS: MarkerPosition[] = ["左端", "节点", "中段", "右端"];

export const STATUS_REVIEW: TicketStatus = "待复核";
export const STATUS_DISPOSAL: TicketStatus = "待处置";
export const STATUS_CLOSED: TicketStatus = "已关闭";

/** 一次巡查检查记录。新开单与追加检查都使用同一结构。 */
export interface InspectionInput {
  time: string; // 发现/检查时刻（datetime-local）
  inspector: string; // 发现人/检查人
  part: string; // 部位
  hazardType: string; // 类型：渗水/裂缝/松动……
  severity: Severity; // 等级
  content: string; // 检查内容（渗水、裂缝、松动等具体情况）
  conclusion: string; // 本次检查结论，可留空待补
  dimension?: { name: string; value: string }; // 本次随附的一条尺寸记录
  marker?: { position: MarkerPosition; label: string }; // 本次在病害图上的标记
}

export interface Inspection extends InspectionInput {
  id: string;
  seq: number; // 该构件第几次检查
}

export interface DimensionRow {
  id: string;
  inspectionId: string;
  name: string;
  value: string;
}

export interface DiseaseMarker {
  id: string;
  inspectionId: string;
  position: MarkerPosition;
  label: string;
}

export interface ReviewRecord {
  reviewer: string; // 复核人（必须不是发现人本人）
  time: string;
  passed: boolean;
  comment: string;
}

export interface DisposalRecord {
  handler: string; // 处置人
  time: string;
  opinion: string; // 处置意见
}

export interface HazardTicket {
  id: string; // 处置单号 HD-YYYYMMDD-NN
  building: string; // 建筑
  componentNo: string; // 构件编号
  status: TicketStatus;
  createdAt: string;
  discoverer: string;
  inspections: Inspection[]; // 每次检查的时间与结论都保留在此
  dimensions: DimensionRow[]; // 尺寸表
  markers: DiseaseMarker[]; // 病害图标记
  reviews: ReviewRecord[]; // 复核历史
  disposal?: DisposalRecord; // 关闭时填写的处置意见
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function fmtTime(time: string): string {
  return time ? time.replace("T", " ") : "";
}

export function isOpen(ticket: HazardTicket): boolean {
  return ticket.status !== STATUS_CLOSED;
}

export function latestInspection(ticket: HazardTicket): Inspection {
  return ticket.inspections[ticket.inspections.length - 1];
}

/** 等级就高不就低：追加检查发现严重隐患时，处置单整体按严重显示。 */
export function highestSeverity(ticket: HazardTicket): Severity {
  return ticket.inspections.some((i) => i.severity === "严重") ? "严重" : "一般";
}

/**
 * 规则一：同一构件（同建筑 + 同构件编号）只要还有未关闭处置单，
 * 雨后复查不另开新单，只把检查内容追加到原单上。
 */
export function findOpenTicket(
  tickets: HazardTicket[],
  building: string,
  componentNo: string
): HazardTicket | undefined {
  const b = building.trim();
  const c = componentNo.trim();
  return tickets.find(
    (t) => t.building === b && t.componentNo === c && isOpen(t)
  );
}

function nextTicketId(tickets: HazardTicket[], time: string): string {
  const ymd = time.slice(0, 10).replace(/-/g, "");
  const count = tickets.filter((t) => t.id.startsWith(`HD-${ymd}-`)).length;
  return `HD-${ymd}-${String(count + 1).padStart(2, "0")}`;
}

function createTicket(
  id: string,
  building: string,
  componentNo: string,
  input: InspectionInput
): HazardTicket {
  const inspection: Inspection = { ...input, id: uid(), seq: 1 };
  const ticket: HazardTicket = {
    id,
    building: building.trim(),
    componentNo: componentNo.trim(),
    // 规则二：严重隐患必须他人复核，复核前停在“待复核”；一般隐患直接待处置。
    status: input.severity === "严重" ? STATUS_REVIEW : STATUS_DISPOSAL,
    createdAt: input.time,
    discoverer: input.inspector.trim(),
    inspections: [inspection],
    dimensions: [],
    markers: [],
    reviews: [],
  };
  attachExtras(ticket, inspection, input);
  return ticket;
}

function attachExtras(ticket: HazardTicket, inspection: Inspection, input: InspectionInput) {
  if (input.dimension && input.dimension.name.trim() && input.dimension.value.trim()) {
    ticket.dimensions.push({
      id: uid(),
      inspectionId: inspection.id,
      name: input.dimension.name.trim(),
      value: input.dimension.value.trim(),
    });
  }
  if (input.marker && input.marker.position) {
    ticket.markers.push({
      id: uid(),
      inspectionId: inspection.id,
      position: input.marker.position,
      label: input.marker.label.trim() || input.part,
    });
  }
}

function appendFinding(ticket: HazardTicket, input: InspectionInput): HazardTicket {
  const next: HazardTicket = {
    ...ticket,
    inspections: ticket.inspections.map((i) => ({ ...i })),
    dimensions: ticket.dimensions.map((d) => ({ ...d })),
    markers: ticket.markers.map((m) => ({ ...m })),
    reviews: ticket.reviews.map((r) => ({ ...r })),
  };
  const inspection: Inspection = {
    ...input,
    id: uid(),
    seq: next.inspections.length + 1,
  };
  next.inspections.push(inspection);
  attachExtras(next, inspection, input);
  // 追加检查若新发现严重隐患，原单重新回到待复核。
  if (input.severity === "严重") next.status = STATUS_REVIEW;
  return next;
}

/** 登记入口：有未关闭原单则追加检查，否则开立新处置单。 */
export function registerFinding(
  tickets: HazardTicket[],
  base: { building: string; componentNo: string },
  input: InspectionInput
): { tickets: HazardTicket[]; ticketId: string; appended: boolean } {
  if (!base.building.trim() || !base.componentNo.trim()) {
    throw new Error("建筑与构件编号必须填写");
  }
  if (!input.inspector.trim() || !input.time || !input.part.trim() || !input.content.trim()) {
    throw new Error("部位、类型、等级、发现人、时刻和检查内容必须填写完整");
  }
  const open = findOpenTicket(tickets, base.building, base.componentNo);
  if (open) {
    return {
      tickets: tickets.map((t) => (t.id === open.id ? appendFinding(t, input) : t)),
      ticketId: open.id,
      appended: true,
    };
  }
  const id = nextTicketId(tickets, input.time);
  const ticket = createTicket(id, base.building, base.componentNo, input);
  return { tickets: [...tickets, ticket], ticketId: id, appended: false };
}

/**
 * 规则三：严重隐患须由别人复核。
 * - 复核通过：待复核 → 待处置，之后才能填写处置意见关闭；
 * - 复核退回：仍停在待复核，需补充检查后再次复核，复核意见全程留痕。
 * 无论通过与否，复核人都不能与本次检查的发现人为同一人。
 */
export function reviewTicket(
  ticket: HazardTicket,
  params: { reviewer: string; comment: string; passed: boolean; time: string }
): HazardTicket {
  if (ticket.status !== STATUS_REVIEW) {
    throw new Error("只有待复核的处置单才能复核");
  }
  const reviewer = params.reviewer.trim();
  if (!reviewer) throw new Error("请填写复核人");
  const latest = latestInspection(ticket);
  if (reviewer === latest.inspector.trim()) {
    throw new Error("严重隐患须由别人复核，复核人不能与发现人为同一人");
  }
  return {
    ...ticket,
    status: params.passed ? STATUS_DISPOSAL : STATUS_REVIEW,
    reviews: [
      ...ticket.reviews,
      { reviewer, time: params.time, passed: params.passed, comment: params.comment.trim() },
    ],
  };
}

/** 规则四：复核通过后填写处置意见方可关闭；每次检查的时间和结论原样保留。 */
export function closeTicket(
  ticket: HazardTicket,
  params: { handler: string; opinion: string; time: string }
): HazardTicket {
  if (ticket.status === STATUS_CLOSED) throw new Error("处置单已关闭");
  if (ticket.status === STATUS_REVIEW) {
    throw new Error("严重隐患尚未复核通过，不能填写处置意见关闭");
  }
  const handler = params.handler.trim();
  const opinion = params.opinion.trim();
  if (!handler || !opinion) throw new Error("请填写处置人和处置意见");
  return {
    ...ticket,
    status: STATUS_CLOSED,
    disposal: { handler, opinion, time: params.time },
  };
}

/** 规则五：存在未关闭记录时，一律不能导出施工清单。 */
export function canExportConstructionList(tickets: HazardTicket[]): boolean {
  return tickets.length > 0 && tickets.every((t) => t.status === STATUS_CLOSED);
}

export function openBlocker(tickets: HazardTicket[]): HazardTicket | undefined {
  return tickets.find((t) => t.status !== STATUS_CLOSED);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** 生成施工清单 CSV；只允许已关闭记录导出。 */
export function constructionListCsv(tickets: HazardTicket[]): string {
  if (tickets.length === 0) throw new Error("台账中暂无处置单");
  const blocker = openBlocker(tickets);
  if (blocker) {
    throw new Error(`处置单 ${blocker.id}（${blocker.building} ${blocker.componentNo}）尚未关闭，未关闭记录不能导出施工清单`);
  }
  const header = [
    "处置单号",
    "建筑",
    "构件编号",
    "部位",
    "类型",
    "等级",
    "发现人",
    "发现时刻",
    "检查次数",
    "最近检查时刻",
    "最近检查结论",
    "处置人",
    "处置时间",
    "处置意见",
  ];
  const rows = tickets.map((t) => {
    const first = t.inspections[0];
    const last = latestInspection(t);
    return [
      t.id,
      t.building,
      t.componentNo,
      first.part,
      last.hazardType,
      highestSeverity(t),
      t.discoverer,
      fmtTime(first.time),
      String(t.inspections.length),
      fmtTime(last.time),
      last.conclusion || "（无）",
      t.disposal?.handler ?? "",
      fmtTime(t.disposal?.time ?? ""),
      t.disposal?.opinion ?? "",
    ].map(csvCell).join(",");
  });
  return "﻿" + [header.map(csvCell).join(","), ...rows].join("\r\n");
}
