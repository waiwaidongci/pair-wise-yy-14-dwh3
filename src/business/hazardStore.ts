/**
 * 隐患处置台账 · 本地存储
 * 处置单与构件尺寸表分别持久化到 localStorage，首次进入写入演示数据。
 */
import type { HazardOrder } from "./hazardRules";

const ORDER_KEY = "hxyfront-62013:hazard-orders:v1";
const DIM_KEY = "hxyfront-62013:component-dims:v1";

/** 构件尺寸记录（测绘成果，供尺寸表展示） */
export interface ComponentDim {
  building: string;
  componentNo: string;
  wood: string;
  section: string;
  length: string;
  deformation: string;
}

function seedOrders(): HazardOrder[] {
  return [
    {
      id: "YH-0004",
      building: "万佛楼",
      componentNo: "梁架A-07",
      location: "跨中",
      type: "裂缝",
      grade: "一般",
      discoverer: "张立",
      foundAt: "2026-09-27T07:20",
      status: "待处置",
      inspections: [
        {
          id: "YH-0004-JC1",
          time: "2026-09-27T07:20",
          inspector: "张立",
          content: "雨后复查，跨中底面新见发丝裂缝，长约40cm",
          conclusion: "暂不影响结构，列入处置",
        },
      ],
      reviews: [],
      disposalOpinion: "",
      closedBy: "",
      closedAt: "",
    },
    {
      id: "YH-0003",
      building: "鼓楼",
      componentNo: "斗拱D-07",
      location: "拱眼壁",
      type: "松动",
      grade: "严重",
      discoverer: "陈舟",
      foundAt: "2026-09-26T17:05",
      status: "待处置",
      inspections: [
        {
          id: "YH-0003-JC1",
          time: "2026-09-26T17:05",
          inspector: "陈舟",
          content: "拱眼壁与斗拱交接处松动，手扳有旷量",
          conclusion: "疑似严重隐患，提请复核",
        },
        {
          id: "YH-0003-JC2",
          time: "2026-09-27T06:50",
          inspector: "陈舟",
          content: "雨后复测，旷量约3mm，无继续发展",
          conclusion: "维持原判，待处置",
        },
      ],
      reviews: [
        { reviewer: "赵工", time: "2026-09-26T19:30", result: "通过", note: "现场核对属实，按严重隐患处置" },
      ],
      disposalOpinion: "",
      closedBy: "",
      closedAt: "",
    },
    {
      id: "YH-0002",
      building: "藏经阁",
      componentNo: "柱网C-12",
      location: "柱脚",
      type: "渗水",
      grade: "严重",
      discoverer: "李秀",
      foundAt: "2026-09-27T06:55",
      status: "待复核",
      inspections: [
        {
          id: "YH-0002-JC1",
          time: "2026-09-27T06:55",
          inspector: "李秀",
          content: "雨后柱脚渗水，水印高约30cm，木柱手捻有潮气",
          conclusion: "需尽快复核并安排排水",
        },
      ],
      reviews: [],
      disposalOpinion: "",
      closedBy: "",
      closedAt: "",
    },
    {
      id: "YH-0001",
      building: "万佛楼",
      componentNo: "梁架A-03",
      location: "梁端榫口",
      type: "裂缝",
      grade: "较大",
      discoverer: "张立",
      foundAt: "2026-09-26T08:10",
      status: "已关闭",
      inspections: [
        {
          id: "YH-0001-JC1",
          time: "2026-09-26T08:10",
          inspector: "张立",
          content: "梁端榫口顺纹裂缝，长约25cm、深约2cm",
          conclusion: "需嵌补加固",
        },
        {
          id: "YH-0001-JC2",
          time: "2026-09-26T15:00",
          inspector: "张立",
          content: "裂缝无扩展，周边无糟朽",
          conclusion: "可按方案处置",
        },
      ],
      reviews: [],
      disposalOpinion: "剔除裂缝内杂物，环氧灌浆后嵌补干燥木条并箍紧",
      closedBy: "王工",
      closedAt: "2026-09-26T16:40",
    },
  ];
}

function seedDimensions(): ComponentDim[] {
  return [
    { building: "万佛楼", componentNo: "梁架A-03", wood: "杉木", section: "180×240mm", length: "3.2m", deformation: "梁端开裂约2cm" },
    { building: "万佛楼", componentNo: "梁架A-07", wood: "杉木", section: "160×220mm", length: "2.8m", deformation: "跨中发丝裂缝" },
    { building: "藏经阁", componentNo: "柱网C-12", wood: "楠木", section: "⌀260mm", length: "4.1m", deformation: "柱脚受潮糟朽" },
    { building: "鼓楼", componentNo: "斗拱D-07", wood: "松木", section: "120×160mm", length: "0.9m", deformation: "轻微变形" },
  ];
}

function read<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // 存储不可用时退回演示数据
  }
  const data = seed();
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // 忽略写入失败
  }
  return data;
}

export function loadOrders(): HazardOrder[] {
  return read(ORDER_KEY, seedOrders);
}

export function saveOrders(orders: HazardOrder[]): void {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(orders));
  } catch {
    // 忽略写入失败
  }
}

export function loadDimensions(): ComponentDim[] {
  return read(DIM_KEY, seedDimensions);
}
