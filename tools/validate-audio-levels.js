const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.resolve(__dirname, "..");
const audioRoot = path.join(projectRoot, "audio");
const manifestPath = path.join(audioRoot, "manifest.json");

const DEFAULT_EFFECTS_VOLUME = 0.8;
const RMS_WINDOW_SECONDS = 0.1;
const MIN_DEFAULT_MAX_RMS_DBFS = -23;
const MAX_DEFAULT_MAX_RMS_DBFS = -10;
const MAX_INDIVIDUAL_PEAK_DBFS = -1;
const MAX_SEQUENCED_MIX_PEAK_DBFS = -1;

const MAX_RUNTIME_SCALE_BY_ID = Object.freeze({
  button_click: 1.2,
  level_up: 1.35,
});

const COMBAT_SEQUENCE_OFFSETS = Object.freeze({
  arrival: 0,
  impact: 0.15,
  outcome: 0.45,
});

const failures = [];

function check(condition, message) {
  if (!condition) failures.push(message);
}

function toDbfs(amplitude) {
  return amplitude > 0 ? 20 * Math.log10(amplitude) : -Infinity;
}

function formatDbfs(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)} dBFS` : "-Infinity dBFS";
}

function resolveAudioFile(relativePath, expectedExtension, label) {
  check(typeof relativePath === "string" && relativePath.length > 0, `${label} is missing its ${expectedExtension} path`);
  if (typeof relativePath !== "string" || !relativePath) return null;

  const normalizedExtension = path.extname(relativePath).toLowerCase();
  check(normalizedExtension === `.${expectedExtension}`, `${label} ${expectedExtension} path has the wrong extension: ${relativePath}`);

  const absolutePath = path.resolve(audioRoot, relativePath);
  const audioRootPrefix = `${audioRoot}${path.sep}`;
  check(absolutePath.startsWith(audioRootPrefix), `${label} ${expectedExtension} path escapes audio/: ${relativePath}`);
  if (!absolutePath.startsWith(audioRootPrefix)) return null;

  check(fs.existsSync(absolutePath), `${label} is missing audio/${relativePath}`);
  return fs.existsSync(absolutePath) ? absolutePath : null;
}

function findMpegFrame(buffer) {
  let offset = 0;
  if (buffer.length >= 10 && buffer.toString("ascii", 0, 3) === "ID3") {
    const sizeBytes = [buffer[6], buffer[7], buffer[8], buffer[9]];
    if (sizeBytes.some(byte => (byte & 0x80) !== 0)) return -1;
    const tagSize = sizeBytes.reduce((size, byte) => (size << 7) | byte, 0);
    offset = 10 + tagSize + ((buffer[5] & 0x10) !== 0 ? 10 : 0);
  }

  for (let index = offset; index + 3 < buffer.length; index += 1) {
    const first = buffer[index];
    const second = buffer[index + 1];
    const third = buffer[index + 2];
    if (first !== 0xff || (second & 0xe0) !== 0xe0) continue;
    const version = (second >> 3) & 0x03;
    const layer = (second >> 1) & 0x03;
    const bitrateIndex = (third >> 4) & 0x0f;
    const sampleRateIndex = (third >> 2) & 0x03;
    if (version !== 0x01 && layer !== 0 && bitrateIndex > 0 && bitrateIndex < 0x0f && sampleRateIndex !== 0x03) {
      return index;
    }
  }
  return -1;
}

function validateMp3(filePath, label) {
  const buffer = fs.readFileSync(filePath);
  check(buffer.length > 4, `${label} MP3 is empty`);
  check(findMpegFrame(buffer) >= 0, `${label} MP3 has no valid MPEG audio frame`);
}

function validateOgg(filePath, label) {
  const buffer = fs.readFileSync(filePath);
  check(buffer.length >= 27, `${label} OGG is too small to contain an Ogg page`);
  check(buffer.toString("ascii", 0, 4) === "OggS", `${label} OGG is missing its OggS signature`);
  check(buffer[4] === 0, `${label} OGG uses an unsupported stream structure version`);
}

function parsePcm16Wav(filePath, label) {
  const buffer = fs.readFileSync(filePath);
  if (
    buffer.length < 44
    || buffer.toString("ascii", 0, 4) !== "RIFF"
    || buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(`${label} WAV is not a RIFF/WAVE file`);
  }

  const declaredRiffBytes = buffer.readUInt32LE(4) + 8;
  if (declaredRiffBytes > buffer.length) throw new Error(`${label} WAV has a truncated RIFF payload`);

  let format = null;
  let pcmOffset = -1;
  let pcmBytes = 0;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkBytes = buffer.readUInt32LE(offset + 4);
    const chunkOffset = offset + 8;
    const chunkEnd = chunkOffset + chunkBytes;
    if (chunkEnd > buffer.length) throw new Error(`${label} WAV has a truncated ${chunkId} chunk`);

    if (chunkId === "fmt ") {
      if (chunkBytes < 16) throw new Error(`${label} WAV has an invalid fmt chunk`);
      format = {
        audioFormat: buffer.readUInt16LE(chunkOffset),
        channelCount: buffer.readUInt16LE(chunkOffset + 2),
        sampleRate: buffer.readUInt32LE(chunkOffset + 4),
        byteRate: buffer.readUInt32LE(chunkOffset + 8),
        blockAlign: buffer.readUInt16LE(chunkOffset + 12),
        bitsPerSample: buffer.readUInt16LE(chunkOffset + 14),
      };
    } else if (chunkId === "data" && pcmOffset < 0) {
      pcmOffset = chunkOffset;
      pcmBytes = chunkBytes;
    }
    offset = chunkEnd + (chunkBytes & 1);
  }

  if (!format) throw new Error(`${label} WAV is missing its fmt chunk`);
  if (pcmOffset < 0) throw new Error(`${label} WAV is missing its data chunk`);
  if (format.audioFormat !== 1) throw new Error(`${label} WAV must use integer PCM format 1`);
  if (format.bitsPerSample !== 16) throw new Error(`${label} WAV must use 16-bit PCM`);
  if (format.channelCount < 1 || format.channelCount > 2) throw new Error(`${label} WAV must be mono or stereo`);
  if (format.sampleRate <= 0) throw new Error(`${label} WAV has an invalid sample rate`);
  if (format.blockAlign !== format.channelCount * 2) throw new Error(`${label} WAV has an invalid block alignment`);
  if (format.byteRate !== format.sampleRate * format.blockAlign) throw new Error(`${label} WAV has an invalid byte rate`);
  if (pcmBytes === 0 || pcmBytes % format.blockAlign !== 0) throw new Error(`${label} WAV has an invalid PCM payload length`);

  const sampleCount = pcmBytes / 2;
  const samples = new Float32Array(sampleCount);
  let peak = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const sample = buffer.readInt16LE(pcmOffset + index * 2) / 32768;
    samples[index] = sample;
    peak = Math.max(peak, Math.abs(sample));
  }

  const frameCount = sampleCount / format.channelCount;
  const windowFrames = Math.min(frameCount, Math.max(1, Math.round(format.sampleRate * RMS_WINDOW_SECONDS)));
  const windowSamples = windowFrames * format.channelCount;
  let windowEnergy = 0;
  for (let index = 0; index < windowSamples; index += 1) windowEnergy += samples[index] ** 2;
  let maxWindowEnergy = windowEnergy;
  for (let frame = windowFrames; frame < frameCount; frame += 1) {
    const incomingOffset = frame * format.channelCount;
    const outgoingOffset = (frame - windowFrames) * format.channelCount;
    for (let channel = 0; channel < format.channelCount; channel += 1) {
      windowEnergy += samples[incomingOffset + channel] ** 2;
      windowEnergy -= samples[outgoingOffset + channel] ** 2;
    }
    maxWindowEnergy = Math.max(maxWindowEnergy, windowEnergy);
  }

  return {
    channelCount: format.channelCount,
    frameCount,
    maxWindowRms: Math.sqrt(maxWindowEnergy / windowSamples),
    peak,
    sampleRate: format.sampleRate,
    samples,
  };
}

function getCodecPaths(asset) {
  const wavPath = asset.wav;
  const mp3Path = asset.mp3 || (typeof wavPath === "string" ? wavPath.replace(/\.wav$/i, ".mp3") : "");
  return {
    mp3: mp3Path,
    ogg: asset.ogg,
    wav: wavPath,
  };
}

function getSequencedMixPeak(sequence, analyzedEffects) {
  const entries = sequence.entries.map(entry => {
    const analyzed = analyzedEffects.get(entry.id);
    if (!analyzed) throw new Error(`${sequence.label} references missing effect ${entry.id}`);
    return { ...entry, ...analyzed };
  });
  const sampleRate = entries[0].wav.sampleRate;
  const channelCount = entries[0].wav.channelCount;
  for (const entry of entries) {
    if (entry.wav.sampleRate !== sampleRate || entry.wav.channelCount !== channelCount) {
      throw new Error(`${sequence.label} contains incompatible WAV formats`);
    }
  }

  const positioned = entries.map(entry => ({
    ...entry,
    offsetFrames: Math.round(entry.offsetSeconds * sampleRate),
  }));
  const mixedFrameCount = Math.max(...positioned.map(entry => entry.offsetFrames + entry.wav.frameCount));
  let peak = 0;
  for (let frame = 0; frame < mixedFrameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      let mixedSample = 0;
      for (const entry of positioned) {
        const sourceFrame = frame - entry.offsetFrames;
        if (sourceFrame < 0 || sourceFrame >= entry.wav.frameCount) continue;
        mixedSample += entry.wav.samples[sourceFrame * channelCount + channel]
          * entry.asset.recommended_volume;
      }
      peak = Math.max(peak, Math.abs(mixedSample));
    }
  }
  return peak;
}

function createCombatSequences() {
  const sequences = [];
  for (const clashId of ["sword_clash_01", "sword_clash_02", "sword_clash_03"]) {
    for (const outcomeId of ["city_captured", "battle_defeat"]) {
      sequences.push({
        label: `${clashId} with ${outcomeId}`,
        entries: [
          { id: "army_arrival", offsetSeconds: COMBAT_SEQUENCE_OFFSETS.arrival },
          { id: clashId, offsetSeconds: COMBAT_SEQUENCE_OFFSETS.impact },
          { id: outcomeId, offsetSeconds: COMBAT_SEQUENCE_OFFSETS.outcome },
        ],
      });
    }
  }
  for (const outcomeId of ["stronghold_captured", "battle_defeat"]) {
    sequences.push({
      label: `siege_impact with ${outcomeId}`,
      entries: [
        { id: "army_arrival", offsetSeconds: COMBAT_SEQUENCE_OFFSETS.arrival },
        { id: "siege_impact", offsetSeconds: COMBAT_SEQUENCE_OFFSETS.impact },
        { id: outcomeId, offsetSeconds: COMBAT_SEQUENCE_OFFSETS.outcome },
      ],
    });
  }
  return sequences;
}

function createRewardSequences() {
  return ["gold_pickup", "troop_reward", "relic_reward", "deed_camp_complete"].map(id => ({
    label: `timer_tick_complete with ${id}`,
    entries: [
      { id: "timer_tick_complete", offsetSeconds: 0 },
      { id, offsetSeconds: 0.9 },
    ],
  }));
}

function validateRuntimeScales(effectIds) {
  const runtimeSource = ["audio-manager.js", "instant-economy-actions.js", "game.js"]
    .map(file => fs.readFileSync(path.join(projectRoot, file), "utf8"))
    .join("\n");
  const observedScales = new Map();
  const scaledCuePattern = /(?:playGameSound|playGameSoundAfter|playEffect)\s*\(\s*["'`]([a-z0-9]+(?:_[a-z0-9]+)*)["'`]\s*,\s*\{([^}]*)\}/g;
  let call;
  while ((call = scaledCuePattern.exec(runtimeSource))) {
    const scaleMatch = /\bvolumeScale\s*:\s*(\d+(?:\.\d+)?)/.exec(call[2]);
    if (!scaleMatch) continue;
    const id = call[1];
    const scale = Number(scaleMatch[1]);
    check(effectIds.has(id), `runtime volume scale references unknown effect ${id}`);
    observedScales.set(id, Math.max(observedScales.get(id) || 1, scale));
  }

  for (const [id, scale] of observedScales) {
    check(
      MAX_RUNTIME_SCALE_BY_ID[id] === scale,
      `${id} runtime volume scale ${scale} is not reflected in MAX_RUNTIME_SCALE_BY_ID`
    );
  }
  for (const [id, scale] of Object.entries(MAX_RUNTIME_SCALE_BY_ID)) {
    check(effectIds.has(id), `MAX_RUNTIME_SCALE_BY_ID references unknown effect ${id}`);
    check(
      observedScales.get(id) === scale,
      `${id} declared maximum runtime scale ${scale} is not exercised by a literal runtime cue`
    );
  }
}

function run() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const effects = Array.isArray(manifest.assets)
    ? manifest.assets.filter(asset => asset?.category !== "music")
    : [];
  check(effects.length > 0, "audio manifest must contain non-music effects");

  const manifestEffectIds = new Set(effects.map(asset => String(asset?.id || "")));
  validateRuntimeScales(manifestEffectIds);

  const analyzedEffects = new Map();
  const effectIds = new Set();
  const outputRows = [];
  for (const asset of effects) {
    const label = String(asset?.id || "unnamed effect");
    check(asset?.id && typeof asset.id === "string", `${label} has no valid id`);
    check(!effectIds.has(asset.id), `audio manifest contains duplicate effect id ${asset.id}`);
    effectIds.add(asset.id);
    check(
      Number.isFinite(asset.recommended_volume)
        && asset.recommended_volume > 0
        && asset.recommended_volume <= 1,
      `${label} has invalid recommended_volume ${asset.recommended_volume}`,
    );

    const codecPaths = getCodecPaths(asset);
    const mp3File = resolveAudioFile(codecPaths.mp3, "mp3", label);
    const oggFile = resolveAudioFile(codecPaths.ogg, "ogg", label);
    const wavFile = resolveAudioFile(codecPaths.wav, "wav", label);
    if (mp3File) validateMp3(mp3File, label);
    if (oggFile) validateOgg(oggFile, label);
    if (!wavFile) continue;

    let wav;
    try {
      wav = parsePcm16Wav(wavFile, label);
    } catch (error) {
      failures.push(error.message);
      continue;
    }
    if (Number.isFinite(manifest.sample_rate_hz)) {
      check(wav.sampleRate === manifest.sample_rate_hz, `${label} WAV sample rate is ${wav.sampleRate}, expected ${manifest.sample_rate_hz}`);
    }
    check(wav.peak > 0, `${label} WAV is silent`);

    const recommendedVolume = Number(asset.recommended_volume);
    const defaultMaxRmsDbfs = toDbfs(wav.maxWindowRms * recommendedVolume * DEFAULT_EFFECTS_VOLUME);
    check(
      defaultMaxRmsDbfs >= MIN_DEFAULT_MAX_RMS_DBFS,
      `${label} default max-${RMS_WINDOW_SECONDS * 1000}ms RMS ${formatDbfs(defaultMaxRmsDbfs)} is below ${MIN_DEFAULT_MAX_RMS_DBFS} dBFS`,
    );
    check(
      defaultMaxRmsDbfs <= MAX_DEFAULT_MAX_RMS_DBFS,
      `${label} default max-${RMS_WINDOW_SECONDS * 1000}ms RMS ${formatDbfs(defaultMaxRmsDbfs)} exceeds ${MAX_DEFAULT_MAX_RMS_DBFS} dBFS`,
    );

    const maxRuntimeScale = MAX_RUNTIME_SCALE_BY_ID[asset.id] || 1;
    const maxRuntimePeakDbfs = toDbfs(wav.peak * recommendedVolume * maxRuntimeScale);
    check(
      maxRuntimePeakDbfs <= MAX_INDIVIDUAL_PEAK_DBFS,
      `${label} maximum runtime peak ${formatDbfs(maxRuntimePeakDbfs)} exceeds ${MAX_INDIVIDUAL_PEAK_DBFS} dBFS`,
    );

    analyzedEffects.set(asset.id, { asset, wav });
    outputRows.push({ defaultMaxRmsDbfs, id: asset.id, maxRuntimePeakDbfs });
  }

  let worstMix = { label: "none", peakDbfs: -Infinity };
  for (const sequence of [...createCombatSequences(), ...createRewardSequences()]) {
    try {
      const peakDbfs = toDbfs(getSequencedMixPeak(sequence, analyzedEffects));
      if (peakDbfs > worstMix.peakDbfs) worstMix = { label: sequence.label, peakDbfs };
      check(
        peakDbfs <= MAX_SEQUENCED_MIX_PEAK_DBFS,
        `${sequence.label} sequenced mix peak ${formatDbfs(peakDbfs)} exceeds ${MAX_SEQUENCED_MIX_PEAK_DBFS} dBFS`,
      );
    } catch (error) {
      failures.push(error.message);
    }
  }

  if (failures.length) {
    console.error(`Audio level validation failed (${failures.length} issue${failures.length === 1 ? "" : "s"}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  const quietest = outputRows.reduce((lowest, row) => (
    row.defaultMaxRmsDbfs < lowest.defaultMaxRmsDbfs ? row : lowest
  ));
  const loudest = outputRows.reduce((highest, row) => (
    row.defaultMaxRmsDbfs > highest.defaultMaxRmsDbfs ? row : highest
  ));
  const hottest = outputRows.reduce((highest, row) => (
    row.maxRuntimePeakDbfs > highest.maxRuntimePeakDbfs ? row : highest
  ));
  console.log(`Audio level validation passed for ${outputRows.length} effects and ${outputRows.length * 3} codec files.`);
  console.log(`- Default max-${RMS_WINDOW_SECONDS * 1000}ms RMS: ${quietest.id} ${formatDbfs(quietest.defaultMaxRmsDbfs)} to ${loudest.id} ${formatDbfs(loudest.defaultMaxRmsDbfs)}`);
  console.log(`- Hottest individual runtime peak: ${hottest.id} ${formatDbfs(hottest.maxRuntimePeakDbfs)}`);
  console.log(`- Hottest sequenced action mix: ${worstMix.label} ${formatDbfs(worstMix.peakDbfs)}`);
}

run();
