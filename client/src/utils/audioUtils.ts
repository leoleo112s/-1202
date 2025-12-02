/**
 * Downsample audio buffer from srcRate to dstRate (e.g., 48000 -> 16000)
 */
export const downsampleBuffer = (buffer: Float32Array, srcRate: number, dstRate: number): Float32Array => {
  if (dstRate === srcRate) {
    return buffer;
  }
  const sampleRateRatio = srcRate / dstRate;
  const newLength = Math.round(buffer.length / sampleRateRatio);
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.round((offsetResult + 1) * sampleRateRatio);
    let accum = 0, count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer && i < buffer.length; i++) {
      accum += buffer[i];
      count++;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult++;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
};

/**
 * Convert Float32 (-1.0 to 1.0) to Int16 PCM
 */
export const floatTo16BitPCM = (input: Float32Array): Int16Array => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    // Convert to 16-bit integer
    output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return output;
};

/**
 * Create a WAV file header
 */
export const writeWavHeader = (sampleRate: number, numChannels: number, dataLength: number): ArrayBuffer => {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  // RIFF identifier
  writeString(view, 0, 'RIFF');
  // file length
  view.setUint32(4, 36 + dataLength, true);
  // RIFF type
  writeString(view, 8, 'WAVE');
  // format chunk identifier
  writeString(view, 12, 'fmt ');
  // format chunk length
  view.setUint32(16, 16, true);
  // sample format (raw)
  view.setUint16(20, 1, true);
  // channel count
  view.setUint16(22, numChannels, true);
  // sample rate
  view.setUint32(24, sampleRate, true);
  // byte rate (sample rate * block align)
  view.setUint32(28, sampleRate * numChannels * 2, true);
  // block align (channel count * bytes per sample)
  view.setUint16(32, numChannels * 2, true);
  // bits per sample
  view.setUint16(34, 16, true);
  // data chunk identifier
  writeString(view, 36, 'data');
  // data chunk length
  view.setUint32(40, dataLength, true);

  return buffer;
};

const writeString = (view: DataView, offset: number, string: string) => {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
};

/**
 * Encode Float32 AudioBuffer to WAV Blob
 */
export const encodeWAV = (samples: Float32Array, sampleRate: number): Blob => {
  const pcmData = floatTo16BitPCM(samples);
  const header = writeWavHeader(sampleRate, 1, pcmData.byteLength);
  // Combine header and PCM data
  return new Blob([header, pcmData], { type: 'audio/wav' });
};

/**
 * Convert Blob to Base64 string (without the data prefix)
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};