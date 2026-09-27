// 存储：隐患处置台账的持久化与示例数据
// 台账全部存 localStorage；示例数据展示 待复核 / 待处置（含复查追加）/ 已关闭 三种形态。

import {
  HAZARD_TYPES,
  HazardTicket,
  Inspection,
  MARKER_POSITIONS,
  STATUS_CLOSED,
  STATUS_DISPOSAL,
  STATUS_REVIEW,
  uid,
} from "./rules";

const STORAGE_KEY = "hazard-desk-ledger-v1";

export function nowLocal(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function makeInspection(partial: Omit<Inspection, "id" | "seq">, seq: number): Inspection {
  return { ...partial, id: uid(), seq };
}

/** 雨后巡查示例台账。 */
export function seedTickets(): HazardTicket[] {
  const a1 = makeInspection(
    {
      time: "2026-09-26T09:12",
      inspector: "王福顺",
      part: "东次间五架梁端部",
      hazardType: HAZARD_TYPES[0], // 渗水
      severity: "严重",
      content: "雨后梁端节点处可见明显水渍，木纤维潮湿，下方滴水约半盏，疑瓦面渗水顺梁而下。",
      conclusion: "严重渗水，需他人复核后安排苫背修补。",
    },
    1
  );
  const ticketA: HazardTicket = {
    id: "HD-20260926-01",
    building: "大成殿",
    componentNo: "梁架A-03",
    status: STATUS_REVIEW,
    createdAt: a1.time,
    discoverer: "王福顺",
    inspections: [a1],
    dimensions: [
      { id: uid(), inspectionId: a1.id, name: "渗水范围长", value: "420mm" },
      { id: uid(), inspectionId: a1.id, name: "梁截面", value: "180×240mm" },
    ],
    markers: [
      { id: uid(), inspectionId: a1.id, position: MARKER_POSITIONS[1], label: "节点渗水" },
    ],
    reviews: [],
  };

  const b1 = makeInspection(
    {
      time: "2026-09-26T10:05",
      inspector: "李长贵",
      part: "后檐柱柱脚",
      hazardType: HAZARD_TYPES[1], // 裂缝
      severity: "一般",
      content: "柱脚外侧顺纹裂缝一条，表面干裂纹，长约90mm，深未及柱心。",
      conclusion: "一般裂缝，观察变化，做好排水。",
    },
    1
  );
  const b2 = makeInspection(
    {
      time: "2026-09-27T08:40",
      inspector: "李长贵",
      part: "后檐柱柱脚",
      hazardType: HAZARD_TYPES[2], // 松动
      severity: "一般",
      content: "复查裂缝未扩展；柱脚石缝见细土被雨水带出，手摇柱身有轻微旷动，判定柱脚松动。",
      conclusion: "裂缝稳定，新增松动迹象，需归安前先剔补糟朽层。",
      dimension: { name: "松动旷量", value: "约3mm" },
      marker: { position: MARKER_POSITIONS[0], label: "柱脚松动" },
    },
    2
  );
  const ticketB: HazardTicket = {
    id: "HD-20260926-02",
    building: "大成殿",
    componentNo: "柱网C-12",
    status: STATUS_DISPOSAL,
    createdAt: b1.time,
    discoverer: "李长贵",
    inspections: [b1, b2],
    dimensions: [
      { id: uid(), inspectionId: b1.id, name: "裂缝长", value: "90mm" },
      { id: uid(), inspectionId: b2.id, name: "松动旷量", value: "约3mm" },
    ],
    markers: [{ id: uid(), inspectionId: b2.id, position: MARKER_POSITIONS[0], label: "柱脚松动" }],
    reviews: [],
  };

  const c1 = makeInspection(
    {
      time: "2026-09-25T15:20",
      inspector: "赵明德",
      part: "平身科坐斗",
      hazardType: HAZARD_TYPES[4], // 变形
      severity: "一般",
      content: "坐斗微倾，斗欹局部受压变形，未开裂，卯口尚能受力。",
      conclusion: "轻微变形，继续监测，暂不干预。",
    },
    1
  );
  const ticketC: HazardTicket = {
    id: "HD-20260925-01",
    building: "戟门",
    componentNo: "斗拱D-07",
    status: STATUS_CLOSED,
    createdAt: c1.time,
    discoverer: "赵明德",
    inspections: [c1],
    dimensions: [{ id: uid(), inspectionId: c1.id, name: "斗口", value: "80mm" }],
    markers: [],
    reviews: [],
    disposal: {
      handler: "孙木匠",
      time: "2026-09-26T16:30",
      opinion: "斗口加设木楔临时加固，列入下一轮修缮统一更换；本轮监测结论归档。",
    },
  };

  return [ticketA, ticketB, ticketC];
}

export function loadTickets(): HazardTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedTickets();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as HazardTicket[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return seedTickets();
  }
}

export function saveTickets(tickets: HazardTicket[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
}

export function resetTickets(): HazardTicket[] {
  const seed = seedTickets();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
  return seed;
}
