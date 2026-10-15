export const EMOTIONS = ['Happy', 'Excited', 'Angry', 'Tired', 'Lonely'] as const

export type Emotion = (typeof EMOTIONS)[number]
