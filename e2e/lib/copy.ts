/**
 * Russian UI copy, mirrored from miniapp/src/copy.ts.
 *
 * The Mini App's source of truth for user-facing strings is miniapp/src/copy.ts.
 * We duplicate the exact strings here (rather than importing across the workspace)
 * so the e2e suite stays self-contained. If a test starts failing on a string
 * mismatch, update BOTH this file and miniapp/src/copy.ts to the docs/copy/*.md
 * canonical text.
 */
export const COPY = {
  app: {
    demoBanner: "demo-режим: показаны примеры данных",
  },
  nav: {
    wishlist: "Вишлист",
    bucket: "Мечты",
    countdowns: "Отсчёты",
    mood: "Настроение",
    qotd: "Вопрос дня",
    gifts: "Подарки",
  },
  common: {
    add: "Добавить",
    cancel: "Отмена",
    save: "Сохранить",
    delete: "Удалить",
    loading: "Загружается…",
    error: "Что-то пошло не так. Попробуйте ещё раз.",
  },
  wishlist: {
    heading: "Ваш wishlist",
    empty:
      "Пока пусто. Перешлите мне любой пост — из канала, из чата, из группы — и он станет первой хотелкой в общем списке.",
    addPrompt: "Что хотим сделать вместе? Напишите название, адрес или дату.",
    titlePlaceholder: "Например: пицца на Маросейке",
    addressPlaceholder: "Адрес (необязательно)",
    limitHit:
      "Ой, в бесплатной версии максимум 10 хотелок, и список уже полон 😅 Что решим: оформить Pro и добавить без лимита, или убрать что-то из старого?",
    upgradePro: "Оформить Pro",
    deleteOld: "Убрать старое",
    countLine: (n: number, max: number) => `${n} из ${max} в бесплатной версии`,
    doneLabel: "сделано", // status label for a done item
  },
  qotd: {
    heading: "Вопрос дня",
    // The locked-state copy is a full sentence; the mock partner name is "Партнёр".
    revealLocked: "Сначала ответь сам — тогда увидишь, что ответил(а) Партнёр",
    answerButton: "Ответить",
    answerPrompt: "Напиши свой ответ (до 280 символов, эмодзи можно):",
    answerPlaceholder: "Ваш ответ…",
    myAnswerLabel: "🧑 Твой ответ",
    partnerPrefix: "💛",
  },
  mood: {
    heading: "Настроение",
    prompt: "Как ты сейчас?",
    youLabel: "Ты",
    partnerLabel: "Партнёр",
    notSet: "настроение не задано",
    values: ["сияю", "хорошо", "ровно", "так себе", "паршиво"] as const,
  },
  gifts: {
    heading: "Подарки",
    sendPromptContains: "Хочешь подарить",
    customButton: "✍️ Свой жест",
    acceptButton: "Принять",
    declineButton: "Вежливо отказаться",
    redeemButton: "Отметить выполненным",
    goodDeedsHeading: "💛 Добрые дела",
  },
} as const;

/** Free-tier caps mirrored from miniapp/src/types.ts DEFAULT_LIMITS. */
export const LIMITS = { wishlist: 10, countdown: 10, bucket: 5 } as const;
