
/**
 * Decodes base64 PCM data to a Uint8Array
 */
export function decodeBase64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Wraps raw PCM data into a WAV container (standard RIFF header)
 */
export function wrapPcmInWav(pcmData: Uint8Array, sampleRate: number = 24000, numChannels: number = 1, bitDepth: number = 16): Blob {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);

  // RIFF identifier
  view.setUint32(0, 0x52494646, false); // "RIFF"
  // File length
  view.setUint32(4, 36 + pcmData.length, true);
  // RIFF type
  view.setUint32(8, 0x57415645, false); // "WAVE"
  // Format chunk identifier
  view.setUint32(12, 0x666d7420, false); // "fmt "
  // Format chunk length
  view.setUint32(16, 16, true);
  // Sample format (1 is PCM)
  view.setUint16(20, 1, true);
  // Channel count
  view.setUint16(22, numChannels, true);
  // Sample rate
  view.setUint32(24, sampleRate, true);
  // Byte rate (sampleRate * numChannels * bitDepth / 8)
  view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
  // Block align (numChannels * bitDepth / 8)
  view.setUint16(32, numChannels * bitDepth / 8, true);
  // Bits per sample
  view.setUint16(34, bitDepth, true);
  // Data chunk identifier
  view.setUint32(36, 0x64617461, false); // "data"
  // Data chunk length
  view.setUint32(40, pcmData.length, true);

  return new Blob([header, pcmData], { type: 'audio/wav' });
}
