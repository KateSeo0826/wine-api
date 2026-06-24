// api/wines.js
// GET  /api/wines          → 전체 와인 목록 반환
// GET  /api/wines?type=red → 타입 필터
// Redis Cloud (ioredis) 에 저장된 JSON을 반환합니다.
//
// 환경변수 (Vercel 대시보드 → Settings → Environment Variables):
//   REDIS_URL = redis://default:PASSWORD@host:port
//   ADMIN_SECRET = 본인이 정한 관리자 비밀번호

import Redis from 'ioredis';

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

// CORS 헤더 공통 설정
function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-key');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req, res) {
  setCors(res);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const client = getRedis();

    // Redis 없으면 바로 샘플 반환
    if (!client) {
      return res.status(200).json({
        ok: true, source: 'sample',
        count: SAMPLE_WINES.length,
        wines: filterWines(SAMPLE_WINES, req.query),
      });
    }

    let raw = null;
    try {
      raw = await client.get('wine_list');
    } catch (redisErr) {
      // Redis 연결 에러나도 샘플 반환
      console.warn('[wines] Redis error, using sample:', redisErr.message);
      return res.status(200).json({
        ok: true, source: 'sample',
        count: SAMPLE_WINES.length,
        wines: filterWines(SAMPLE_WINES, req.query),
      });
    }

    // Redis에 데이터 없으면 샘플 반환
    if (!raw) {
      return res.status(200).json({
        ok: true, source: 'sample',
        count: SAMPLE_WINES.length,
        wines: filterWines(SAMPLE_WINES, req.query),
      });
    }

    const data = JSON.parse(raw);
    return res.status(200).json({
      ok: true, source: 'redis',
      count: data.wines.length,
      updated_at: data.updated_at,
      wines: filterWines(data.wines, req.query),
    });

  } catch (err) {
    // 최후 방어 — 어떤 에러든 샘플 반환
    console.error('[wines] unexpected error:', err);
    return res.status(200).json({
      ok: true, source: 'sample',
      count: SAMPLE_WINES.length,
      wines: filterWines(SAMPLE_WINES, req.query),
    });
  }
}

// ── 필터 헬퍼 ──────────────────────────────────────────────────
function filterWines(wines, query = {}) {
  let list = [...wines];

  if (query.type) list = list.filter(w => w.type === query.type);
  if (query.in_stock) list = list.filter(w => String(w.in_stock).toLowerCase() === 'true');
  if (query.style) list = list.filter(w => (w.style || '').includes(query.style));
  if (query.max_price) list = list.filter(w => Number(w.price) <= Number(query.max_price));

  return list;
}



// ── 개발용 샘플 데이터 (16개 전체) ────────────────────────────────
const SAMPLE_WINES = [
  // 🔴 레드
  {
    id: 1, name: "Château Margaux 2018", type: "red",
    country: "🇫🇷 프랑스", varietal: "Cabernet Sauvignon Blend",
    price: 280000, vintage: 2018, region: "Bordeaux",
    tasting_note: "블랙커런트, 삼나무, 담배 향. 벨벳처럼 부드러운 탄닌과 긴 여운.",
    food_tags: "스테이크,양고기,치즈",
    style: "bold,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/baee6729bef05.png",
  },
  {
    id: 2, name: "Barolo Brunate 2019", type: "red",
    country: "🇮🇹 이탈리아", varietal: "Nebbiolo",
    price: 120000, vintage: 2019, region: "Piedmont",
    tasting_note: "체리, 장미, 타르 향. 강한 산미와 탄닌, 풍부한 구조감.",
    food_tags: "스테이크,파스타,트러플",
    style: "bold,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/46be6ae9057d6.png",
  },
  {
    id: 3, name: "Bourgogne Pinot Noir 2021", type: "red",
    country: "🇫🇷 프랑스", varietal: "Pinot Noir",
    price: 65000, vintage: 2021, region: "Burgundy",
    tasting_note: "라즈베리, 버섯, 흙 향. 가볍고 우아한 구조.",
    food_tags: "치킨,연어,버섯,한식",
    style: "light,medium", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/a9150e9173ecc.png",
  },
  {
    id: 4, name: "Chianti Classico 2020", type: "red",
    country: "🇮🇹 이탈리아", varietal: "Sangiovese",
    price: 48000, vintage: 2020, region: "Tuscany",
    tasting_note: "체리, 허브, 약간의 가죽 향. 산미 좋고 음식과 잘 어울림.",
    food_tags: "피자,파스타,치즈",
    style: "medium,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/61c9efd669ca6.png",
  },
  // 🥂 화이트
  {
    id: 5, name: "Puligny-Montrachet 2020", type: "white",
    country: "🇫🇷 프랑스", varietal: "Chardonnay",
    price: 145000, vintage: 2020, region: "Burgundy",
    tasting_note: "레몬, 버터, 헤이즐넛. 풍부한 미네랄과 크리미한 질감.",
    food_tags: "해산물,가리비,크림파스타",
    style: "medium,dry", in_stock: true, image_url: "",
  },
  {
    id: 6, name: "Sancerre Blanc 2022", type: "white",
    country: "🇫🇷 프랑스", varietal: "Sauvignon Blanc",
    price: 72000, vintage: 2022, region: "Loire Valley",
    tasting_note: "자몽, 허브, 풀 향. 날카로운 산미와 미네랄.",
    food_tags: "샐러드,염소치즈,해산물,초밥",
    style: "light,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/54497bc500d07.png",
  },
  {
    id: 7, name: "Grüner Veltliner Smaragd 2021", type: "white",
    country: "🇦🇹 오스트리아", varietal: "Grüner Veltliner",
    price: 58000, vintage: 2021, region: "Wachau",
    tasting_note: "흰 후추, 라임, 허브. 생기 있는 산미와 깨끗한 피니시.",
    food_tags: "샐러드,돼지고기,아시안푸드,한식",
    style: "light,medium", in_stock: false, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/a144b8d49e94b.png",
  },
  // 🌸 로제
  {
    id: 8, name: "Provence Rosé 2023", type: "rose",
    country: "🇫🇷 프랑스", varietal: "Grenache Blend",
    price: 42000, vintage: 2023, region: "Provence",
    tasting_note: "딸기, 멜론, 꽃 향. 드라이하고 산뜻한 마무리.",
    food_tags: "샐러드,해산물,치킨,피자",
    style: "light,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/d2668716837f1.png",
  },
  {
    id: 9, name: "Tavel Rosé 2022", type: "rose",
    country: "🇫🇷 프랑스", varietal: "Grenache/Cinsault",
    price: 55000, vintage: 2022, region: "Rhône Valley",
    tasting_note: "붉은 과일, 허브, 스파이스. 프로방스보다 풍부한 바디.",
    food_tags: "치킨,파스타,돼지고기",
    style: "medium", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/babb8654510bc.png",
  },
  // 🍾 스파클링
  {
    id: 10, name: "Champagne Blanc de Blancs NV", type: "spark",
    country: "🇫🇷 프랑스", varietal: "Chardonnay 100%",
    price: 95000, vintage: null, region: "Champagne",
    tasting_note: "그린 애플, 레몬, 토스트. 섬세한 버블과 크리미한 질감.",
    food_tags: "해산물,굴,초밥,치즈,디저트",
    style: "light,medium", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/d2668716837f1.png",
  },
  {
    id: 11, name: "Prosecco DOC Extra Dry", type: "spark",
    country: "🇮🇹 이탈리아", varietal: "Glera",
    price: 38000, vintage: null, region: "Veneto",
    tasting_note: "배, 복숭아, 꽃 향. 가볍고 상큼한 기포.",
    food_tags: "해산물,샐러드,치즈,디저트",
    style: "light,sweet", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/f3b4217752559.png",
  },
  {
    id: 12, name: "Cava Brut Reserva", type: "spark",
    country: "🇪🇸 스페인", varietal: "Macabeu Blend",
    price: 32000, vintage: null, region: "Catalonia",
    tasting_note: "사과, 견과류, 약간의 이스트. 경제적인 선택.",
    food_tags: "치킨,해산물,피자",
    style: "light,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/206e18015e613.png",
  },
  // 🧡 오렌지
  {
    id: 13, name: "Radikon Ribolla Gialla 2018", type: "orange",
    country: "🇮🇹 이탈리아", varietal: "Ribolla Gialla",
    price: 88000, vintage: 2018, region: "Friuli",
    tasting_note: "살구, 꿀, 산화 향. 풀바디의 오렌지 와인, 복합미 극대화.",
    food_tags: "치즈,한식,아시안푸드,초밥",
    style: "bold,dry", in_stock: false, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/fdc4e58f0e858.png",
  },
  {
    id: 14, name: "Pheasant's Tears Rkatsiteli", type: "orange",
    country: "🇬🇪 조지아", varietal: "Rkatsiteli",
    price: 62000, vintage: null, region: "Kakheti",
    tasting_note: "호두, 마르멜로, 꽃차. 탄닌감 있는 화이트 같은 구조.",
    food_tags: "치즈,한식,아시안푸드",
    style: "medium,dry", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/9aa853a601142.png",
  },
  // 🍯 디저트
  {
    id: 15, name: "Château d'Yquem 2015", type: "dessert",
    country: "🇫🇷 프랑스", varietal: "Sémillon/Sauvignon Blanc",
    price: 380000, vintage: 2015, region: "Sauternes",
    tasting_note: "꿀, 살구잼, 바닐라, 보트리티스. 최상급 소테른.",
    food_tags: "디저트,푸아그라,치즈",
    style: "sweet", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/aa7b9e1e50a19.png",
  },
  {
    id: 16, name: "Tokaji Aszú 5 Puttonyos 2017", type: "dessert",
    country: "🇭🇺 헝가리", varietal: "Furmint Blend",
    price: 95000, vintage: 2017, region: "Tokaj",
    tasting_note: "꿀, 살구, 오렌지 껍질. 밝은 산미가 단맛을 잡아줌.",
    food_tags: "디저트,치즈,푸아그라",
    style: "sweet", in_stock: true, image_url: "https://cdn.imweb.me/upload/S20260623d22249772fa4d/000b0f746696e.png",
  },
];