// api/upload.js

import fs from "fs";
import Redis from "ioredis";
import multiparty from "multiparty";
import XLSX from "xlsx";

let redis = null;

const clean = (v) =>
  String(v || "")
    .replace(/<[^>]*>/g, "")
    .trim();
function getRedis() {
  if (!redis && process.env.REDIS_URL) {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      connectTimeout: 5000,
    });
  }
  return redis;
}

export const config = {
  api: {
    bodyParser: false,
  },
};

// CORS
function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-admin-key");
  res.setHeader("Access-Control-Max-Age", "86400");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // 1. 파일 업로드 파싱
    const { filePath, originalName } = await parseMultipart(req);

    // 2. Excel 읽기 (serverless safe)
    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });

    const ws =
      wb.Sheets["와인목록"] || wb.Sheets[wb.SheetNames[0]];

    // 3. 🔥 핵심: 1행 제목 무시
    const rows = XLSX.utils.sheet_to_json(ws, {
      defval: "",
      range: 1, // 👉 첫 줄(제목) 스킵
    });

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "엑셀 데이터가 비어있습니다. 시트를 확인해주세요.",
      });
    }

    // 4. 데이터 변환 (안전 처리)
    const wines = rows
      .map((r, index) => ({
        id: Number(r.id || r.ID || r.Id || index + 1),
        name: String(r.name || r.Name || "").trim(),
        type: String(r.type || r.Type || "").trim().toLowerCase(),
        country: String(r.country || r.Country || "").trim(),
        varietal: String(r.varietal || "").trim(),
        price: Number(String(r.price || "").replace(/[^0-9]/g, "")) || 0,
        vintage: r.vintage ? Number(r.vintage) : null,
        region: String(r.region || "").trim(),
        tasting_note: String(r.tasting_note || "").trim(),
        food_tags: String(r.food_tags || "").trim(),
        style: String(r.style || "").trim(),
        in_stock: String(r.in_stock || "").toLowerCase() === "true",
        image_url: String(r.image_url || "").trim(),
        product_url: clean(r.product_url),
      }))
      .filter(w => w.name); // 이름 없는 데이터 제거

    // 5. Redis 저장
    const client = getRedis();

    if (!client) {
      return res.status(200).json({
        ok: true,
        message: "Redis 미연결 — 미리보기 모드",
        count: wines.length,
        preview: wines.slice(0, 3),
      });
    }

    await client.set(
      "wine_list",
      JSON.stringify({
        updated_at: new Date().toISOString(),
        wines,
      })
    );

    // 6. 임시 파일 삭제
    fs.unlinkSync(filePath);

    return res.status(200).json({
      ok: true,
      message: `✅ ${wines.length}개 와인 업데이트 완료`,
      count: wines.length,
      file: originalName,
      updated_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error("[upload error]", err);

    return res.status(500).json({
      ok: false,
      error: err.message,
    });
  }
}

// ─────────────────────────────
// multipart parser
// ─────────────────────────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({
      uploadDir: "/tmp",
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      const uploaded = files.file?.[0];

      if (!uploaded) {
        return reject(new Error("file 필드가 없습니다."));
      }

      resolve({
        filePath: uploaded.path,
        originalName: uploaded.originalFilename || "wine.xlsx",
      });
    });
  });
}