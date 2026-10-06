/* ===================================================
   ỨNG DỤNG THỜI TIẾT - JavaScript thuần
   Nguồn dữ liệu: Open-Meteo (miễn phí, không cần API key)
   =================================================== */
'use strict';

/* ===================================================
   1. CẤU HÌNH & HẰNG SỐ
   =================================================== */
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
// Open-Meteo không có API đổi tọa độ -> tên địa điểm, nên dùng dịch vụ miễn phí của BigDataCloud
const REVERSE_GEOCODE_URL = 'https://api.bigdatacloud.net/data/reverse-geocode-client';

const STORAGE_KEY_CITY = 'weather_last_city';  // Khóa lưu thành phố gần nhất
const STORAGE_KEY_UNIT = 'weather_unit';       // Khóa lưu đơn vị nhiệt độ
const REQUEST_TIMEOUT = 10000;                 // Thời gian chờ tối đa mỗi yêu cầu (ms)

// Thành phố mặc định khi người dùng mở trang lần đầu
const DEFAULT_CITY = { name: 'Hà Nội', country: 'Việt Nam', latitude: 21.0285, longitude: 105.8542 };

/* ===================================================
   2. BẢNG MÃ THỜI TIẾT (WMO) -> MÔ TẢ, BIỂU TƯỢNG, NỀN
   =================================================== */
const WEATHER_CODES = {
  0:  { desc: 'Trời quang',            day: '☀️', night: '🌙', theme: 'clear' },
  1:  { desc: 'Chủ yếu quang đãng',    day: '🌤️', night: '🌙', theme: 'clear' },
  2:  { desc: 'Có mây rải rác',        day: '⛅', night: '☁️', theme: 'cloudy' },
  3:  { desc: 'Nhiều mây',             day: '☁️', night: '☁️', theme: 'cloudy' },
  45: { desc: 'Sương mù',              day: '🌫️', night: '🌫️', theme: 'fog' },
  48: { desc: 'Sương mù đóng băng',    day: '🌫️', night: '🌫️', theme: 'fog' },
  51: { desc: 'Mưa phùn nhẹ',          day: '🌦️', night: '🌧️', theme: 'rain' },
  53: { desc: 'Mưa phùn',              day: '🌦️', night: '🌧️', theme: 'rain' },
  55: { desc: 'Mưa phùn dày',          day: '🌧️', night: '🌧️', theme: 'rain' },
  56: { desc: 'Mưa phùn băng giá nhẹ', day: '🌧️', night: '🌧️', theme: 'rain' },
  57: { desc: 'Mưa phùn băng giá',     day: '🌧️', night: '🌧️', theme: 'rain' },
  61: { desc: 'Mưa nhẹ',               day: '🌦️', night: '🌧️', theme: 'rain' },
  63: { desc: 'Mưa vừa',               day: '🌧️', night: '🌧️', theme: 'rain' },
  65: { desc: 'Mưa to',                day: '🌧️', night: '🌧️', theme: 'rain' },
  66: { desc: 'Mưa băng giá nhẹ',      day: '🌧️', night: '🌧️', theme: 'rain' },
  67: { desc: 'Mưa băng giá',          day: '🌧️', night: '🌧️', theme: 'rain' },
  71: { desc: 'Tuyết rơi nhẹ',         day: '🌨️', night: '🌨️', theme: 'snow' },
  73: { desc: 'Tuyết rơi vừa',         day: '🌨️', night: '🌨️', theme: 'snow' },
  75: { desc: 'Tuyết rơi dày',         day: '❄️', night: '❄️', theme: 'snow' },
  77: { desc: 'Mưa tuyết hạt',         day: '🌨️', night: '🌨️', theme: 'snow' },
  80: { desc: 'Mưa rào nhẹ',           day: '🌦️', night: '🌧️', theme: 'rain' },
  81: { desc: 'Mưa rào',               day: '🌧️', night: '🌧️', theme: 'rain' },
  82: { desc: 'Mưa rào rất to',        day: '⛈️', night: '⛈️', theme: 'storm' },
  85: { desc: 'Mưa tuyết nhẹ',         day: '🌨️', night: '🌨️', theme: 'snow' },
  86: { desc: 'Mưa tuyết to',          day: '❄️', night: '❄️', theme: 'snow' },
  95: { desc: 'Dông',                  day: '⛈️', night: '⛈️', theme: 'storm' },
  96: { desc: 'Dông kèm mưa đá nhẹ',   day: '⛈️', night: '⛈️', theme: 'storm' },
  99: { desc: 'Dông kèm mưa đá lớn',   day: '⛈️', night: '⛈️', theme: 'storm' }
};

// Lấy thông tin thời tiết theo mã; có giá trị dự phòng nếu mã lạ
function getWeatherInfo(code, isDay = true) {
  const info = WEATHER_CODES[code] || { desc: 'Không xác định', day: '🌡️', night: '🌡️', theme: 'default' };
  return { desc: info.desc, icon: isDay ? info.day : info.night, theme: info.theme };
}

/* ===================================================
   3. LẤY CÁC PHẦN TỬ DOM
   =================================================== */
const $ = (id) => document.getElementById(id);

const els = {
  form: $('searchForm'),
  input: $('cityInput'),
  searchBtn: $('searchBtn'),
  locationBtn: $('locationBtn'),
  unitBtns: document.querySelectorAll('.unit-btn'),
  errorBox: $('errorBox'),
  errorMessage: $('errorMessage'),
  errorClose: $('errorClose'),
  loading: $('loading'),
  content: $('weatherContent'),
  offlineBanner: $('offlineBanner'),
  cityName: $('cityName'),
  localTime: $('localTime'),
  weatherDesc: $('weatherDesc'),
  tempRange: $('tempRange'),
  weatherIcon: $('weatherIcon'),
  currentTemp: $('currentTemp'),
  feelsLike: $('feelsLike'),
  humidity: $('humidity'),
  windSpeed: $('windSpeed'),
  pressure: $('pressure'),
  hourlyList: $('hourlyList'),
  dailyList: $('dailyList')
};

/* ===================================================
   4. TRẠNG THÁI ỨNG DỤNG
   =================================================== */
const state = {
  unit: 'C',          // Đơn vị đang hiển thị: 'C' hoặc 'F'
  location: null,     // Địa điểm hiện tại { name, country, latitude, longitude }
  data: null,         // Dữ liệu thời tiết gốc (luôn lưu theo °C)
  requestId: 0        // Bộ đếm để bỏ qua phản hồi cũ khi người dùng tìm liên tục
};

/* ===================================================
   5. LOCALSTORAGE (bọc try/catch vì có thể bị chặn ở chế độ riêng tư)
   =================================================== */
const storage = {
  get(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Bỏ qua nếu không lưu được */
    }
  }
};

/* ===================================================
   6. HÀM TIỆN ÍCH: CHUYỂN ĐỔI & ĐỊNH DẠNG
   =================================================== */
// Đổi °C sang đơn vị hiện tại và làm tròn
function formatTemp(celsius) {
  if (celsius == null || Number.isNaN(celsius)) return '--';
  const value = state.unit === 'F' ? celsius * 9 / 5 + 32 : celsius;
  return `${Math.round(value)}°`;
}

// Tạo tên hiển thị đầy đủ của địa điểm
function formatLocationName(loc) {
  return [loc.name, loc.admin1 !== loc.name ? loc.admin1 : null, loc.country]
    .filter(Boolean)
    .join(', ');
}

// Chuyển chuỗi "YYYY-MM-DD" thành Date theo giờ địa phương (tránh lệch múi giờ)
function parseDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Tên ngày trong tuần bằng tiếng Việt
function formatDayName(dateStr, index) {
  if (index === 0) return 'Hôm nay';
  if (index === 1) return 'Ngày mai';
  const name = parseDate(dateStr).toLocaleDateString('vi-VN', { weekday: 'long' });
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Ngày/tháng ngắn gọn, ví dụ: 06/10
function formatShortDate(dateStr) {
  // Tự ghép chuỗi để định dạng giống nhau trên mọi trình duyệt
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

// Giờ địa phương hiện tại của thành phố (dựa theo múi giờ API trả về)
function formatLocalTime(timezone) {
  try {
    return new Date().toLocaleString('vi-VN', {
      timeZone: timezone,
      weekday: 'long',
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  } catch {
    return new Date().toLocaleString('vi-VN');
  }
}

/* ===================================================
   7. ĐIỀU KHIỂN GIAO DIỆN: LOADING, LỖI, NỀN
   =================================================== */
function setLoading(isLoading) {
  els.loading.hidden = !isLoading;
  els.searchBtn.disabled = isLoading;
  els.locationBtn.disabled = isLoading;
  // Ẩn nội dung cũ khi đang tải lần đầu (chưa có dữ liệu)
  if (isLoading && !state.data) els.content.hidden = true;
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorBox.hidden = false;
}

function hideError() {
  els.errorBox.hidden = true;
}

// Đổi màu nền theo thời tiết hiện tại (ban đêm dùng nền tối khi trời quang)
function applyTheme(theme, isDay) {
  const finalTheme = !isDay && (theme === 'clear' || theme === 'cloudy') ? 'night' : theme;
  document.body.className = `theme-${finalTheme}`;
}

/* ===================================================
   8. GỌI API (có timeout và phân loại lỗi)
   =================================================== */
// Lỗi tự định nghĩa để hiển thị thông báo thân thiện
class AppError extends Error {}

async function fetchJSON(url) {
  // Kiểm tra mạng trước khi gửi yêu cầu
  if (!navigator.onLine) {
    throw new AppError('Không có kết nối mạng. Vui lòng kiểm tra Internet và thử lại.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new AppError(`Máy chủ thời tiết gặp sự cố (mã lỗi ${res.status}). Vui lòng thử lại sau.`);
    }
    return await res.json();
  } catch (err) {
    if (err instanceof AppError) throw err;
    if (err.name === 'AbortError') {
      throw new AppError('Yêu cầu quá thời gian chờ. Mạng có thể đang chậm, vui lòng thử lại.');
    }
    // fetch ném TypeError khi mất mạng hoặc bị chặn
    throw new AppError('Không thể kết nối đến máy chủ. Vui lòng kiểm tra kết nối mạng.');
  } finally {
    clearTimeout(timer);
  }
}

// Tìm tọa độ của thành phố theo tên
async function geocodeCity(name) {
  const params = new URLSearchParams({ name, count: '1', language: 'vi', format: 'json' });
  const data = await fetchJSON(`${GEOCODING_URL}?${params}`);

  if (!data.results || data.results.length === 0) {
    throw new AppError(`Không tìm thấy thành phố "${name}". Vui lòng kiểm tra lại chính tả.`);
  }

  const r = data.results[0];
  return {
    name: r.name,
    admin1: r.admin1,
    country: r.country,
    latitude: r.latitude,
    longitude: r.longitude
  };
}

// Lấy tên địa điểm từ tọa độ (nếu thất bại vẫn dùng được tọa độ)
async function reverseGeocode(lat, lon) {
  try {
    const params = new URLSearchParams({ latitude: lat, longitude: lon, localityLanguage: 'vi' });
    const data = await fetchJSON(`${REVERSE_GEOCODE_URL}?${params}`);
    const name = data.city || data.locality || data.principalSubdivision;
    if (name) {
      return { name, admin1: data.principalSubdivision, country: data.countryName };
    }
  } catch {
    /* Bỏ qua lỗi, dùng tên dự phòng bên dưới */
  }
  return { name: 'Vị trí của tôi', admin1: null, country: `${lat.toFixed(2)}, ${lon.toFixed(2)}` };
}

// Lấy dữ liệu thời tiết hiện tại + theo giờ + 7 ngày (luôn lấy theo °C, km/h)
async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: lat,
    longitude: lon,
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,pressure_msl,weather_code,is_day',
    hourly: 'temperature_2m,weather_code,precipitation_probability,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '8' // Lấy dư 1 ngày để luôn đủ 24 giờ tới
  });
  return fetchJSON(`${FORECAST_URL}?${params}`);
}

/* ===================================================
   9. LUỒNG CHÍNH: TẢI THỜI TIẾT CHO MỘT ĐỊA ĐIỂM
   =================================================== */
// `getLocation` là hàm async trả về địa điểm (tìm theo tên hoặc theo GPS)
async function loadWeather(getLocation) {
  const myRequest = ++state.requestId;
  hideError();
  setLoading(true);

  try {
    const location = await getLocation();
    const data = await fetchWeather(location.latitude, location.longitude);

    // Nếu đã có yêu cầu mới hơn thì bỏ qua kết quả này
    if (myRequest !== state.requestId) return;

    state.location = location;
    state.data = data;
    storage.set(STORAGE_KEY_CITY, location); // Lưu thành phố gần nhất
    render();
  } catch (err) {
    if (myRequest !== state.requestId) return;
    showError(err instanceof AppError ? err.message : 'Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.');
    console.error(err);
  } finally {
    if (myRequest === state.requestId) setLoading(false);
  }
}

// Tìm theo tên thành phố người dùng nhập
function searchCity(name) {
  const query = name.trim();
  if (!query) {
    showError('Vui lòng nhập tên thành phố.');
    els.input.focus();
    return;
  }
  loadWeather(() => geocodeCity(query));
}

// Lấy vị trí hiện tại bằng Geolocation API
function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new AppError('Trình duyệt của bạn không hỗ trợ định vị.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      (err) => {
        const messages = {
          1: 'Bạn đã từ chối quyền truy cập vị trí. Hãy cho phép trong cài đặt trình duyệt.',
          2: 'Không thể xác định vị trí của bạn. Vui lòng thử lại.',
          3: 'Hết thời gian chờ xác định vị trí. Vui lòng thử lại.'
        };
        reject(new AppError(messages[err.code] || 'Không thể lấy vị trí của bạn.'));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 }
    );
  });
}

function loadMyLocation() {
  loadWeather(async () => {
    const { latitude, longitude } = await getCurrentPosition();
    const place = await reverseGeocode(latitude, longitude);
    return { ...place, latitude, longitude };
  });
}

/* ===================================================
   10. HIỂN THỊ DỮ LIỆU
   =================================================== */
function render() {
  if (!state.data || !state.location) return;
  renderCurrent();
  renderHourly();
  renderDaily();
  els.content.hidden = false;
}

// Thời tiết hiện tại
function renderCurrent() {
  const { current, daily, timezone } = state.data;
  const isDay = current.is_day === 1;
  const info = getWeatherInfo(current.weather_code, isDay);

  els.cityName.textContent = formatLocationName(state.location);
  els.localTime.textContent = formatLocalTime(timezone);
  els.weatherDesc.textContent = info.desc;
  els.tempRange.textContent =
    `Cao ${formatTemp(daily.temperature_2m_max[0])} · Thấp ${formatTemp(daily.temperature_2m_min[0])}`;
  els.weatherIcon.textContent = info.icon;
  els.currentTemp.textContent = formatTemp(current.temperature_2m) + state.unit;
  els.feelsLike.textContent = formatTemp(current.apparent_temperature) + state.unit;
  els.humidity.textContent = `${Math.round(current.relative_humidity_2m)}%`;
  els.windSpeed.textContent = `${Math.round(current.wind_speed_10m)} km/h`;
  els.pressure.textContent = `${Math.round(current.pressure_msl)} hPa`;

  applyTheme(info.theme, isDay);
  document.title = `${formatTemp(current.temperature_2m)}${state.unit} ${state.location.name} - Thời Tiết`;
}

// Dự báo 24 giờ tới
function renderHourly() {
  const { current, hourly } = state.data;

  // Tìm vị trí giờ hiện tại trong mảng (so sánh chuỗi "YYYY-MM-DDTHH")
  const currentHour = current.time.slice(0, 13);
  let start = hourly.time.findIndex((t) => t.slice(0, 13) === currentHour);
  if (start === -1) start = 0;

  const fragment = document.createDocumentFragment();

  for (let i = start; i < Math.min(start + 24, hourly.time.length); i++) {
    const info = getWeatherInfo(hourly.weather_code[i], hourly.is_day[i] === 1);
    const rain = hourly.precipitation_probability[i];

    const item = document.createElement('div');
    item.className = 'hour-item' + (i === start ? ' now' : '');
    item.innerHTML = `
      <div class="hour-time">${i === start ? 'Bây giờ' : hourly.time[i].slice(11, 16)}</div>
      <div class="hour-icon" title="${info.desc}">${info.icon}</div>
      <div class="hour-temp">${formatTemp(hourly.temperature_2m[i])}</div>
      <div class="hour-rain">${rain > 0 ? `💧${rain}%` : ''}</div>
    `;
    fragment.appendChild(item);
  }

  els.hourlyList.replaceChildren(fragment);
  els.hourlyList.scrollLeft = 0;
}

// Dự báo 7 ngày
function renderDaily() {
  const { daily } = state.data;
  const days = Math.min(7, daily.time.length);

  // Tìm nhiệt độ thấp nhất/cao nhất cả tuần để vẽ thanh khoảng nhiệt độ
  const mins = daily.temperature_2m_min.slice(0, days);
  const maxs = daily.temperature_2m_max.slice(0, days);
  const weekMin = Math.min(...mins);
  const weekMax = Math.max(...maxs);
  const span = weekMax - weekMin || 1;

  const fragment = document.createDocumentFragment();

  for (let i = 0; i < days; i++) {
    const info = getWeatherInfo(daily.weather_code[i], true);
    const rain = daily.precipitation_probability_max[i];
    const left = ((mins[i] - weekMin) / span) * 100;
    const width = ((maxs[i] - mins[i]) / span) * 100;

    const li = document.createElement('li');
    li.className = 'day-item';
    li.innerHTML = `
      <div class="day-name">${formatDayName(daily.time[i], i)}<small>${formatShortDate(daily.time[i])}</small></div>
      <div class="day-icon" title="${info.desc}">${info.icon}</div>
      <div class="day-desc">${info.desc}</div>
      <div class="day-rain">${rain != null ? `💧${rain}%` : ''}</div>
      <div class="day-temps">
        <span class="min">${formatTemp(mins[i])}</span>
        <div class="temp-bar"><div class="temp-bar-fill" style="left:${left}%;width:${Math.max(width, 4)}%"></div></div>
        <span class="max">${formatTemp(maxs[i])}</span>
      </div>
    `;
    fragment.appendChild(li);
  }

  els.dailyList.replaceChildren(fragment);
}

/* ===================================================
   11. CHUYỂN ĐỔI ĐƠN VỊ °C / °F (không cần gọi lại API)
   =================================================== */
function setUnit(unit) {
  state.unit = unit;
  storage.set(STORAGE_KEY_UNIT, unit);
  els.unitBtns.forEach((btn) => {
    const active = btn.dataset.unit === unit;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', String(active));
  });
  render();
}

/* ===================================================
   12. XỬ LÝ TRẠNG THÁI MẠNG (online / offline)
   =================================================== */
function updateOnlineStatus() {
  const online = navigator.onLine;
  els.offlineBanner.hidden = online;

  // Khi có mạng lại: tự tải lại dữ liệu của địa điểm hiện tại
  if (online && state.location) {
    const loc = state.location;
    loadWeather(async () => loc);
  }
}

/* ===================================================
   13. GẮN SỰ KIỆN
   =================================================== */
// Submit form -> hỗ trợ cả bấm nút và nhấn Enter
els.form.addEventListener('submit', (e) => {
  e.preventDefault();
  searchCity(els.input.value);
});

els.locationBtn.addEventListener('click', loadMyLocation);
els.errorClose.addEventListener('click', hideError);
els.unitBtns.forEach((btn) => btn.addEventListener('click', () => setUnit(btn.dataset.unit)));

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);

// Cập nhật giờ địa phương mỗi phút
setInterval(() => {
  if (state.data) els.localTime.textContent = formatLocalTime(state.data.timezone);
}, 60 * 1000);

/* ===================================================
   14. KHỞI ĐỘNG ỨNG DỤNG
   =================================================== */
function init() {
  // Khôi phục đơn vị đã chọn
  const savedUnit = storage.get(STORAGE_KEY_UNIT);
  if (savedUnit === 'C' || savedUnit === 'F') setUnit(savedUnit);

  // Hiển thị banner nếu đang ngoại tuyến
  els.offlineBanner.hidden = navigator.onLine;

  // Khôi phục thành phố gần nhất (kiểm tra dữ liệu hợp lệ), nếu không có thì dùng mặc định
  const saved = storage.get(STORAGE_KEY_CITY);
  const isValid = saved && typeof saved.latitude === 'number' && typeof saved.longitude === 'number';
  const location = isValid ? saved : DEFAULT_CITY;

  loadWeather(async () => location);
}

init();
