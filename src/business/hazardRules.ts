/**
 * 隐患处置台账 · 业务规则
 * 雨后巡查隐患的登记、并单、复核、关闭与施工清单导出规则。
 */

export const HAZARD_TYPES = ["渗水", "裂缝", "松动"] as const;
export type HazardType = (typeof HAZARD_TYPES)[number];

export const HAZARD_GRADES = ["一般", "较大", "严重"] as const;
export type HazardGrade = (typeof HAZARD_GRADES)[number];

export type OrderStatus = "待复核" | "待处置" | "已关闭";

/** 一次检查：保留每次检查的时间和结论 */
export interface Inspection {
  id: string;
  time: string;
  inspector: string;
  content: string;
  conclusion: string;
}

/** 一次复核：严重隐患须由发现人以外的人复核 */
export interface ReviewRecord {
  reviewer: string;
  time: string;
  result: "通过" | "退回";
  note: string;
}

/** 隐患处置单：同一构件同一时段只保留一张未关闭单 */
export interface HazardOrder {
  id: string;
  building: string;
  componentNo: string;
  location: string;
  type: HazardType;
  grade: HazardGrade;
  discoverer: string;
  foundAt: string;
  status: OrderStatus;
  inspections: Inspection[];
  reviews: ReviewRecord[];
  disposalOpinion: string;
  closedBy: string;
  closedAt: string;
}

export interface RegisterInput {
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

export interface RegisterResult {
  orders: HazardOrder[];
  order: HazardOrder;
  /** true 表示同一构件已有未关闭隐患，仅追加检查内容并沿用原单 */
  merged: boolean;
}

export class RuleError extends Error {}

export const isOpenOrder = (order: HazardOrder): boolean => order.status !== "已关闭";

/** 同一建筑同一构件的未关闭处置单 */
export function findOpenOrder(
  orders: HazardOrder[],
  building: string,
  componentNo: string
): HazardOrder | undefined {
  const b = building.trim();
  const c = componentNo.trim();
  if (!b || !c) return undefined;
  return orders.find((o) => isOpenOrder(o) && o.building === b && o.componentNo === c);
}

function nextOrderId(orders: HazardOrder[]): string {
  const seq = orders.reduce((max, o) => {
    const m = /^YH-(\d+)$/.exec(o.id);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0);
  return `YH-${String(seq + 1).padStart(4, "0")}`;
}

function validateRegister(input: RegisterInput): void {
  if (!input.building.trim()) throw new RuleError("请填写建筑");
  if (!input.componentNo.trim()) throw new RuleError("请填写构件编号");
  if (!input.location.trim()) throw new RuleError("请填写部位");
  if (!input.discoverer.trim()) throw new RuleError("请填写发现人");
  if (!input.foundAt) throw new RuleError("请选择发现时刻");
  if (!input.content.trim()) throw new RuleError("请填写检查内容");
  if (!input.conclusion.trim()) throw new RuleError("请填写检查结论");
}

function toInspection(orderId: string, seq: number, input: RegisterInput): Inspection {
  return {
    id: `${orderId}-JC${seq}`,
    time: input.foundAt,
    inspector: input.discoverer.trim(),
    content: input.content.trim(),
    conclusion: input.conclusion.trim(),
  };
}

/**
 * 登记隐患。
 * 同一构件还有未关闭隐患时，新记录只追加检查内容并沿用原单；
 * 严重等级的新单进入待复核，其余直接进入待处置。
 */
export function registerHazard(orders: HazardOrder[], input: RegisterInput): RegisterResult {
  validateRegister(input);
  const existing = findOpenOrder(orders, input.building, input.componentNo);
  if (existing) {
    const order: HazardOrder = {
      ...existing,
      inspections: [...existing.inspections, toInspection(existing.id, existing.inspections.length + 1, input)],
    };
    return { orders: orders.map((o) => (o.id === order.id ? order : o)), order, merged: true };
  }
  const id = nextOrderId(orders);
  const order: HazardOrder = {
    id,
    building: input.building.trim(),
    componentNo: input.componentNo.trim(),
    location: input.location.trim(),
    type: input.type,
    grade: input.grade,
    discoverer: input.discoverer.trim(),
    foundAt: input.foundAt,
    status: input.grade === "严重" ? "待复核" : "待处置",
    inspections: [toInspection(id, 1, input)],
    reviews: [],
    disposalOpinion: "",
    closedBy: "",
    closedAt: "",
  };
  return { orders: [order, ...orders], order, merged: false };
}

/** 严重隐患复核：复核人须为发现人以外的人，通过后转入待处置，退回则继续待复核 */
export function reviewHazard(
  orders: HazardOrder[],
  orderId: string,
  reviewer: string,
  result: "通过" | "退回",
  note: string,
  time: string
): HazardOrder[] {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new RuleError("处置单不存在");
  if (order.grade !== "严重") throw new RuleError("仅严重隐患需要复核");
  if (order.status !== "待复核") throw new RuleError("该单当前不在待复核状态");
  if (!reviewer.trim()) throw new RuleError("请填写复核人");
  if (reviewer.trim() === order.discoverer) {
    throw new RuleError("严重隐患须由发现人以外的人复核");
  }
  const record: ReviewRecord = { reviewer: reviewer.trim(), time, result, note: note.trim() };
  const next: HazardOrder = {
    ...order,
    status: result === "通过" ? "待处置" : "待复核",
    reviews: [...order.reviews, record],
  };
  return orders.map((o) => (o.id === orderId ? next : o));
}

/** 填写处置意见并关闭；待复核的严重隐患不能关闭 */
export function closeHazard(
  orders: HazardOrder[],
  orderId: string,
  opinion: string,
  closedBy: string,
  time: string
): HazardOrder[] {
  const order = orders.find((o) => o.id === orderId);
  if (!order) throw new RuleError("处置单不存在");
  if (order.status === "已关闭") throw new RuleError("该单已关闭");
  if (order.status === "待复核") throw new RuleError("严重隐患复核通过前不能关闭");
  if (!opinion.trim()) throw new RuleError("请填写处置意见");
  if (!closedBy.trim()) throw new RuleError("请填写处置人");
  const next: HazardOrder = {
    ...order,
    status: "已关闭",
    disposalOpinion: opinion.trim(),
    closedBy: closedBy.trim(),
    closedAt: time,
  };
  return orders.map((o) => (o.id === orderId ? next : o));
}

/** 未关闭记录不能导出施工清单 */
export function exportableOrders(orders: HazardOrder[]): HazardOrder[] {
  return orders.filter((o) => o.status === "已关闭");
}

/** 施工清单 CSV（仅已关闭记录） */
export function buildConstructionCsv(orders: HazardOrder[]): string {
  const header = ["单号", "建筑", "构件编号", "部位", "类型", "等级", "发现人", "发现时刻", "处置意见", "处置人", "关闭时刻"];
  const rows = exportableOrders(orders).map((o) => [
    o.id,
    o.building,
    o.componentNo,
    o.location,
    o.type,
    o.grade,
    o.discoverer,
    o.foundAt.replace("T", " "),
    o.disposalOpinion,
    o.closedBy,
    o.closedAt.replace("T", " "),
  ]);
  return [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\r\n");
}
