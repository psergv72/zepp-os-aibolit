// Список похвалы за своевременный приём лекарств.
// Добавляйте новые сообщения в массив ниже — страница «Принято» показывает их по очереди.
export const PRAISE_MESSAGES = [
  'Отлично! Вы приняли лекарства вовремя.',
  'Молодец! Так держать!',
  'Прекрасно! Организм скажет вам спасибо.',
  'Вы молодец! Ни одного пропуска.',
  'Замечательно! Дисциплина — ваша суперсила.',
  'Ура! Лекарства приняты, всё под контролем.',
  'Браво! Вы заботитесь о своём здоровье.',
  'Супер! Вы не забываете о себе.',
  'Великолепно! Продолжайте в том же духе.',
  'Отличная привычка! Так держать и дальше.',
]

let lastIndex = -1

export function getRandomPraiseMessage() {
  if (PRAISE_MESSAGES.length <= 1) return PRAISE_MESSAGES[0] || ''

  let index = lastIndex
  while (index === lastIndex) {
    index = Math.floor(Math.random() * PRAISE_MESSAGES.length)
  }
  lastIndex = index
  return PRAISE_MESSAGES[index]
}
