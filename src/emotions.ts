export const EMOTIONS = ['Happy', 'Calm', 'Excited', 'Sad', 'Anxious', 'Angry', 'Tired', 'Lonely'] as const

export type Emotion = (typeof EMOTIONS)[number]

export function parseEmotion(value: string): Emotion | null {
  return EMOTIONS.find((emotion) => emotion === value) ?? null
}
