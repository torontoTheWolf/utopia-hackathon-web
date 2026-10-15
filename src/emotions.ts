export const EMOTIONS = ['Happy', 'Angry', 'Bored', 'Hungry', 'Sad'] as const

export type Emotion = (typeof EMOTIONS)[number]
