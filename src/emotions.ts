export const EMOTIONS = ['Happy', 'Angry', 'Tired', 'Lonely'] as const

export type Emotion = (typeof EMOTIONS)[number]
