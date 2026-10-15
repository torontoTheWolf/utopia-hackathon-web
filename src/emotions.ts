export const EMOTIONS = ['Happy', 'Angry', 'Tired', 'Hungry'] as const

export type Emotion = (typeof EMOTIONS)[number]
