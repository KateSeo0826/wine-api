// api/upload.js
// POST /api/upload  multipart/form-data  field: "file" (.xlsx)
// 관리자 키 헤더: x-admin-key: <ADMIN_SECRET 환경변수>
// 엑셀을 파싱해 Redis Cloud (ioredis) 에 JSON으로 저장합니다.
//
// 환경변수 (Vercel 대시보드 → Settings → Environment Variables):
//   REDIS_URL = redis://default:PASSWORD@host:port

import * as XLSX from 'xlsx';
import fs from 'fs';
import Redis from 'ioredis';
import pkg from 'multiparty';

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
  api: { bodyParser: false },  // multipart 직접 처리
};

// CORS 헤더 공통 설정
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);

  // OPTIONS preflight 즉시 응답
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // ── 파일 파싱 ─────────────────────────────────────────────
    const { filePath, originalName } = await parseMultipart(req);

    // ── 엑셀 → JSON ───────────────────────────────────────────
    const wb = XLSX.readFile(filePath);
    const ws = wb.Sheets['와인목록'] ?? wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

    const wines = rows
      .filter(r => r.id && !isNaN(Number(r.id)))
      .map(r => ({
        id: Number(r.id),
        name: String(r.name || '').trim(),
        type: String(r.type || '').trim().toLowerCase(),
        country: String(r.country || '').trim(),
        varietal: String(r.varietal || '').trim(),
        price: Number(String(r.price).replace(/[^0-9]/g, '')) || 0,
        vintage: r.vintage ? Number(r.vintage) : null,
        region: String(r.region || '').trim(),
        tasting_note: String(r.tasting_note || '').trim(),
        food_tags: String(r.food_tags || '').trim(),
        style: String(r.style || '').trim(),
        in_stock: String(r.in_stock).toLowerCase() === 'true',
        image_url: String(r.image_url || '').trim(),
        product_url: Number(r.product_url)
      }));

    if (wines.length === 0) {
      return res.status(400).json({ ok: false, error: '파싱된 와인이 없습니다. 시트 이름이 "와인목록"인지 확인해주세요.' });
    }

    // ── Redis Cloud 저장 ──────────────────────────────────────
    const client = getRedis();

    if (!client) {
      // REDIS_URL 미설정 시 파싱 결과만 반환 (테스트용)
      return res.status(200).json({
        ok: true,
        message: 'Redis 미연결 — 파싱 결과 미리보기',
        count: wines.length,
        preview: wines.slice(0, 3),
      });
    }

    const payload = JSON.stringify({ updated_at: new Date().toISOString(), wines });
    await client.set('wine_list', payload);

    // 임시 파일 정리
    fs.unlinkSync(filePath);

    return res.status(200).json({
      ok: true,
      message: `✅ ${wines.length}개 와인이 업데이트됐습니다.`,
      count: wines.length,
      file: originalName,
      updated_at: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[upload] error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}

// ── multipart 파일 파싱 헬퍼 ─────────────────────────────────────
function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const form = new multiparty.Form({
      uploadDir: '/tmp'
    });

    form.parse(req, (err, fields, files) => {
      if (err) return reject(err);

      const uploaded = files.file?.[0];

      if (!uploaded) {
        return reject(new Error('file 필드가 없습니다.'));
      }

      resolve({
        filePath: uploaded.path,
        originalName: uploaded.originalFilename || 'wine.xlsx'
      });
    });
  });
}