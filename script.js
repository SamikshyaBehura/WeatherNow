
const $ = (id) => document.getElementById(id);

const searchForm = $("searchForm");
const cityInput = $("cityInput");
const citySuggestions = $("citySuggestions");
const statusBox = $("status");

let currentUnit = "celsius";
let currentPlace = null;
let latestWeather = null;
let searchTimer = null;
let searchController = null;
let weatherController = null;
let searchVersion = 0;

const weatherDescriptions = {
  0: ["Clear sky", "☀️"],
  1: ["Mainly clear", "🌤️"],
  2: ["Partly cloudy", "⛅"],
  3: ["Overcast", "☁️"],
  45: ["Foggy", "🌫️"],
  48: ["Rime fog", "🌫️"],
  51: ["Light drizzle", "🌦️"],
  53: ["Drizzle", "🌦️"],
  55: ["Heavy drizzle", "🌧️"],
  56: ["Freezing drizzle", "🌧️"],
  57: ["Heavy freezing drizzle", "🌧️"],
  61: ["Light rain", "🌦️"],
  63: ["Moderate rain", "🌧️"],
  65: ["Heavy rain", "🌧️"],
  66: ["Freezing rain", "🌧️"],
  67: ["Heavy freezing rain", "🌧️"],
  71: ["Light snowfall", "🌨️"],
  73: ["Snowfall", "❄️"],
  75: ["Heavy snowfall", "🌨️"],
  77: ["Snow grains", "❄️"],
  80: ["Rain showers", "🌦️"],
  81: ["Moderate showers", "🌧️"],
  82: ["Heavy showers", "⛈️"],
  85: ["Snow showers", "🌨️"],
  86: ["Heavy snow showers", "❄️"],
  95: ["Thunderstorm", "⛈️"],
  96: ["Thunderstorm with hail", "⛈️"],
  99: ["Severe thunderstorm", "⛈️"]
};

function getWeatherInfo(code) {
  return weatherDescriptions[code] || ["Weather unavailable", "🌡️"];
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function getCityName(place) {
  return place.name || "Unknown city";
}

function getStateName(place) {
  return place.admin1 || place.admin2 || "India";
}

function toDisplayTemperature(celsius) {
  if (celsius == null || !Number.isFinite(Number(celsius))) {
    return "--";
  }

  const value = currentUnit === "fahrenheit"
    ? Number(celsius) * 9 / 5 + 32
    : Number(celsius);

  return Math.round(value);
}

function temperatureText(celsius) {
  const value = toDisplayTemperature(celsius);
  return value === "--" ? "--°" : `${value}°`;
}

function formatTime(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

function formatDay(value) {
  const date = new Date(`${value}T12:00:00`);

  return date.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  });
}

function hideSuggestions() {
  citySuggestions.classList.remove("show");
  citySuggestions.replaceChildren();
}

function showSuggestions(places) {
  citySuggestions.replaceChildren();

  if (!places.length) {
    const empty = document.createElement("div");
    empty.className = "suggestion-item";
    empty.textContent = "No matching Indian locations found.";
    citySuggestions.appendChild(empty);
    citySuggestions.classList.add("show");
    return;
  }

  places.forEach((place) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-item";
    button.setAttribute("role", "option");

    const pin = document.createElement("span");
    pin.className = "suggestion-pin";
    pin.textContent = "📍";

    const text = document.createElement("span");
    text.className = "suggestion-text";

    const city = document.createElement("span");
    city.className = "suggestion-city";
    city.textContent = getCityName(place);

    const state = document.createElement("span");
    state.className = "suggestion-state";

    const region = getStateName(place);
    const district = place.admin2 && place.admin2 !== region
      ? ` · ${place.admin2}`
      : "";

    state.textContent = `${region}${district}, India`;

    text.append(city, state);
    button.append(pin, text);

    button.addEventListener("click", () => {
      cityInput.value = getCityName(place);
      hideSuggestions();
      loadWeather(place);
    });

    citySuggestions.appendChild(button);
  });

  citySuggestions.classList.add("show");
}

async function searchCities(query) {
  if (searchController) {
    searchController.abort();
  }

  const controller = new AbortController();
  searchController = controller;
  const version = ++searchVersion;

  const url = new URL(
    "https://geocoding-api.open-meteo.com/v1/search"
  );

  url.searchParams.set("name", query);
  url.searchParams.set("count", "100");
  url.searchParams.set("language", "en");
  url.searchParams.set("format", "json");
  url.searchParams.set("countryCode", "IN");

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("City search failed.");
    }

    const result = await response.json();

    if (controller.signal.aborted || version !== searchVersion) {
      return [];
    }

    const places = (result.results || [])
      .filter((place) =>
        place.country_code === "IN" &&
        Number.isFinite(place.latitude) &&
        Number.isFinite(place.longitude)
      )
      .sort((a, b) =>
        (b.population || 0) - (a.population || 0)
      );

    showSuggestions(places);
    return places;
  } catch (error) {
    if (error.name === "AbortError") return [];

    if (version === searchVersion) {
      setStatus("Search failed. Check your internet connection.", true);
      showSuggestions([]);
    }

    return [];
  }
}

cityInput.addEventListener("input", () => {
  clearTimeout(searchTimer);

  const query = cityInput.value.trim();

  if (query.length < 2) {
    if (searchController) searchController.abort();
    searchVersion++;
    hideSuggestions();
    return;
  }

  searchTimer = setTimeout(() => {
    searchCities(query);
  }, 300);
});

cityInput.addEventListener("focus", () => {
  const query = cityInput.value.trim();

  if (query.length >= 2) {
    searchCities(query);
  }
});

document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-box")) {
    hideSuggestions();
  }
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const query = cityInput.value.trim();

  if (query.length < 2) {
    setStatus("Enter at least two letters to search.", true);
    return;
  }

  setStatus("Searching Indian cities...");

  const places = await searchCities(query);

  if (places.length > 0) {
    setStatus("Select the correct city and state from the suggestions.");
  } else {
    setStatus("No results found. Try another spelling.", true);
  }
});

async function loadWeather(place) {
  if (
    !place ||
    !Number.isFinite(Number(place.latitude)) ||
    !Number.isFinite(Number(place.longitude))
  ) {
    setStatus("Please select a valid city.", true);
    return;
  }

  currentPlace = place;
  latestWeather = null;

  if (weatherController) {
    weatherController.abort();
  }

  const controller = new AbortController();
  weatherController = controller;

  $("cityName").textContent = getCityName(place);
  $("stateName").textContent = `${getStateName(place)}, India`;
  $("currentDate").textContent = "Updating local weather...";
  $("description").textContent = "Loading weather...";
  $("weatherIcon").textContent = "🌡️";
  $("temperature").textContent = "--";
  $("degree").textContent = currentUnit === "fahrenheit" ? "°F" : "°C";
  $("feelsLike").textContent = "--°";
  $("humidity").textContent = "--%";
  $("wind").textContent = "-- km/h";
  $("pressure").textContent = "-- hPa";
  $("visibility").textContent = "-- km";

  $("hourlyForecast").replaceChildren();
  $("forecast").replaceChildren();

  setStatus(`Fetching weather for ${getCityName(place)}...`);

  const url = new URL("https://api.open-meteo.com/v1/forecast");

  url.searchParams.set("latitude", place.latitude);
  url.searchParams.set("longitude", place.longitude);
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "weather_code",
      "surface_pressure",
      "wind_speed_10m"
    ].join(",")
  );

  url.searchParams.set(
    "hourly",
    [
      "temperature_2m",
      "weather_code",
      "precipitation_probability",
      "visibility"
    ].join(",")
  );

  url.searchParams.set(
    "daily",
    [
      "weather_code",
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_probability_max"
    ].join(",")
  );

  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "5");
  url.searchParams.set("wind_speed_unit", "kmh");

  try {
    const response = await fetch(url, {
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error("Weather service is unavailable.");
    }

    const data = await response.json();

    if (controller.signal.aborted) return;

    if (!data.current || !data.hourly || !data.daily) {
      throw new Error("Weather data is incomplete.");
    }

    latestWeather = data;
    renderWeather();

    setStatus(`Weather updated for ${getCityName(place)}.`);
  } catch (error) {
    if (error.name === "AbortError") return;

    setStatus(
      `${error.message || "Could not load weather."} Please try again.`,
      true
    );

    $("description").textContent = "Unable to load weather";
  }
}

function renderWeather() {
  if (!latestWeather || !currentPlace) return;

  const data = latestWeather;
  const current = data.current;
  const info = getWeatherInfo(current.weather_code);

  $("cityName").textContent = getCityName(currentPlace);
  $("stateName").textContent = `${getStateName(currentPlace)}, India`;

  $("currentDate").textContent = new Date(current.time)
    .toLocaleString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    });

  $("weatherIcon").textContent =
    current.is_day === 0 && [0, 1, 2].includes(current.weather_code)
      ? "🌙"
      : info[1];

  $("temperature").textContent =
    toDisplayTemperature(current.temperature_2m);

  $("degree").textContent =
    currentUnit === "fahrenheit" ? "°F" : "°C";

  $("description").textContent = info[0];
  $("feelsLike").textContent = temperatureText(current.apparent_temperature);

  $("humidity").textContent =
    current.relative_humidity_2m == null
      ? "--%"
      : `${current.relative_humidity_2m}%`;

  $("wind").textContent =
    current.wind_speed_10m == null
      ? "-- km/h"
      : `${Math.round(current.wind_speed_10m)} km/h`;

  $("pressure").textContent =
    current.surface_pressure == null
      ? "-- hPa"
      : `${Math.round(current.surface_pressure)} hPa`;

  const hourIndex = data.hourly.time.findIndex(
    (time) => time >= current.time
  );

  const visibility = hourIndex >= 0
    ? data.hourly.visibility?.[hourIndex]
    : null;

  $("visibility").textContent =
    visibility == null
      ? "-- km"
      : `${(visibility / 1000).toFixed(1)} km`;

  $("weatherTip").textContent =
    current.precipitation > 0
      ? "🌧️ Rain is being reported. Consider carrying an umbrella."
      : current.temperature_2m >= 35
        ? "☀️ It is hot outside. Stay hydrated."
        : "✨ Check the forecast before heading out.";

  renderHourly(data, hourIndex);
  renderDaily(data);
}

function renderHourly(data, startIndex) {
  const container = $("hourlyForecast");
  container.replaceChildren();

  if (startIndex < 0) {
    container.textContent = "Hourly forecast unavailable.";
    return;
  }

  const endIndex = Math.min(startIndex + 6, data.hourly.time.length);

  for (let index = startIndex; index < endIndex; index++) {
    const info = getWeatherInfo(data.hourly.weather_code[index]);

    const card = document.createElement("article");
    card.className = "hour-card";

    const time = document.createElement("span");
    time.className = "forecast-time";
    time.textContent = index === startIndex
      ? "Now"
      : formatTime(data.hourly.time[index]);

    const icon = document.createElement("span");
    icon.className = "forecast-icon";
    icon.textContent = info[1];

    const temp = document.createElement("strong");
    temp.className = "forecast-temp";
    temp.textContent = temperatureText(data.hourly.temperature_2m[index]);

    card.append(time, icon, temp);
    container.appendChild(card);
  }
}

function renderDaily(data) {
  const container = $("forecast");
  container.replaceChildren();

  data.daily.time.forEach((date, index) => {
    const info = getWeatherInfo(data.daily.weather_code[index]);

    const card = document.createElement("article");
    card.className = "day-card";

    const day = document.createElement("span");
    day.className = "day-date";
    day.textContent = index === 0 ? "Today" : formatDay(date);

    const icon = document.createElement("span");
    icon.className = "forecast-icon";
    icon.textContent = info[1];

    const temps = document.createElement("strong");
    temps.className = "day-temperatures";
    temps.textContent =
      `${temperatureText(data.daily.temperature_2m_max[index])} / ` +
      `${temperatureText(data.daily.temperature_2m_min[index])}`;

    const description = document.createElement("span");
    description.className = "day-description";
    description.textContent = info[0];

    const rain = document.createElement("span");
    rain.className = "rain-chance";

    const chance = data.daily.precipitation_probability_max?.[index];
    rain.textContent = `💧 ${chance == null ? "--" : chance}%`;

    card.append(day, icon, temps, description, rain);
    container.appendChild(card);
  });
}

$("celsiusBtn").addEventListener("click", () => {
  currentUnit = "celsius";
  $("celsiusBtn").classList.add("active");
  $("fahrenheitBtn").classList.remove("active");
  renderWeather();
});

$("fahrenheitBtn").addEventListener("click", () => {
  currentUnit = "fahrenheit";
  $("fahrenheitBtn").classList.add("active");
  $("celsiusBtn").classList.remove("active");
  renderWeather();
});

async function loadDefaultCity() {
  const defaultCity = {
    name: "Bhubaneswar",
    admin1: "Odisha",
    country: "India",
    country_code: "IN",
    latitude: 20.2961,
    longitude: 85.8245
  };

  cityInput.value = defaultCity.name;
  await loadWeather(defaultCity);
}

loadDefaultCity();
