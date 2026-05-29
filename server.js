const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = 3000;
const ROOT = __dirname;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function loadEnvFile() {
  const envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return {};
  const env = {};
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim();
  }
  return env;
}

const envFromFile = loadEnvFile();

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*"
  });
  res.end(JSON.stringify(payload));
}

function extractApiErrorMessage(body) {
  if (!body) return null;
  const codeMatch = body.match(/<returnReasonCode>([^<]+)<\/returnReasonCode>/i);
  const msgMatch = body.match(/<returnAuthMsg>([^<]+)<\/returnAuthMsg>/i);
  const resultCodeMatch = body.match(/<resultCode>([^<]+)<\/resultCode>/i);
  const resultMsgMatch = body.match(/<resultMsg>([^<]+)<\/resultMsg>/i);

  if (codeMatch || msgMatch) {
    return `공공데이터포털 오류 (${codeMatch?.[1] || "?"}): ${msgMatch?.[1] || "인증키 또는 활용신청을 확인하세요."}`;
  }
  if (resultCodeMatch && resultCodeMatch[1] !== "00") {
    return `API 결과 오류 (${resultCodeMatch[1]}): ${resultMsgMatch?.[1] || "알 수 없음"}`;
  }
  return null;
}

function requestUrl(url) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https") ? https : http;
    lib
      .get(url, (apiRes) => {
        let body = "";
        apiRes.on("data", (chunk) => {
          body += chunk;
        });
        apiRes.on("end", () => {
          resolve({ statusCode: apiRes.statusCode || 0, body });
        });
      })
      .on("error", reject);
  });
}

function fetchOpenQstList(serviceKey, pageNo, numOfRows, qualgbCd) {
  const base =
    "http://apis.data.go.kr/B490007/openQst/getOpenQstList";

  const keyCandidates = [serviceKey, decodeURIComponent(serviceKey)];
  const uniqueKeys = [...new Set(keyCandidates.filter(Boolean))];

  return (async () => {
    let lastError = null;

    for (const key of uniqueKeys) {
      const params = new URLSearchParams({
        serviceKey: key,
        pageNo: String(pageNo),
        numOfRows: String(numOfRows),
        dataFormat: "xml",
        qualgbCd: qualgbCd || "T"
      });
      const url = `${base}?${params.toString()}`;

      try {
        const { statusCode, body } = await requestUrl(url);

        if (statusCode === 401 || statusCode === 403) {
          throw new Error(
            "인증 실패(401/403): 공공데이터포털에서 '국가자격 공개문제 조회 서비스' 활용신청 후 일반 인증키를 사용하세요."
          );
        }
        if (statusCode >= 400) {
          throw new Error(`공공데이터 API HTTP ${statusCode}`);
        }

        const apiError = extractApiErrorMessage(body);
        if (apiError) {
          throw new Error(apiError);
        }

        return body;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error("공개문제 API 호출 실패");
  })();
}

function serveStatic(req, res) {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = decodeURIComponent(reqUrl.pathname);
  if (pathname === "/") pathname = "/index.html";

  const filePath = path.normalize(path.join(ROOT, pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

async function handleApi(req, res, reqUrl) {
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    });
    res.end();
    return;
  }

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, message: "GET만 지원합니다." });
    return;
  }

  const pageNo = Number(reqUrl.searchParams.get("pageNo") || "1");
  const numOfRows = Number(reqUrl.searchParams.get("numOfRows") || "10");
  const qualgbCd = reqUrl.searchParams.get("qualgbCd") || "T";
  const serviceKey =
    reqUrl.searchParams.get("serviceKey") ||
    envFromFile.QNET_SERVICE_KEY ||
    "";

  if (!serviceKey) {
    sendJson(res, 400, {
      ok: false,
      message: "ServiceKey가 없습니다. 화면 입력 또는 .env의 QNET_SERVICE_KEY를 설정하세요."
    });
    return;
  }

  if (pageNo < 1 || numOfRows < 1) {
    sendJson(res, 400, { ok: false, message: "pageNo/numOfRows는 1 이상이어야 합니다." });
    return;
  }

  try {
    const xml = await fetchOpenQstList(serviceKey, pageNo, numOfRows, qualgbCd);
    res.writeHead(200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*"
    });
    res.end(xml);
  } catch (error) {
    sendJson(res, 502, {
      ok: false,
      message: error.message || "Q-Net API 호출 실패"
    });
  }
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (reqUrl.pathname === "/api/qnet/list") {
    await handleApi(req, res, reqUrl);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method Not Allowed");
});

server.listen(PORT, () => {
  console.log(`서버 실행: http://localhost:${PORT}`);
  console.log("브라우저에서 위 주소로 접속한 뒤 API 버튼을 눌러주세요.");
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error("");
    console.error(`[안내] 포트 ${PORT}은(는) 이미 사용 중입니다.`);
    console.error("서버가 이미 켜져 있을 수 있습니다.");
    console.error(`브라우저에서 http://localhost:${PORT} 를 열어보세요.`);
    console.error("다시 시작하려면 기존 서버 창에서 Ctrl+C 로 종료한 뒤 실행하세요.");
    process.exit(1);
  }
  throw error;
});
