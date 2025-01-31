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

io.on("connection", async (socket) => {
  console.log("소컷연결");

  const symbol = socket.handshake.query.symbol; // 클라이언트에서 전달된 symbol

  const fetchStockData = async () => {
    try {
      // 파이낸스 정보 가져오기
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
    setTimeout(fetchStockDataLoop, 65000);
  };

  fetchStockDataLoop();

  // 소켓 연결 해제 시 interval 정리
  socket.on("disconnect", () => {
    console.log("소켓 연결 종료");
    clearInterval(interval);
  });
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
