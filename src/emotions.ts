export const EMOTIONS = ['Happy', 'Calm', 'Excited', 'Sad', 'Anxious', 'Angry', 'Tired', 'Lonely'] as const

export type Emotion = (typeof EMOTIONS)[number]
