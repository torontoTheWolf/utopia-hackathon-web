// The questions under "In your own words". The server shows Claude each question with its answer when it picks a place,
// so a question's text should say what its 1 and 0 mean.
export const QUESTIONS = ['Question 1', 'Question 2', 'Question 3', 'Question 4', 'Question 5'] as const

export type Answer = 0 | 1

// The answer each dot gives, left to right.
export const ANSWERS: readonly Answer[] = [1, 0]

// Answers travel as one query parameter, like "1,0,,1,0", with nothing between the commas for a question left unanswered.
export function formatAnswers(answers: readonly (Answer | null)[]): string {
  return answers.map((answer) => answer ?? '').join(',')
}

// Null when `text` isn't one answer, or no answer, for each question.
export function parseAnswers(text: string): (Answer | null)[] | null {
  const answers = text.split(',').map((item) => (item === '' ? null : item === '0' ? 0 : item === '1' ? 1 : undefined))
  return answers.length === QUESTIONS.length && !answers.includes(undefined) ? (answers as (Answer | null)[]) : null
}
