/*
 * The weather in the top bar: where the visitor is, if they let the browser tell us, otherwise Nanjing.
 *
 * The forecast comes from Open-Meteo (free, no key, data under CC BY 4.0), fetched by the visitor's own
 * browser. The last forecast is kept in their browser for half an hour, so moving between pages shows it
 * at once. On a first visit the browser asks once for the visitor's location; their coordinates, rounded
 * to about a kilometre, go only to Open-Meteo and stay in their own browser. Saying no, or never
 * answering, keeps Nanjing; the panel has a button to try again or to go back to Nanjing.
 *
 * On a wide screen the chip sits at the end of the menu and opens like the "Updates" group (nav.js); in
 * the phone menu the forecast is listed under its own heading.
 */
(function () {
  "use strict";

  const box = document.querySelector("[data-weather]");
  if (!box || !window.fetch) return;
  const now = box.querySelector(".wx__now");
  const panel = box.querySelector(".wx__panel");
  const toggle = box.querySelector(".nav__toggle");
  const root = document.documentElement;
  const zh = () => root.getAttribute("data-lang") === "zh";

  const NANJING = { lat: 32.06, lon: 118.8, here: false };
  const FRESH = 30 * 60 * 1000; // a forecast younger than this is not fetched again
  const MOVED = 24 * 3600 * 1000; // a shared location older than this is looked up again, if allowed
  const KEY = { cache: "site-weather", where: "site-weather-where", loc: "site-weather-loc", asked: "site-weather-asked" };

  const store = {
    get(key) {
      try {
        return JSON.parse(localStorage.getItem(key));
      } catch (error) {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        // Storage is unavailable (private mode): the page still works, it just forgets.
      }
    },
  };

  /* WMO weather codes, as Open-Meteo reports them: icon, English, Chinese. */
  const CODES = {
    0: ["clear", "Clear", "晴"],
    1: ["clear", "Mainly clear", "少云"],
    2: ["part", "Partly cloudy", "多云"],
    3: ["cloud", "Overcast", "阴"],
    45: ["fog", "Fog", "雾"],
    48: ["fog", "Freezing fog", "冻雾"],
    51: ["drizzle", "Light drizzle", "毛毛雨"],
    53: ["drizzle", "Drizzle", "毛毛雨"],
    55: ["drizzle", "Dense drizzle", "毛毛雨"],
    56: ["sleet", "Freezing drizzle", "冻毛毛雨"],
    57: ["sleet", "Freezing drizzle", "冻毛毛雨"],
    61: ["rain", "Light rain", "小雨"],
    63: ["rain", "Rain", "中雨"],
    65: ["rain", "Heavy rain", "大雨"],
    66: ["sleet", "Freezing rain", "冻雨"],
    67: ["sleet", "Freezing rain", "冻雨"],
    71: ["snow", "Light snow", "小雪"],
    73: ["snow", "Snow", "中雪"],
    75: ["snow", "Heavy snow", "大雪"],
    77: ["snow", "Snow grains", "米雪"],
    80: ["rain", "Showers", "阵雨"],
    81: ["rain", "Showers", "阵雨"],
    82: ["rain", "Heavy showers", "强阵雨"],
    85: ["snow", "Snow showers", "阵雪"],
    86: ["snow", "Snow showers", "阵雪"],
    95: ["storm", "Thunderstorm", "雷阵雨"],
    96: ["storm", "Thunderstorm, hail", "雷阵雨伴冰雹"],
    97: ["storm", "Heavy thunderstorm", "强雷阵雨"],
    99: ["storm", "Thunderstorm, hail", "雷阵雨伴冰雹"],
  };

  /* Line icons on a 24 px grid, drawn in the text colour. */
  const CLOUD = "M7.2 19h10.3a4 4 0 0 0 .4-7.98 5.8 5.8 0 0 0-11.2 1.2A3.4 3.4 0 0 0 7.2 19z";
  const CLOUD_HIGH = "M7.2 15.5h10.3a4 4 0 0 0 .4-7.98 5.8 5.8 0 0 0-11.2 1.2A3.4 3.4 0 0 0 7.2 15.5z";
  const SHAPES = {
    clear: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5 7 17M17 7l1.5-1.5"/>',
    night: '<path d="M19.6 14.6A7.9 7.9 0 1 1 9.4 4.4a6.3 6.3 0 0 0 10.2 10.2z"/>',
    part: '<path d="M8.3 3.6v1.5M3.6 8.3h1.5M5 5l1 1M11.6 5l-1 1"/><path d="M5.6 11.4a3.2 3.2 0 0 1 5.9-2.6"/><path d="M9.6 20h8.2a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.5 1A2.9 2.9 0 0 0 9.6 20z"/>',
    partNight: '<path d="M11.4 9.2A4.7 4.7 0 1 1 5.2 3.3a3.7 3.7 0 0 0 6.2 5.9z"/><path d="M9.6 20h8.2a3.4 3.4 0 0 0 .3-6.8 4.9 4.9 0 0 0-9.5 1A2.9 2.9 0 0 0 9.6 20z"/>',
    cloud: `<path d="${CLOUD}"/>`,
    fog: `<path d="M3.5 8.5h17M5.5 12.5h13M3.5 16.5h17"/>`,
    drizzle: `<path d="${CLOUD_HIGH}"/><path d="M8.5 19.2v.1M12 20.2v.1M15.5 19.2v.1"/>`,
    rain: `<path d="${CLOUD_HIGH}"/><path d="M8.8 18.4 7.8 21M12.3 18.4l-1 2.6M15.8 18.4l-1 2.6"/>`,
    sleet: `<path d="${CLOUD_HIGH}"/><path d="M9.3 18.4l-1 2.6M14 19.4v.1M15.6 21.2v.1"/>`,
    snow: `<path d="${CLOUD_HIGH}"/><path d="M8.5 18.8v.1M12 18.8v.1M15.5 18.8v.1M10.2 21.4v.1M13.8 21.4v.1"/>`,
    storm: `<path d="${CLOUD_HIGH}"/><path d="M12.8 16.6 10.6 19.6h2.9l-2 3"/>`,
  };

  function icon(name, night, cls) {
    let key = name;
    if (night && name === "clear") key = "night";
    if (night && name === "part") key = "partNight";
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${SHAPES[key] || SHAPES.cloud}</svg>`;
  }

  /* Temperature on the site's afterglow colour table: blue when cold, through cyan and green, to red when hot. */
  const STOPS = [
    [-10, [35, 72, 255]],
    [2, [0, 200, 255]],
    [14, [54, 242, 122]],
    [26, [255, 227, 77]],
    [38, [255, 69, 48]],
  ];
  function colour(t) {
    if (t <= STOPS[0][0]) return `rgb(${STOPS[0][1].join(",")})`;
    for (let i = 1; i < STOPS.length; i++) {
      const [t1, c1] = STOPS[i];
      if (t <= t1) {
        const [t0, c0] = STOPS[i - 1];
        const k = (t - t0) / (t1 - t0);
        return `rgb(${c0.map((v, j) => Math.round(v + (c1[j] - v) * k)).join(",")})`;
      }
    }
    return `rgb(${STOPS[STOPS.length - 1][1].join(",")})`;
  }
  // The same colour mixed a third of the way to white: for the numbers, readable even when cold.
  const ink = (t) => colour(t).replace(/\d+/g, (v) => Math.round(+v + (255 - v) * 0.33));

  const WEEK = {
    en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    zh: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
  };
  function dayName(iso, i) {
    if (i === 0) return zh() ? "今天" : "Today";
    if (i === 1 && zh()) return "明天";
    const [y, m, d] = iso.split("-").map(Number);
    return WEEK[zh() ? "zh" : "en"][new Date(y, m - 1, d).getDay()];
  }

  let state = store.get(KEY.cache); // { at, lat, lon, here, data }
  let note = "";

  function render() {
    if (!state || !state.data) return;
    const d = state.data;
    const c = d.current;
    const [name, en, cn] = CODES[c.weather_code] || ["cloud", "", ""];
    const night = c.is_day === 0;
    const place = state.here ? (zh() ? "你这里" : "Near you") : zh() ? "南京" : "Nanjing";
    const desc = zh() ? cn : en;
    const temp = Math.round(c.temperature_2m);
    const feels = Math.round(c.apparent_temperature);

    now.innerHTML =
      `<span class="wx__label">${zh() ? "天气" : "Weather"}</span>` +
      icon(name, night, "wx__icon") +
      `<span class="wx__where">${place}</span><span class="wx__temp">${temp}°</span><span class="wx__desc">${desc}</span>`;
    toggle.setAttribute(
      "aria-label",
      zh() ? `${place}天气：${temp}°C，${desc}。打开 7 天预报` : `Weather ${place.toLowerCase()}: ${temp}°C, ${desc}. Open the 7-day forecast`
    );

    const days = d.daily.time.map((iso, i) => ({
      name: dayName(iso, i),
      code: d.daily.weather_code[i],
      hi: d.daily.temperature_2m_max[i],
      lo: d.daily.temperature_2m_min[i],
      rain: d.daily.precipitation_probability_max ? d.daily.precipitation_probability_max[i] : null,
    }));
    const low = Math.min(...days.map((x) => x.lo));
    const high = Math.max(...days.map((x) => x.hi));
    const span = Math.max(1, high - low);
    const cols = days
      .map((x) => {
        const top = ((high - x.hi) / span) * 100;
        const bottom = ((x.lo - low) / span) * 100;
        const [dn, den, dcn] = CODES[x.code] || ["cloud", "", ""];
        const rain = x.rain != null && x.rain >= 20 ? `${Math.round(x.rain)}%` : "";
        return (
          `<li class="wx__day" title="${zh() ? dcn : den}">` +
          `<span class="wx__dname">${x.name}</span>` +
          icon(dn, false, "wx__dicon") +
          `<b class="wx__hi" style="color:${ink(x.hi)}">${Math.round(x.hi)}°</b>` +
          `<span class="wx__track" aria-hidden="true"><i style="top:${top.toFixed(1)}%;bottom:${bottom.toFixed(1)}%;background:linear-gradient(to top,${colour(x.lo)},${colour(x.hi)})"></i></span>` +
          `<span class="wx__lo">${Math.round(x.lo)}°</span>` +
          `<span class="wx__rain">${rain}</span>` +
          `<span class="sr-only">${zh() ? `${dcn}，最高 ${Math.round(x.hi)}°，最低 ${Math.round(x.lo)}°${rain ? `，降水概率 ${rain}` : ""}` : `${den}, high ${Math.round(x.hi)}°, low ${Math.round(x.lo)}°${rain ? `, ${rain} chance of rain` : ""}`}</span>` +
          `</li>`
        );
      })
      .join("");

    const switchLabel = state.here ? (zh() ? "看南京的天气" : "Show Nanjing") : zh() ? "用我所在的位置" : "Use my location";
    panel.innerHTML =
      `<div class="wx__head">` +
      icon(name, night, "wx__big") +
      `<div class="wx__headtext"><span class="wx__place">${place}</span><b class="wx__deg">${temp}°</b>` +
      `<span class="wx__more">${desc} · ${zh() ? "体感" : "feels like"} ${feels}°</span></div></div>` +
      `<ol class="wx__days">${cols}</ol>` +
      (note ? `<p class="wx__note">${note}</p>` : "") +
      `<div class="wx__foot"><button class="wx__switch" type="button" data-wx-switch>${switchLabel}</button>` +
      `<a class="wx__credit" href="https://open-meteo.com/" target="_blank" rel="noopener">${zh() ? "天气数据：Open-Meteo" : "Weather data: Open-Meteo"}</a></div>`;
    box.hidden = false;
  }

  const round = (v) => Math.round(v * 100) / 100;

  async function load(place) {
    const fresh = state && state.lat === place.lat && state.lon === place.lon && Date.now() - state.at < FRESH;
    if (fresh) {
      if (state.here !== place.here) {
        state.here = place.here;
        render();
      }
      return;
    }
    const url =
      "https://api.open-meteo.com/v1/forecast?latitude=" + place.lat + "&longitude=" + place.lon +
      "&current=temperature_2m,apparent_temperature,weather_code,is_day" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
      "&timezone=auto&forecast_days=7";
    const stop = new AbortController();
    const timer = setTimeout(() => stop.abort(), 10000);
    try {
      const response = await fetch(url, { signal: stop.signal });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      if (!data.current || !data.daily || !Array.isArray(data.daily.time)) throw new Error("unexpected reply");
      state = { at: Date.now(), lat: place.lat, lon: place.lon, here: place.here, data };
      store.set(KEY.cache, state);
      render();
    } catch (error) {
      // No forecast (offline, or the service out of reach): keep any older one on show, else stay hidden.
      if (!state) box.hidden = true;
    } finally {
      clearTimeout(timer);
    }
  }

  function locate(asked) {
    if (!navigator.geolocation) return;
    store.set(KEY.asked, true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = { lat: round(position.coords.latitude), lon: round(position.coords.longitude), at: Date.now() };
        store.set(KEY.loc, loc);
        store.set(KEY.where, "here");
        note = "";
        load({ lat: loc.lat, lon: loc.lon, here: true });
      },
      () => {
        if (asked) {
          note = zh() ? "没有拿到位置，先看南京的天气。" : "Your location isn't available, so this is Nanjing.";
          render();
        }
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 6 * 3600 * 1000 }
    );
  }

  panel.addEventListener("click", (event) => {
    if (!event.target.closest("[data-wx-switch]")) return;
    if (state && state.here) {
      store.set(KEY.where, "nanjing");
      note = "";
      load(NANJING);
    } else {
      locate(true);
    }
  });

  document.addEventListener("site:lang", render);

  /* Start: what we showed last time at once, then the place this visitor goes with. */
  render();
  const where = store.get(KEY.where);
  const loc = store.get(KEY.loc);
  if (where === "here" && loc) {
    load({ lat: loc.lat, lon: loc.lon, here: true });
    if (Date.now() - loc.at > MOVED && navigator.permissions) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          if (status.state === "granted") locate(false);
        })
        .catch(() => {});
    }
  } else {
    load(NANJING);
    if (where !== "nanjing" && !store.get(KEY.asked)) {
      // A first visit: ask once, a moment after the page is up.
      const ask = () => setTimeout(() => locate(false), 1500);
      if (document.readyState === "complete") ask();
      else window.addEventListener("load", ask, { once: true });
    }
  }
})();
