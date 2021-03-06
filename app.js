const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const cloneDeep = require("lodash.clonedeep");
const remove = require("lodash.remove");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");

const astrologer = require('./astrologer')
const { zodiacSign } = require('./astrologer/utils')

const app = express();
const router = express.Router();

const root =
  process.env.NODE_ENV === "production"
    ? path.join(__dirname, "..")
    : __dirname;

    app.set("trust proxy", "loopback");

// cors
app.use(cors());

if (process.env.ENVIRONMENT !== "test") {
  // logger
  app.use(
    morgan(
      '[:date[clf]] ":method :url HTTP/:http-version" :status :res[content-length]'
    )
  );
}

// helmet configurations
app.use(helmet());

app.use(helmet.referrerPolicy());

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
    },
  })
);

app.use(
  helmet.featurePolicy({
    features: {
      fullscreen: ["'self'"],
      vibrate: ["'none'"],
      syncXhr: ["'none'"],
    },
  })
);

app.use(express.json());

app.use(bodyParser.json());
app.use("/static", express.static(path.join(root, "static")));

app.get("/", (_req, res) => {
  return res.sendFile("static/index.html", { root });
});

app.get("/documentation.yaml", (_req, res) => {
  return res.sendFile("static/RWS-card-api.yaml", { root });
});

app.use("/api/v1/", router);

router.use((_req, res, next) => {
  res.locals.rawData = JSON.parse(
    fs.readFileSync("static/card_data.json", "utf8")
  );
  return next();
});

router.use(function (_req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Credentials", true);
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin,X-Requested-With,Content-Type,Accept,content-type,application/json"
  );
  return next();
});

router.get("/", (_req, res) => {
  return res.redirect("/api/v1/cards");
});

router.get("/cards", (_req, res) => {
  const { cards } = res.locals.rawData;
  return res.json({ nhits: cards.length, cards }).status(200);
});

router.get("/cards/search", (req, res) => {
  const { cards } = res.locals.rawData;
  console.log(`req.query:`, req.query);
  if (!req.query || Object.keys(req.query).length === 0)
    return res.redirect("/api/v1/cards");
  let filteredCards = [];
  for (let k in req.query) {
    if (k !== "q") {
      if (k === "meaning") {
        filteredCards = cards.filter((c) =>
          [c.meaning_up, c.meaning_rev]
            .join()
            .toLowerCase()
            .includes(req.query[k].toLowerCase())
        );
      } else {
        filteredCards = cards.filter(
          (c) => c[k] && c[k].toLowerCase().includes(req.query[k].toLowerCase())
        );
      }
    } else if (k === "q") {
      filteredCards = cards.filter((c) =>
        Object.values(c)
          .join()
          .toLowerCase()
          .includes(req.query[k].toLowerCase())
      );
    }
  }
  return res
    .json({ nhits: filteredCards.length, cards: filteredCards })
    .status(200);
});

router.get("/cards/random", function (req, res) {
  const { cards } = res.locals.rawData;
  const n = req.query.n > 0 && req.query.n < 79 ? req.query.n : 78;
  let cardPool = cloneDeep(cards);
  let returnCards = [];
  for (let i = 0; i < n; i++) {
    let id = Math.floor(Math.random() * (78 - i));
    let card = cardPool[id];
    returnCards.push(card);
    remove(cardPool, (c) => c.name_short === card.name_short);
  }
  return res.json({ nhits: returnCards.length, cards: returnCards });
});

router.get("/cards/:id", (req, res, next) => {
  const { cards } = res.locals.rawData;
  const card = cards.find((c) => c.name_short === req.params.id);
  if (typeof card === "undefined") return next();
  return res.json({ nhits: 1, card }).status(200);
});

router.get("/cards/suits/:suit", (req, res, next) => {
  const { cards } = res.locals.rawData;
  const cardsOfSuit = cards.filter((c) => c.suit === req.params.suit);
  if (!cardsOfSuit.length) return next();
  return res
    .json({ nhits: cardsOfSuit.length, cards: cardsOfSuit })
    .status(200);
});

router.get("/cards/courts/:court", (req, res, next) => {
  const { cards } = res.locals.rawData;
  const { court } = req.params;
  const len = court.length;
  const courtSg =
    court.substr(len - 1) === "s" ? court.substr(0, len - 1) : court;
  const cardsOfCourt = cards.filter((c) => c.value === courtSg);
  if (!cardsOfCourt.length) return next();
  return res
    .json({ nhits: cardsOfCourt.length, cards: cardsOfCourt })
    .status(200);
});

router.get('/horoscope', async (req, res) => {
  const date = new Date(req.query.time)
  const { latitude, longitude } = req.query

  const chart = astrologer.natalChart(date, latitude, longitude)

  res.status(200).json({
    data: chart
  })
})

router.get('/moonSign', async (req, res) => {
  const date = new Date(req.query.time)
  const { latitude, longitude } = req.query

  const sign = zodiacSign(longitude)

  res.status(200).json(sign)
})

router.use(function (_req, _res, next) {
  var err = new Error("Not Found");
  err.status = 404;
  next(err);
});

router.use(function (err, _req, res, _next) {
  res.status(err.status || 500);
  res.json({ error: { status: err.status, message: err.message } });
});

var server = app.listen(process.env.PORT || 8080, function () {
  var port = server.address().port;
  console.log("RWS API Server now running on port", port);
});

module.exports = app;
