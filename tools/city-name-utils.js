const MEDIEVAL_CITY_PREFIXES = [
  "Alder", "Ash", "Barrow", "Bell", "Black", "Briar", "Brindle", "Brook", "Cedar", "Crow",
  "Dun", "Elder", "Ember", "Fair", "Fen", "Flint", "Green", "Grey", "Hart", "High",
  "Iron", "Kings", "Low", "Oak", "Raven", "Red", "Silver", "Stone", "Thorn", "Vale",
  "White", "Wolf", "Wyvern",
];

const MEDIEVAL_REGION_PREFIXES = {
  center: ["Crown", "Lion", "Regal", "Scepter", "Royal", "Queen", "King", "High", "Gold", "Star"],
  north: ["Frost", "Snow", "Pine", "Winter", "Storm", "Moon", "Peak", "Cold", "Cloud", "Hawk"],
  south: ["Sun", "Salt", "Reed", "Willow", "Rose", "Marsh", "Tide", "Warm", "Bloom", "Pearl"],
  west: ["Oak", "Thorn", "Fox", "Ash", "Briar", "Crow", "Wild", "Wood", "Moss", "Fern"],
  east: ["Dawn", "Gold", "Bright", "Falcon", "Rose", "Wind", "Star", "Pearl", "Blue", "Ivory"],
};

const MEDIEVAL_CITY_SUFFIXES = [
  "bury", "ford", "wick", "stead", "mere", "brook", "hollow", "watch", "gate", "fall",
  "bridge", "market", "vale", "den", "field", "worth", "cross", "moor", "reach", "cliffe",
  "hurst", "wall", "ham", "port",
];

const MEDIEVAL_CITY_TITLES = [
  "Abbey", "Cross", "Gate", "March", "Market", "Mead", "Moor", "Rest", "Rise", "Watch",
];

function hashCityName(value = "") {
  let hash = 2166136261;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getCityNameIndex(cityId = "", fallbackIndex = 0) {
  const match = String(cityId || "").match(/_(\d+)$/);
  if (match) return Math.max(0, Math.floor(Number(match[1]) || 1) - 1);
  if (Number.isFinite(Number(fallbackIndex))) {
    return Math.max(0, Math.floor(Number(fallbackIndex) || 0));
  }
  return hashCityName(cityId || "city") % 997;
}

function generateMedievalCityName(regionId = "", index = 0, cityId = "") {
  const normalizedRegionId = String(regionId || "center").trim().toLowerCase() || "center";
  const cityIndex = getCityNameIndex(cityId, index);
  const prefixes = [...new Set([
    ...MEDIEVAL_CITY_PREFIXES,
    ...(MEDIEVAL_REGION_PREFIXES[normalizedRegionId] || []),
  ])];
  const comboCount = prefixes.length * MEDIEVAL_CITY_SUFFIXES.length;
  const offset = hashCityName(`medieval-city:${normalizedRegionId}`) % comboCount;
  const comboIndex = (cityIndex * 487 + offset) % comboCount;
  const prefix = prefixes[comboIndex % prefixes.length];
  const suffix = MEDIEVAL_CITY_SUFFIXES[
    Math.floor(comboIndex / prefixes.length) % MEDIEVAL_CITY_SUFFIXES.length
  ];
  const title = MEDIEVAL_CITY_TITLES[
    (cityIndex * 191 + offset) % MEDIEVAL_CITY_TITLES.length
  ];
  return cityIndex % 5 === 0 ? `${prefix}${suffix} ${title}` : `${prefix}${suffix}`;
}

function isGenericCityName(value = "", cityId = "") {
  const name = String(value || "").trim();
  if (!name) return true;
  if (/\d/.test(name)) return true;
  if (/^city(?:\s+|[-_])\d+$/i.test(name)) return true;
  return Boolean(cityId) && name.toLowerCase() === String(cityId).trim().toLowerCase();
}

function getCanonicalLayoutCityName(city = {}, regionId = "", index = 0) {
  const configuredName = String(city.name || "").trim();
  if (!isGenericCityName(configuredName, city.id)) return configuredName.slice(0, 80);
  return generateMedievalCityName(regionId || city.regionId, index, city.id).slice(0, 80);
}

module.exports = {
  MEDIEVAL_CITY_PREFIXES,
  MEDIEVAL_REGION_PREFIXES,
  MEDIEVAL_CITY_SUFFIXES,
  MEDIEVAL_CITY_TITLES,
  generateMedievalCityName,
  getCanonicalLayoutCityName,
  getCityNameIndex,
  hashCityName,
  isGenericCityName,
};
