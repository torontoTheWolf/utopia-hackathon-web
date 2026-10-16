// The questions under "In your own words". Each has two options, numbered 1 and 2 over the dots. In the question, the
// first mention of each option gets its number, like "Day¹ or night²?". Claude is told the option chosen, in words.
export type Question = { text: string; options: readonly [string, string] }

export const QUESTIONS: readonly Question[] = [
  { text: 'Day or night?', options: ['Day', 'Night'] },
  { text: 'Cats or dogs?', options: ['Cats', 'Dogs'] },
  { text: 'Roses or dandelions?', options: ['Roses', 'Dandelions'] },
  { text: 'Hot or cold?', options: ['Hot', 'Cold'] },
  { text: 'The city or the countryside?', options: ['City', 'Countryside'] },
]

// The number of the option chosen.
export type Answer = 1 | 2

// The answer each dot gives, left to right.
export const ANSWERS: readonly Answer[] = [1, 2]

// Answers travel as one query parameter, like "1,2,,1,2", with nothing between the commas for a question left unanswered.
export function formatAnswers(answers: readonly (Answer | null)[]): string {
  return answers.map((answer) => answer ?? '').join(',')
}

// Null when `text` isn't one answer, or no answer, for each question.
export function parseAnswers(text: string): (Answer | null)[] | null {
  const answers = text.split(',').map((item) => (item === '' ? null : item === '1' ? 1 : item === '2' ? 2 : undefined))
  return answers.length === QUESTIONS.length && !answers.includes(undefined) ? (answers as (Answer | null)[]) : null
}
