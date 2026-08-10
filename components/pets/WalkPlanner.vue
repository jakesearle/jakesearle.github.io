<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

type WeatherType = 'sunny' | 'cloudy' | 'rainy' | 'snowy' | 'windy';
type ChunkStatus = 'good' | 'ok' | 'bad';
type Darkness = 'none' | 'before-sunrise' | 'after-sunset';

interface Settings {
  zip: string;
  earliestWalk: string; // 24hr "HH:MM", from <input type="time">
  latestWalk: string;
}

interface Range {
  min: number;
  max: number;
}

// What a stretch of time looks like weather-wise. For a single 30-minute chunk every range
// collapses to a point; merging chunks widens them to cover the whole run.
interface Conditions {
  darkness: Darkness;
  precip: Range; // % chance
  feels: Range; // °F apparent ("feels like")
  temp: Range; // °F air
  wind: Range; // mph
  code: number;
}

// One or more consecutive same-status chunks, drawn as a single block
interface Segment {
  startMin: number;
  endMin: number;
  span: number; // how many 30-minute chunks it covers, for grid sizing
  status: ChunkStatus;
  reason: string;
  conditions: Conditions;
}

interface DayForecast {
  day: string;
  date: string;
  weather: WeatherType;
  tempHigh: number;
  tempLow: number;
  chunkStarts: number[]; // one per 30-minute slot, used to lay out the time axis
  segments: Segment[];
}

const STORAGE_KEY = 'dogWalkPlannerSettings';

const defaultSettings: Settings = {
  zip: '27502',
  earliestWalk: '06:00',
  latestWalk: '20:30',
};

const settings = ref<Settings>({ ...defaultSettings });
const showSettings = ref(false);
const loading = ref(false);
const error = ref('');
const weekPlan = ref<DayForecast[]>([]);
const locationLabel = ref('');
// The block whose details are pinned in the bar above the timeline (tap/click to set)
const selected = ref<{ day: string; date: string; segment: Segment } | null>(null);

const statusLabels: Record<ChunkStatus, string> = {
  good: 'Definitely',
  ok: 'Maybe',
  bad: "Don't",
};

const loadSettings = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) settings.value = { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    // localStorage unavailable — fall back to defaults silently
  }
};

const saveSettings = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings.value));
  } catch {
    // ignore write failures (e.g. private browsing)
  }
};

// WMO weather codes (Open-Meteo) collapsed into our simplified buckets
const SNOW_CODES = [71, 73, 75, 77, 85, 86];
const HEAVY_SNOW_CODES = [75, 86];
const STORM_CODES = [95, 96, 99];

const weatherCodeToType = (code: number): WeatherType => {
  if ([0, 1].includes(code)) return 'sunny';
  if ([2, 3, 45, 48].includes(code)) return 'cloudy';
  if (SNOW_CODES.includes(code)) return 'snowy';
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, ...STORM_CODES].includes(code))
    return 'rainy';
  return 'cloudy';
};

const WINDY_THRESHOLD_MPH = 20;
const CHUNK_MINUTES = 30;
// It's still usable light for a little while either side of sunrise/sunset
const TWILIGHT_GRACE_MIN = 20;

// Everything a chunk gets judged on. First number bumps it to red, second to yellow.
const THRESHOLDS = {
  precipChance: { bad: 60, ok: 30 }, // percent
  hot: { bad: 90, ok: 80 }, // °F, feels-like
  cold: { bad: 20, ok: 32 }, // °F, feels-like
  wind: { bad: 25, ok: 15 }, // mph
};

const timeToMinutes = (t: string): number => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

const isoTimeToMinutes = (iso: string): number => {
  const timePart = iso.split('T')[1] ?? '00:00';
  return timeToMinutes(timePart);
};

const minutesToLabel = (mins: number): string => {
  const h24 = Math.floor(mins / 60) % 24;
  const m = ((mins % 60) + 60) % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
};

// Compact form for the axis ticks: "6a", "12p"
const minutesToTick = (mins: number): string => {
  const h24 = Math.floor(mins / 60) % 24;
  const period = h24 >= 12 ? 'p' : 'a';
  return `${h24 % 12 || 12}${period}`;
};

interface Note {
  status: ChunkStatus;
  text: string;
}

const darknessLabels: Record<Darkness, string> = {
  none: '',
  'before-sunrise': 'Before sunrise',
  'after-sunset': 'After sunset',
};

const point = (v: number): Range => ({ min: v, max: v });

const mergeRange = (a: Range, b: Range): Range => ({
  min: Math.min(a.min, b.min),
  max: Math.max(a.max, b.max),
});

// "84–89°" for a merged run, plain "89°" when the run never moved
const formatRange = (r: Range, unit: string): string =>
  r.min === r.max ? `${r.max}${unit}` : `${r.min}–${r.max}${unit}`;

// How bad a weather code is, so merging a run of chunks keeps the worst one
const codeSeverity = (code: number): number => {
  if (STORM_CODES.includes(code)) return 3;
  if (HEAVY_SNOW_CODES.includes(code)) return 2;
  if (SNOW_CODES.includes(code)) return 1;
  return 0;
};

const rate = (c: Conditions): { status: ChunkStatus; reason: string } => {
  const notes: Note[] = [];

  // Darkness is a warning, not a dealbreaker — it can never push a block to red on its own
  if (c.darkness !== 'none') notes.push({ status: 'ok', text: darknessLabels[c.darkness] });

  // Thresholds always key off the worst end of the range; only the wording shows the span
  const rainText = `${formatRange(c.precip, '%')} chance of rain`;
  if (c.precip.max >= THRESHOLDS.precipChance.bad) {
    notes.push({ status: 'bad', text: rainText });
  } else if (c.precip.max >= THRESHOLDS.precipChance.ok) {
    notes.push({ status: 'ok', text: rainText });
  }

  if (STORM_CODES.includes(c.code)) {
    notes.push({ status: 'bad', text: 'Thunderstorms' });
  } else if (HEAVY_SNOW_CODES.includes(c.code)) {
    notes.push({ status: 'bad', text: 'Heavy snow' });
  } else if (SNOW_CODES.includes(c.code)) {
    notes.push({ status: 'ok', text: 'Snow' });
  }

  const feelsText = `Feels like ${formatRange(c.feels, '°')}`;
  if (c.feels.max >= THRESHOLDS.hot.bad) {
    notes.push({ status: 'bad', text: `${feelsText} — pavement too hot` });
  } else if (c.feels.max >= THRESHOLDS.hot.ok) {
    notes.push({ status: 'ok', text: feelsText });
  }

  if (c.feels.min <= THRESHOLDS.cold.bad) {
    notes.push({ status: 'bad', text: `${feelsText} — too cold` });
  } else if (c.feels.min <= THRESHOLDS.cold.ok) {
    notes.push({ status: 'ok', text: feelsText });
  }

  const windText = `${formatRange(c.wind, ' mph')} wind`;
  if (c.wind.max >= THRESHOLDS.wind.bad) {
    notes.push({ status: 'bad', text: windText });
  } else if (c.wind.max >= THRESHOLDS.wind.ok) {
    notes.push({ status: 'ok', text: windText });
  }

  const status: ChunkStatus = notes.some((n) => n.status === 'bad')
    ? 'bad'
    : notes.some((n) => n.status === 'ok')
      ? 'ok'
      : 'good';

  const reason = notes
    .filter((n) => n.status === status)
    .map((n) => n.text)
    .join(' · ');

  return { status, reason: reason || 'Clear and comfortable' };
};

// Widen two conditions into their shared worst case. Darkness is the exception: it only
// survives if it covers the whole run, so a block that's mostly daylight never claims to be
// dark — the run keeps whatever else it was flagged for instead.
const mergeConditions = (a: Conditions, b: Conditions): Conditions => ({
  darkness: a.darkness === 'none' || b.darkness === 'none' ? 'none' : a.darkness,
  precip: mergeRange(a.precip, b.precip),
  feels: mergeRange(a.feels, b.feels),
  temp: mergeRange(a.temp, b.temp),
  wind: mergeRange(a.wind, b.wind),
  code: codeSeverity(a.code) >= codeSeverity(b.code) ? a.code : b.code,
});

// Collapse runs of consecutive same-status chunks into one block, so the timeline reads as
// a few wide bands instead of 29 slivers — and each band is a much bigger tap target.
const mergeIntoSegments = (
  chunks: { startMin: number; status: ChunkStatus; conditions: Conditions }[]
): Segment[] => {
  const segments: Segment[] = [];

  for (const chunk of chunks) {
    const last = segments[segments.length - 1];
    if (last && last.status === chunk.status) {
      last.endMin = chunk.startMin + CHUNK_MINUTES;
      last.span += 1;
      last.conditions = mergeConditions(last.conditions, chunk.conditions);
    } else {
      segments.push({
        startMin: chunk.startMin,
        endMin: chunk.startMin + CHUNK_MINUTES,
        span: 1,
        status: chunk.status,
        reason: '',
        conditions: { ...chunk.conditions },
      });
    }
  }

  // Re-describe each run from its merged worst case. Every chunk in a run already shares a
  // status, so taking the worst of each factor can't push the run into a different colour.
  for (const seg of segments) seg.reason = rate(seg.conditions).reason;

  return segments;
};

const fetchForecast = async () => {
  error.value = '';

  const earliestMin = timeToMinutes(settings.value.earliestWalk);
  const latestMin = timeToMinutes(settings.value.latestWalk);
  if (latestMin - earliestMin < CHUNK_MINUTES) {
    error.value = `Your latest walk time needs to be at least ${CHUNK_MINUTES} minutes after the earliest.`;
    weekPlan.value = [];
    selected.value = null;
    return;
  }

  loading.value = true;
  weekPlan.value = [];
  selected.value = null;

  try {
    // 1. Turn the zip code into coordinates
    const geoRes = await fetch(`https://api.zippopotam.us/us/${settings.value.zip}`);
    if (!geoRes.ok) throw new Error('Could not find that zip code');
    const geoData = await geoRes.json();
    const place = geoData.places?.[0];
    if (!place) throw new Error('Could not find that zip code');

    const lat = parseFloat(place.latitude);
    const lon = parseFloat(place.longitude);
    locationLabel.value = `${place['place name']}, ${place['state abbreviation']}`;

    // 2. Pull the hourly series (for the timeline) plus daily summary/sun times
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      daily: 'weathercode,temperature_2m_max,temperature_2m_min,windspeed_10m_max,sunrise,sunset',
      hourly:
        'temperature_2m,apparent_temperature,precipitation_probability,weathercode,windspeed_10m',
      temperature_unit: 'fahrenheit',
      windspeed_unit: 'mph',
      timezone: 'auto',
      forecast_days: '7',
    });
    const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!weatherRes.ok) throw new Error('Weather lookup failed');
    const weatherData = await weatherRes.json();
    const daily = weatherData.daily;
    const hourly = weatherData.hourly;

    // Look hours up by their ISO stamp rather than by offset — DST days aren't 24 hours long
    const hourIndex = new Map<string, number>();
    hourly.time.forEach((t: string, j: number) => hourIndex.set(t, j));

    const hourKey = (dateStr: string, hour: number) =>
      `${dateStr}T${hour.toString().padStart(2, '0')}:00`;

    // Values that vary smoothly (temp, wind) get interpolated to the half hour
    const sampleSmooth = (arr: number[], dateStr: string, mins: number): number | null => {
      const hour = Math.floor(mins / 60);
      const i = hourIndex.get(hourKey(dateStr, hour));
      if (i === undefined || arr[i] == null) return null;
      const next = arr[i + 1];
      if (next == null) return arr[i];
      return arr[i] + (next - arr[i]) * ((mins % 60) / 60);
    };

    // Values that describe a whole hour (precip chance, weather code) come from the containing hour
    const sampleHour = <T,>(arr: T[], dateStr: string, mins: number): T | null => {
      const i = hourIndex.get(hourKey(dateStr, Math.floor(mins / 60)));
      return i === undefined ? null : (arr[i] ?? null);
    };

    weekPlan.value = daily.time.map((dateStr: string, i: number) => {
      const date = new Date(`${dateStr}T00:00:00`);
      const sunriseMin = isoTimeToMinutes(daily.sunrise[i]);
      const sunsetMin = isoTimeToMinutes(daily.sunset[i]);
      const dayWindMph = Math.round(daily.windspeed_10m_max[i]);

      let weather = weatherCodeToType(daily.weathercode[i]);
      if ((weather === 'sunny' || weather === 'cloudy') && dayWindMph >= WINDY_THRESHOLD_MPH) {
        weather = 'windy';
      }

      const chunks = [];
      for (
        let startMin = earliestMin;
        startMin + CHUNK_MINUTES <= latestMin;
        startMin += CHUNK_MINUTES
      ) {
        const endMin = startMin + CHUNK_MINUTES;

        let darkness: Darkness = 'none';
        if (startMin < sunriseMin - TWILIGHT_GRACE_MIN) darkness = 'before-sunrise';
        else if (endMin > sunsetMin + TWILIGHT_GRACE_MIN) darkness = 'after-sunset';

        const temp = Math.round(sampleSmooth(hourly.temperature_2m, dateStr, startMin) ?? 0);
        const feelsLike = Math.round(
          sampleSmooth(hourly.apparent_temperature, dateStr, startMin) ?? temp
        );

        const conditions: Conditions = {
          darkness,
          precip: point(
            sampleHour<number>(hourly.precipitation_probability, dateStr, startMin) ?? 0
          ),
          feels: point(feelsLike),
          temp: point(temp),
          wind: point(Math.round(sampleSmooth(hourly.windspeed_10m, dateStr, startMin) ?? 0)),
          code: sampleHour<number>(hourly.weathercode, dateStr, startMin) ?? 0,
        };

        chunks.push({ startMin, status: rate(conditions).status, conditions });
      }

      return {
        day: date.toLocaleDateString(undefined, { weekday: 'long' }),
        date: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        weather,
        tempHigh: Math.round(daily.temperature_2m_max[i]),
        tempLow: Math.round(daily.temperature_2m_min[i]),
        chunkStarts: chunks.map((c) => c.startMin),
        segments: mergeIntoSegments(chunks),
      };
    });
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Something went wrong fetching the forecast';
  } finally {
    loading.value = false;
  }
};

const segmentRange = (seg: Segment): string =>
  `${minutesToLabel(seg.startMin)} – ${minutesToLabel(seg.endMin)}`;

const segmentStats = (seg: Segment): string => {
  const { temp, precip, wind } = seg.conditions;
  return `${formatRange(temp, '°')} · ${formatRange(precip, '%')} rain · ${formatRange(wind, ' mph')} wind`;
};

const segmentLabel = (seg: Segment): string =>
  `${segmentRange(seg)}: ${statusLabels[seg.status]}. ${seg.reason}. ${segmentStats(seg)}`;

const isSelected = (plan: DayForecast, seg: Segment): boolean =>
  selected.value?.date === plan.date && selected.value?.segment.startMin === seg.startMin;

const selectSegment = (plan: DayForecast, seg: Segment) => {
  selected.value = isSelected(plan, seg) ? null : { day: plan.day, date: plan.date, segment: seg };
};

const applySettings = () => {
  saveSettings();
  showSettings.value = false;
  fetchForecast();
};

const onKeydown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (showSettings.value) showSettings.value = false;
  else selected.value = null;
};

onMounted(() => {
  loadSettings();
  fetchForecast();
  window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="dog-walk-planner">
    <div class="controls">
      <div class="title-block">
        <p v-if="locationLabel" class="location-label">{{ locationLabel }}</p>
      </div>
      <button class="settings-btn" title="Settings" @click="showSettings = !showSettings">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
          ></path>
          <circle cx="12" cy="12" r="3"></circle>
        </svg>
      </button>
    </div>

    <div v-if="showSettings" class="settings-popup">
      <div class="settings-content">
        <div class="settings-header">
          <h3>Settings</h3>
          <button class="close-btn" @click="showSettings = false">×</button>
        </div>
        <div class="settings-body">
          <div class="setting-item">
            <label for="zip">Zip Code</label>
            <div class="setting-control">
              <input
                id="zip"
                v-model="settings.zip"
                type="text"
                inputmode="numeric"
                maxlength="5"
                class="threshold-input"
                style="width: 6rem"
              />
            </div>
            <p class="setting-description">
              Used to look up your local weather and sunrise/sunset times
            </p>
          </div>
          <div class="setting-item">
            <label for="earliest">Earliest Walk Time</label>
            <div class="setting-control">
              <input
                id="earliest"
                v-model="settings.earliestWalk"
                type="time"
                class="threshold-input"
                style="width: 8rem"
              />
            </div>
            <p class="setting-description">
              The timeline starts here, even if the sun's up earlier
            </p>
          </div>
          <div class="setting-item">
            <label for="latest">Latest Walk Time</label>
            <div class="setting-control">
              <input
                id="latest"
                v-model="settings.latestWalk"
                type="time"
                class="threshold-input"
                style="width: 8rem"
              />
            </div>
            <p class="setting-description">The timeline ends here, even if the sun's still up</p>
          </div>
          <button class="save-btn" @click="applySettings">Save &amp; Refresh Forecast</button>
        </div>
      </div>
    </div>

    <div v-if="error" class="error-banner">
      {{ error }}
    </div>

    <div v-if="loading" class="loading-state">Fetching forecast…</div>

    <template v-else-if="weekPlan.length > 0">
      <div class="legend">
        <span class="legend-item">
          <span class="swatch good"></span>
          Definitely
        </span>
        <span class="legend-item">
          <span class="swatch ok"></span>
          Maybe
        </span>
        <span class="legend-item">
          <span class="swatch bad"></span>
          Don't
        </span>
      </div>

      <!-- Lives outside the scrolling timeline so it stays readable at any width -->
      <div class="detail-bar" :class="{ empty: !selected }">
        <template v-if="selected">
          <span class="detail-when">{{ selected.day }}, {{ segmentRange(selected.segment) }}</span>
          <span class="detail-status" :class="selected.segment.status">
            {{ statusLabels[selected.segment.status] }}
          </span>
          <span class="detail-reason">{{ selected.segment.reason }}</span>
          <span class="detail-stats">{{ segmentStats(selected.segment) }}</span>
        </template>
        <span v-else>Tap a block for details</span>
      </div>

      <div class="timeline">
        <div v-for="plan in weekPlan" :key="plan.date" class="day-block">
          <div class="day-header">
            <div class="day-name">
              {{ plan.day }}
              <span class="day-date">{{ plan.date }}</span>
            </div>
            <div class="day-meta">
              <span class="temps">{{ plan.tempLow }}° / {{ plan.tempHigh }}°</span>
              <svg
                v-if="plan.weather === 'sunny'"
                class="weather-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <circle cx="12" cy="12" r="4" />
                <path
                  d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
                />
              </svg>
              <svg
                v-else-if="plan.weather === 'cloudy'"
                class="weather-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M17.5 19H9a5 5 0 1 1 1.68-9.71A6 6 0 0 1 22 12.5 4.5 4.5 0 0 1 17.5 19z" />
              </svg>
              <svg
                v-else-if="plan.weather === 'rainy'"
                class="weather-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M16 13v8M8 13v8M12 15v8M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25" />
              </svg>
              <svg
                v-else-if="plan.weather === 'snowy'"
                class="weather-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M20 17.58A5 5 0 0 0 18 8h-1.26A8 8 0 1 0 4 16.25" />
                <path d="M8 16h.01M8 20h.01M12 18h.01M12 22h.01M16 16h.01M16 20h.01" />
              </svg>
              <svg
                v-else
                class="weather-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M9.59 4.59A2 2 0 1 1 11 8H2M12.59 11.59A2 2 0 1 1 14 15H2M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2"
                />
              </svg>
            </div>
          </div>

          <div class="track" :style="{ '--chunk-count': plan.chunkStarts.length }">
            <button
              v-for="seg in plan.segments"
              :key="seg.startMin"
              type="button"
              class="segment"
              :class="[seg.status, { selected: isSelected(plan, seg) }]"
              :style="{ gridColumn: `span ${seg.span}` }"
              :aria-label="segmentLabel(seg)"
              :aria-pressed="isSelected(plan, seg)"
              @click="selectSegment(plan, seg)"
            ></button>
          </div>

          <div
            class="track tick-row"
            :style="{ '--chunk-count': plan.chunkStarts.length }"
            aria-hidden="true"
          >
            <div v-for="start in plan.chunkStarts" :key="start" class="tick-cell">
              <span v-if="start % 120 === 0" class="tick-label">{{ minutesToTick(start) }}</span>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.dog-walk-planner {
  width: 100%;
  padding: 1.25rem 0;
}

.controls {
  margin-bottom: 1.25rem;
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.title-block {
  flex: 1;
}

.planner-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.location-label {
  margin: 0.125rem 0 0 0;
  font-size: 0.8125rem;
  color: var(--vp-c-text-3);
}

.settings-btn {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
  border: 1px solid var(--vp-c-border);
  padding: 0.5rem;
  border-radius: 0.5rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.25s,
    border-color 0.25s;
}

.settings-btn:hover {
  background-color: var(--vp-c-bg-mute);
  border-color: var(--vp-c-brand-1);
}

.settings-popup {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.settings-content {
  background-color: var(--vp-c-bg);
  border: 1px solid var(--vp-c-border);
  border-radius: 0.75rem;
  width: 90%;
  max-width: 500px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.3);
}

.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--vp-c-border);
}

.settings-header h3 {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--vp-c-text-2);
  padding: 0;
  width: 2rem;
  height: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  transition:
    background-color 0.25s,
    color 0.25s;
}

.close-btn:hover {
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-text-1);
}

.settings-body {
  padding: 1.25rem;
  overflow-y: auto;
  flex: 1;
}

.setting-item {
  margin-bottom: 1.25rem;
}

.setting-item label {
  display: block;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  margin-bottom: 0.5rem;
}

.setting-control {
  display: flex;
  gap: 0.75rem;
  align-items: center;
}

.threshold-input {
  padding: 0.375rem 0.5rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  font-size: 0.875rem;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.threshold-input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--vp-c-brand-1) 25%, transparent);
}

.setting-description {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: var(--vp-c-text-2);
  line-height: 1.4;
}

.save-btn {
  width: 100%;
  background-color: var(--vp-button-brand-bg);
  color: var(--vp-button-brand-text);
  border: 1px solid var(--vp-button-brand-border);
  padding: 0.625rem 1.25rem;
  border-radius: 0.5rem;
  cursor: pointer;
  font-size: 0.875rem;
  font-weight: 500;
  transition:
    background-color 0.25s,
    border-color 0.25s;
}

.save-btn:hover {
  background-color: var(--vp-button-brand-hover-bg);
  border-color: var(--vp-button-brand-hover-border);
}

.error-banner {
  padding: 0.75rem 1rem;
  border: 1px solid var(--vp-c-danger-1);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  color: var(--vp-c-danger-1);
  font-size: 0.875rem;
  margin-bottom: 1rem;
}

.loading-state {
  text-align: center;
  padding: 2.5rem;
  color: var(--vp-c-text-2);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.875rem;
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}

.swatch {
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 0.1875rem;
}

.swatch.good,
.segment.good {
  background-color: var(--vp-c-green-3, #42b883);
}

.swatch.ok,
.segment.ok {
  background-color: var(--vp-c-yellow-3, #e0a300);
}

/* Neutral rather than red — a whole day of "don't go" shouldn't read as alarming */
.swatch.bad,
.segment.bad {
  background-color: var(--vp-c-gray-1, #d5d5db);
  box-shadow: inset 0 0 0 1px var(--vp-c-divider);
}

.detail-bar {
  position: sticky;
  top: calc(var(--vp-nav-height, 4rem) + 0.5rem);
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.25rem 0.75rem;
  margin-bottom: 0.875rem;
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--vp-c-divider);
  border-radius: 0.5rem;
  background-color: var(--vp-c-bg-soft);
  font-size: 0.8125rem;
  color: var(--vp-c-text-2);
}

.detail-bar.empty {
  color: var(--vp-c-text-3);
  font-size: 0.75rem;
}

.detail-when {
  font-family: var(--vp-font-family-mono);
  font-weight: 600;
  color: var(--vp-c-text-1);
}

.detail-status {
  font-weight: 600;
}

.detail-status.good {
  color: var(--vp-c-green-1);
}

.detail-status.ok {
  color: var(--vp-c-yellow-1);
}

.detail-status.bad {
  color: var(--vp-c-text-2);
}

.detail-stats {
  font-family: var(--vp-font-family-mono);
  font-size: 0.75rem;
  color: var(--vp-c-text-3);
}

.day-block {
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.day-block:last-child {
  border-bottom: none;
}

.day-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.125rem 0.75rem;
  margin-bottom: 0.5rem;
}

.track {
  display: grid;
  grid-template-columns: repeat(var(--chunk-count), 1fr);
  gap: 1px;
}

.tick-row {
  margin-top: 0.25rem;
}

.tick-cell {
  position: relative;
  height: 0.875rem;
}

.tick-label {
  position: absolute;
  left: 0;
  top: 0;
  font-size: 0.6875rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-3);
  white-space: nowrap;
}

.segment {
  height: 1.75rem;
  padding: 0;
  border: none;
  border-radius: 0.125rem;
  cursor: pointer;
  appearance: none;
  transition: opacity 0.15s ease;
}

.segment:hover {
  opacity: 0.75;
}

.segment.selected,
.segment:focus-visible {
  outline: 2px solid var(--vp-c-text-1);
  outline-offset: 1px;
}

.day-name {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}

.day-date {
  font-size: 0.75rem;
  font-weight: 400;
  color: var(--vp-c-text-3);
  font-family: var(--vp-font-family-mono);
}

.day-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}

.weather-icon {
  width: 0.9375rem;
  height: 0.9375rem;
  flex-shrink: 0;
  color: var(--vp-c-brand-1);
}

.temps {
  font-size: 0.75rem;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

@media (max-width: 640px) {
  .day-name {
    font-size: 0.875rem;
  }

  /* Bigger tap targets on touch screens */
  .segment {
    height: 2.5rem;
  }
}
</style>
