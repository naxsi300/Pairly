/**
 * Russian UI copy. Single source of truth inside the Mini App — mirrors the
 * exact strings from docs/copy/*.md. Bot-side copy lives in the backend.
 *
 * Keep this file in sync with docs/copy/ when text changes.
 */

export const COPY = {
  app: {
    title: "Pairly",
    subtitle: "Общий уголок для вас двоих",
  },
  nav: {
    home: "Главная",
    wishlist: "Вишлист",
    bucket: "Мечты",
    countdowns: "Отсчёты",
    mood: "Настроение",
    qotd: "Вопрос дня",
    gifts: "Подарки",
    wheel: "Колесо",
  },
  home: {
    greeting: (days: number) =>
      days > 0 ? `Вместе ${days} ${days === 1 ? "день" : "дн."} 🌱` : "Ваш уголок 👋",
    heading: "Ваш уголок",
    wheelCta: "🎡 Крутить свидание",
    wheelSub: "Не знаете, чем заняться?",
    cardMoodTitle: "Как вы оба",
    cardNextOccasionTitle: "Ближайший повод",
    cardDreamsTitle: "Мечты",
    dreamsMeta: (open: number, done: number) => `${open} мечтаем · ${done} сбылось →`,
    dreamsEmpty: "Добавьте первую мечту →",
    cardGiftsTitle: "Подарки",
    giftsWaitingMeta: "ждёт вас — примите →",
    giftsMeta: (active: number, deeds: number) => `${active} в пути · ${deeds} добрых дел →`,
    giftsEmpty: "Подарите доброе дело →",
    cardNotesTitle: "Записки",
    notesMetaNew: (unread: number, days: number) =>
      `${unread} новых · последняя ${days === 0 ? "сегодня" : `${days} дн. назад`} →`,
    notesMeta: (days: number) => `последняя ${days === 0 ? "сегодня" : `${days} дн. назад`} →`,
    notesEmpty: "Напишите тёплые слова →",
    cardQotdTitle: "Вопрос дня",
    qotdBothAnswered: "оба ответили — сравните →",
    qotdWaitingPartner: "партнёр ещё думает…",
    qotdYouWaiting: "ваш ход — ответьте →",
    qotdHint: "ответьте, чтобы открыть ответ партнёра",
    cardRitualsTitle: "Ритуалы недели",
    challengeTitle: "Челлендж недели",
    challengeAccept: "Принять челлендж",
    challengeMarkStep: "Отметить шаг",
    challengeDone: "челлендж пройден 🎉",
    gratitudeTitle: "За что ты благодарен сегодня?",
    gratitudeSub: "1 минута — и партнёр улыбнётся",
    gratitudePlaceholder: "За что ты благодарен сегодня?",
    gratitudeSaved: "спасибо сохранено 🙏",
    ritualsSub: "маленькие поводы быть вместе — отметьте, что успели",
    ritualsDone: "на этой неделе: {n}",
    rituals: [
      { id: "date-night", emoji: "🍷", label: "Свидание вечером" },
      { id: "no-phones", emoji: "📵", label: "Час без телефонов вместе" },
      { id: "cook", emoji: "🍳", label: "Готовим ужин вдвоём" },
      { id: "walk", emoji: "🚶", label: "Прогулка без спешки" },
      { id: "grateful", emoji: "🙏", label: "Сказали спасибо за день" },
    ],
    noOccasion: "Пока нет отсчётов",
    more: "Ещё",
    moreBucket: "🌌 Мечты",
    moreCountdowns: "📅 Отсчёты",
    moreGifts: "🎁 Подарки",
    moreQotd: "💭 Вопрос дня",
    moreNotes: "💌 Записки",
    welcomeTitle: "Ваш уголок 👋",
    welcomeSub: "Пара тапов — и здесь станет уютно",
    welcomeGift: "🎁 Отправить первый жест",
    welcomeForward: "🗒 Переслать пост боту",
    welcomeNote: "💌 Написать записку",
    pairNotLinkedTitle: "Это ваш уголок, но пока только ваш",
    pairNotLinkedSub: "Пригласите партнёра: /pair в боте",
    pairNotLinkedCta: "Открыть бота",
    recapTitle: "Ваш месяц вместе",
    // Honest "short, warm" recap. Brief allows the simple "N вопросов / N добрых дел /
    // N сбылось" form when uncertain about gender; we pick this on purpose so the
    // string stays stable across locales and avoids Polish-style one/few/many forms
    // that read awkwardly in Russian for 1, 21, 22…
    recapBody: (qotd: number, deeds: number, dreams: number) =>
      `${qotd} вопросов · ${deeds} добрых дел · ${dreams} мечт сбылось`,
  },
  notes: {
    heading: "Записки",
    sub: "тёплые слова для партнёра — когда захочется",
    empty: "Пока нет ни одной записки. Напишите что-то тёплое 💛",
    placeholder: "Напишите записку…",
    send: "💌 Отправить",
    sent: "Записка отправлена 💌",
    fromYou: "вы",
    toPartner: "партнёру",
    fromPartner: "партнёр",
  },
  common: {
    add: "Добавить",
    cancel: "Отмена",
    save: "Сохранить",
    delete: "Удалить",
    edit: "Изменить",
    done: "Готово",
    skip: "Пропустить",
    close: "Закрыть",
    loading: "Загружается…",
    error: "Что-то пошло не так. Попробуйте ещё раз.",
    retry: "Повторить",
    upgradePro: "Оформить Pro",
    upgradeSoon: "Скоро подключим оплату — пока можно убрать что-то старое",
    upgradeOK: "Ладно",
    deleteOld: "Убрать старое",
    deleteOldShort: "Отпустить старое",
    sendFailed: "Не отправилось. Попробуйте ещё раз.",
  },
  wishlist: {
    heading: "Ваш wishlist",
    empty:
      "Пока пусто. Перешлите мне любой пост — из канала, из чата, из группы — и он станет первой хотелкой в общем списке.",
    addPrompt: "Что хотим сделать вместе? Напишите название, адрес или дату.",
    titlePlaceholder: "Например: пицца на Маросейке",
    addressPlaceholder: "Адрес (необязательно)",
    categoryPlaceholder: "Категория (необязательно)",
    added: (title: string) => `Готово! «${title}» в списке.`,
    markedDone: (title: string) => `Отметил «${title}» как сделанное 🙌`,
    deleted: (title: string) => `Удалил «${title}». Безвозвратно, как договаривались.`,
    repeat: "🔁 Хочу повторить",
    archiveAction: "В архив",
    archiveConfirm: (title: string) => `Убрать «${title}» в архив? Останется в архиве, но не будет мешаться.`,
    archiveSubmit: "В архив",
    archivedLabel: "в архиве",
    archiveSectionClosed: (n: number) => `Архив · ${n}`,
    archiveSectionOpen: "Архив",
    archiveEmpty: "В архиве пусто.",
    limitHit:
      "Ой, в бесплатной версии максимум 10 хотелок, и список уже полон 😅 Что решим: оформить Pro и добавить без лимита, или убрать что-то из старого?",
  },
  bucket: {
    heading: "Мечты на двоих",
    empty:
      "Пока нет ни одной большой мечты. С чего начать? «Увидеть северное сияние», «съездить на океан», «выучить язык вместе» — мечтайте вслух.",
    addPrompt:
      "Большая мечта на двоих? Напишите, что хочется когда-нибудь — «увидеть северное сияние», «научиться дайвингу». Без даты, просто мечта.",
    titlePlaceholder: "Например: увидеть северное сияние",
    notePlaceholder: "Заметка (необязательно)",
    added: (title: string) => `Готово! «${title}» в ваших мечтах ✨`,
    markedDone: (title: string) => `У вас получилось! «${title}» 🌌`,
    deleted: (title: string) => `Удалил «${title}».`,
    hint:
      "«Сделаем в этом месяце?» → вишлист. «Может, в этом году, а может никогда» → сюда, в мечты.",
    limitHit:
      "В бесплатной версии максимум 5 мечтаний, и список полон ✨ Оформим Pro (без лимита) или отпустим какую-то из старых?",
    dreamsTab: "Мечты",
    fulfilledTab: "Сбылось 🌠",
    fulfilledEmpty: "Пока ничего не сбылось — но всё впереди ✨",
    fulfilledOn: (date: string) => `сбылось ${date}`,
  },
  countdowns: {
    heading: "Отсчёты",
    empty:
      "Пока нет ни одного отсчёта. Добавьте дату, которую ждёте вместе — отпуск, годовщину, чей-то день рождения.",
    addPrompt: "Поставим отсчёт до важной даты? Напишите название — например, «отпуск», «год вместе».",
    labelPlaceholder: "Название, например: отпуск",
    datePlaceholder: "Дата, например: 25.12.2026",
    emojiPlaceholder: "Эмодзи (необязательно)",
    added: (emoji: string, label: string, n: number) =>
      `${emoji} «${label}» — через ${n} дн. Теперь видно вам обоим.`,
    deleted: (label: string) => `Удалил «${label}».`,
    limitHit:
      "В бесплатной версии максимум 10 отсчётов, и всё место занято 😊 Оформим Pro (без лимита) или уберём старый отсчёт?",
    milestonePresets: [
      { id: "met", label: "День знакомства", emoji: "💝" },
      { id: "wedding", label: "Свадьба", emoji: "💍" },
      { id: "moved", label: "Переезд", emoji: "📦" },
      { id: "first-date", label: "Первое свидание", emoji: "☕" },
      { id: "custom", label: "Своя дата", emoji: "✍️" },
    ],
  },
  mood: {
    heading: "Настроение",
    empty:
      "Настроение ещё не задавали. Один тап — и партнёр увидит, как ты, без лишних слов.",
    prompt: "Как ты сейчас?",
    youLabel: "Ты",
    partnerLabel: "Партнёр",
    notSet: "настроение не задано",
    picked: (emoji: string, label: string) => `Принято: ${emoji} ${label}.`,
    notePrompt: "Хочешь пару слов для партнёра? (можно пропустить)",
    notePlaceholder: "Пара слов (до 60 символов)",
    cleared: "Убрал твоё настроение. Сейчас у тебя «не задано».",
    clearButton: "🚫 Убрать настроение",
    saveFailed: "Не удалось сохранить настроение. Попробуйте ещё раз.",
    clearFailed: "Не удалось убрать настроение. Попробуйте ещё раз.",
    moods: [
      { emoji: "😊", value: "сияю", label: "сияю" },
      { emoji: "😄", value: "радостно", label: "радостно" },
      { emoji: "🙂", value: "хорошо", label: "хорошо" },
      { emoji: "😌", value: "спокойно", label: "спокойно" },
      { emoji: "😐", value: "ровно", label: "ровно" },
      { emoji: "🙁", value: "так себе", label: "так себе" },
      { emoji: "😔", value: "грустно", label: "грустно" },
      { emoji: "😢", value: "паршиво", label: "паршиво" },
    ] as const,
  },
  qotd: {
    heading: "Вопрос дня",
    empty:
      "Сегодня первый вопрос дня для вашей пары. Отвечайте по очереди — это маленький повод проверить, как вы оба, без повода.",
    revealLocked: (partner: string) =>
      `Сначала ответь сам — тогда увидишь, что ответил(а) ${partner}. Это честно по отношению к вам обоим 🔒`,
    answerButton: "Ответить",
    answerPrompt: "Напиши свой ответ (до 280 символов, эмодзи можно):",
    answerPlaceholder: "Ваш ответ…",
    waitingForPartner: (partner: string) =>
      `${partner} ещё не ответил(а). Как ответит — сразу откроется.`,
    postedSelfOnly: (partner: string) =>
      `Записал твой ответ 💭 Ответ ${partner} откроется, как только он(а) тоже ответит.`,
    myAnswerLabel: "🧑 Твой ответ",
    partnerAnswerLabel: (partner: string) => `💛 ${partner}`,
    // Bundle D Task 3: read-only history sheet (Q&As where both answered).
    historyButton: "📜 История",
    historyTitle: "История вопросов",
    historyEmpty: "Пока нет истории",
  },
  gifts: {
    heading: "Подарки",
    waitingForYou: "Ждёт вас",
    goodDeedsHeading: "💛 Добрые дела",
    empty:
      "Подарков пока нет. Это могут быть мелочи: завтрак в постель, массаж, право выбрать фильм. Загляните в каталог.",
    sendPrompt: (partner: string) =>
      `Хочешь подарить ${partner} небольшой жест? Выбирай из списка — это обещание, которое потом можно исполнить. 🎁`,
    customPrompt:
      "Опиши свой жест парой слов — что обещаешь? Например: «ленивое воскресенье», «уборка вместо тебя на этой неделе».",
    customButton: "✍️ Свой жест",
    sent: (gesture: string, partner: string) =>
      `Отправил(а) «${gesture}» для ${partner}. Ждём, когда заберёт 💛`,
    acceptButton: "Принять",
    declineButton: "Вежливо отказаться",
    accepted: (gesture: string, partner: string) =>
      `Принято! «${gesture}» теперь у тебя. Когда случится — пусть ${partner} отметит, что выполнил.`,
    declined: (gesture: string) => `Окей, «${gesture}» убираем. Всё в порядке, без проблем.`,
    redeemButton: "Отметить выполненным",
    redeemed: (gesture: string) => `Отметил(а) «${gesture}» как выполненное 🙌`,
    completeButton: "Записать в добрые дела",
    completed: (gesture: string) => `Готово! «${gesture}» записано в добрые дела 💛`,
  },
  limitNote: {
    count: (n: number, max: number) => `${n} из ${max} в бесплатной версии`,
  },
  milestones: {
    generic: "Кажется, у вас тут что-то получилось 🤍",
    wishlist5: "5 вещей в вишлисте — вы классно скидываете друг другу идеи",
    wishlist10: "10 вещей в вишлисте. Хватит уже, идите куда-нибудь 🤍",
    wishlistCustom: (v: number) => `${v} вещей в вишлисте вместе. Здорово.`,
    countdown5: "5 общих отсчётов. Время летит к хорошему.",
    countdown10: "10 отсчётов. У вас всегда что-то впереди.",
    countdownCustom: (v: number) => `${v} общих дат. Дорожная карта растёт.`,
    qotd7: "7 ответов на вопросы дня. Вы реально разговариваете друг с другом.",
    qotdCustom: (v: number) => `${v} ответов. Темы поднимаете серьёзные.`,
    gift3: "3 подарочка-действия отправлено. Обещания копятся.",
    gift10: "10 жестов-подарков. Без слов слышно, что вам хорошо.",
    giftCustom: (v: number) => `${v} жестов подарено. Это много.`,
    giftCompleted5: "5 подарков сделаны делом. Обещания сдерживаются 🔥",
    giftCompleted15: "15 завершённых жестов. Это уже привычка — держать слово 🤍",
    giftCompletedCustom: (v: number) => `${v} подарков-действий завершено. Вы держите слово.`,
    moodMutual7: "7 дней, когда оба делились настроением. Это больше чем просто смайлик 🌤",
    moodMutualCustom: (v: number) => `${v} дней, где оба открывали настроение.`,
  },
  stats: {
    title: "Вы вместе",
    days: (d: number) => `${d} ${pluralDays(d)}`,
    wishlist: (n: number, done: number) => `Вишлист: ${done} из ${n} сделано`,
    gifts: (n: number, done: number) => `Подарки: ${done} из ${n} завершено`,
    qotd: (n: number) => `Вопросов дня: ${n} ответов`,
    countdowns: (n: number) => `Отсчётов: ${n}`,
  },
} as const;

function pluralDays(n: number): string {
  const d = n % 10;
  const dd = n % 100;
  if (dd >= 11 && dd <= 14) return "дней";
  if (d === 1) return "день";
  if (d >= 2 && d <= 4) return "дня";
  return "дней";
}
