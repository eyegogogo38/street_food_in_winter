
export interface Scene {
  text: string;        // Specific line of script for this scene (Korean)
  imagePrompt: string; // Visual prompt for this scene (English)
}

export interface ShortsScript {
  title: string;
  scenes: Scene[];
  bgmPrompts: string[];
}

export interface GeneratedAsset {
  id: string;
  type: 'image' | 'audio' | 'script' | 'video';
  content: string; // base64, text or URL
  mimeType: string;
  filename: string;
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  SCRIPT_GENERATING = 'SCRIPT_GENERATING',
  SCRIPT_REVIEW = 'SCRIPT_REVIEW',
  IMAGES_GENERATING = 'IMAGES_GENERATING',
  AUDIO_GENERATING = 'AUDIO_GENERATING',
  VIDEO_GENERATING = 'VIDEO_GENERATING',
  ZIPPING = 'ZIPPING',
  COMPLETED = 'COMPLETED',
  ERROR = 'ERROR'
}
