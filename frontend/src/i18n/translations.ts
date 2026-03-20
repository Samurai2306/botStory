export type Locale = 'ru' | 'en'

export const T = {
  ru: {
    terminalTitle: 'Terminal',
    help: [
      'Команды:',
      'help — справка',
      'cat mission.txt — снова показать описание уровня',
      'add_word <слово> — добавить слово для уровня (до 10)',
      'set_hint <слово> — сохранить слово-подсказку для всех уровней',
      './start_mission — начать миссию',
      'games — открыть мини-игры',
      'run codeIDE — открыть редактор кода (в уровне)',
      'clear — очистить экран',
      'words — показать текущие слова уровня',
      'hint — показать текущее слово-подсказку',
    ],
    unknownCommand: (cmd: string) => `Неизвестная команда: ${cmd}. Введите help.`,
    addedWord: (w: string) => `Добавлено слово: ${w}`,
    wordsLimit: 'Достигнут лимит: 10 слов для уровня.',
    savedHint: (w: string) => `Подсказка сохранена: ${w}`,
    emptyArg: 'Нужно указать слово.',
  },
  en: {
    terminalTitle: 'Terminal',
    help: [
      'Commands:',
      'help — show help',
      'cat mission.txt — show level description again',
      'add_word <word> — add a level word (max 10)',
      'set_hint <word> — set a global hint word for future levels',
      './start_mission — start mission',
      'games — open minigames',
      'run codeIDE — open code editor (in level)',
      'clear — clear screen',
      'words — show current level words',
      'hint — show current hint word',
    ],
    unknownCommand: (cmd: string) => `Unknown command: ${cmd}. Type help.`,
    addedWord: (w: string) => `Added word: ${w}`,
    wordsLimit: 'Limit reached: 10 level words.',
    savedHint: (w: string) => `Hint saved: ${w}`,
    emptyArg: 'Please provide a word.',
  },
} satisfies Record<Locale, any>

