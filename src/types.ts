export interface KanjiExample {
  sentence: string;
  reading: string;
  translation: string;
}

export interface Kanji {
  id: string;
  level: string;
  kanji: string;
  onyomi: string[];
  kunyomi: string[];
  meanings: string[];
  example: KanjiExample;
}

export interface QuizState {
  pool: Kanji[];
  currentIndex: number;
  revealed: boolean;
  stats: { seen: number; known: number; unknown: number };
  history: Array<{ id: string; level: string; result: string }>;
  filter: { levels: string[] };
}

export interface SrsState {
  interval: number;
  repetitions: number;
  ease: number;
  due: number;
  lastReviewed: number | null;
}

export type TestQuestionType =
  | 'kanji-to-meaning'
  | 'meaning-to-kanji'
  | 'kanji-to-reading'
  | 'reading-to-kanji';

export interface TestQuestion {
  type: TestQuestionType;
  kanjiId: string;
  prompt: string;
  choices: string[];
  correctIndex: number;
}

export interface TestAnswer {
  questionIndex: number;
  chosenIndex: number;
  correct: boolean;
}

export type TestPhase = 'intro' | 'question' | 'results';

export interface TestState {
  phase: TestPhase;
  questions: TestQuestion[];
  answers: TestAnswer[];
  currentQuestionIndex: number;
  testedKanjiIds: string[];
}
