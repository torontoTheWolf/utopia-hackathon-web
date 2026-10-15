export const EMOTIONS = ['Happy', 'Angry', 'Tired', 'Hungry', 'Sad'] as const

export type Emotion = (typeof EMOTIONS)[number]
