const express = require("express");
const yahooFinance = require("yahoo-finance2").default;
const dotenv = require("dotenv");
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const { createServer } = require("http");
const { Server } = require("socket.io");
const server = createServer(app);
const io = new Server(server);

app.use(express.static("public"));
app.set("view engine", "ejs");

app.get("/", async (req, res) => {
  res.render("main.ejs");
});

app.get("/detail/:symbol", async (req, res) => {
  try {
    let symbol = req.params.symbol;

    res.render("detail.ejs", { symbol: symbol });
  } catch (error) {
    console.error("에러:", error);
    res.status(500).send("Error fetching data");
  }
});

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

const activeIntervals = new Map();

io.on("connection", async (socket) => {
  console.log("소켓 연결됨:", socket.id);
  const symbol = socket.handshake.query.symbol;

  const fetchStockData = async () => {
    try {
      const stockData = await yahooFinance.quote(symbol);
      const marketState = stockData.marketState;
      const rate = await usdToKrw();
      const currentPriceInKRW = stockData.regularMarketPrice * rate;
      const highInKRW = stockData.regularMarketDayHigh * rate;
      const lowInKRW = stockData.regularMarketDayLow * rate;

      socket.emit(
        "data",
        formatCurrency(currentPriceInKRW),
        formatCurrency(highInKRW),
        formatCurrency(lowInKRW),
        marketState
      );
    } catch (error) {
      console.error("에러: ", error);
    }
  };

  const fetchStockDataLoop = async () => {
    await fetchStockData();
    if (activeIntervals.has(socket.id)) {
      const timeout = setTimeout(fetchStockDataLoop, 5000);
      activeIntervals.set(socket.id, timeout);
    }
  };

  await fetchStockData();
  activeIntervals.set(socket.id, setTimeout(fetchStockDataLoop, 5000));

  // 소켓 연결 해제 시 타임아웃 정리
  socket.on("disconnect", () => {
    console.log("소켓 연결 종료:", socket.id);
    clearTimeout(activeIntervals.get(socket.id));
    activeIntervals.delete(socket.id);
  });
});

// 서버 종료 시 모든 setTimeout 정리
process.on("SIGINT", () => {
  console.log("서버 종료 중, 모든 타임아웃 정리...");
  activeIntervals.forEach(clearTimeout);
  process.exit();
});

// 콤마 추가, 소숫점 제거 함수
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("ko-KR", {
    maximumFractionDigits: 0,
  }).format(amount);
};

// 환율 데이터 가져오는 함수
let cachedRate = null;
let lastFetchedTime = 0;

async function usdToKrw() {
  const now = Date.now();
  // 10분마다 갱신
  if (!cachedRate || now - lastFetchedTime > 10 * 60 * 1000) {
    try {
      const exchangeRateResponse = await fetch(
        "https://api.exchangerate-api.com/v4/latest/USD"
      );
      const exchangeRateData = await exchangeRateResponse.json();
      cachedRate = exchangeRateData.rates.KRW;
      lastFetchedTime = now;
    } catch (error) {
      console.error("환율 API 호출 실패:", error);
    }
  }
  return cachedRate;
}
