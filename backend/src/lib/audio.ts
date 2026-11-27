export const MAX_TRACK_BYTES = 50 * 1024 * 1024

export const ACCEPTED_CLIENT_AUDIO_TYPES = [
  'audio/mpeg',
  'audio/wav',
  'audio/x-wav',
  'audio/ogg',
  'audio/flac',
  'audio/mp4',
  'audio/aac',
  'audio/webm',
  'audio/x-flac',
  'audio/x-m4a',
] as const

export const DETECTED_AUDIO_TYPES: Record<string, string> = {
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  mp4: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
}
