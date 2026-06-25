// api/upload.js
// POST /api/upload multipart/form-data field: "file"
// Excel → JSON → Redis 저장

import fs from "fs";
import Redis from "ioredis";
import multiparty from "multiparty";
import XLSX from "xlsx";

let redis = null;

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
    // 1. 파일 파싱
    const { filePath, originalName } = await parseMultipart(req);

    // 2. 🔥 핵심 수정: readFile → buffer 방식
    const fileBuffer = fs.readFileSync(filePath);
    const wb = XLSX.read(fileBuffer, { type: "buffer" });

    const ws =
      wb.Sheets["와인목록"] || wb.Sheets[wb.SheetNames[0]];

    const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

    // 3. 데이터 변환
    const wines = rows
      .filter((r) => r.id && !isNaN(Number(r.id)))
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name || "").trim(),
        type: String(r.type || "").trim().toLowerCase(),
        country: String(r.country || "").trim(),
        varietal: String(r.varietal || "").trim(),
        price: Number(String(r.price).replace(/[^0-9]/g, "")) || 0,
        vintage: r.vintage ? Number(r.vintage) : null,
        region: String(r.region || "").trim(),
        tasting_note: String(r.tasting_note || "").trim(),
        food_tags: String(r.food_tags || "").trim(),
        style: String(r.style || "").trim(),
        in_stock: String(r.in_stock).toLowerCase() === "true",
        image_url: String(r.image_url || "").trim(),
        product_url: String(r.product_url || "").trim(),
      }));

    if (wines.length === 0) {
      return res.status(400).json({
        ok: false,
        error: '파싱된 와인이 없습니다. 시트 이름이 "와인목록"인지 확인해주세요.',
      });
    }

    // 4. Redis 저장
    const client = getRedis();

    if (!client) {
      return res.status(200).json({
        ok: true,
        message: "Redis 미연결 — 파싱 결과 미리보기",
        count: wines.length,
        preview: wines.slice(0, 3),
      });
    }

    const payload = JSON.stringify({
      updated_at: new Date().toISOString(),
      wines,
    });

    await client.set("wine_list", payload);

    // 5. 임시 파일 삭제
    fs.unlinkSync(filePath);

    return res.status(200).json({
      ok: true,
      message: `✅ ${wines.length}개 와인이 업데이트됐습니다.`,
      count: wines.length,
      file: originalName,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("[upload] error:", err);

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