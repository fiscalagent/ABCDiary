interface Props {
  onBack: () => void;
}

// Single source of truth for the help text: the same steps feed both the
// on-screen cards and the printable PDF, so the two can no longer drift apart
// as they did when each was hand-written separately. Content is static and
// author-controlled (never user input), so the inline <strong>/<em>/<span>
// markup is safe to render via dangerouslySetInnerHTML / string interpolation.
interface HelpCard {
  title: string;
  steps: string[];
}
interface HelpNote {
  note: string;
}
type HelpEntry = HelpCard | HelpNote;
interface HelpSection {
  title: string;
  cards: HelpEntry[];
}

function isNote(card: HelpEntry): card is HelpNote {
  return 'note' in card;
}

const HELP_CONTENT: HelpSection[] = [
  {
    title: 'А) Для пациента',
    cards: [
      {
        title: 'Первый запуск',
        steps: [
          'Откройте приложение в браузере на телефоне.',
          'Придумайте и введите PIN-код — он шифрует все записи.',
          'Добавьте на экран «Домой»:<br><span class="help-sub">iPhone: «Поделиться» → «На экран "Домой"»</span><br><span class="help-sub">Android: «Установить приложение» в браузере</span>',
        ],
      },
      {
        title: 'Настройка таблицы для терапевта',
        steps: [
          'Создайте новую Google Таблицу на <strong>sheets.google.com</strong>.',
          'Поделитесь ею с терапевтом: «Поделиться» → email терапевта → «Читатель».',
          'В приложении: ⚙️ → вставьте ссылку на таблицу → введите Gmail → «Сохранить и войти».',
        ],
      },
      {
        title: 'Эмоции',
        steps: [
          'Нажмите <strong>+</strong> → <em>Эмоции</em>. Пройдите по полям: ситуация → мысли → эмоции → поведение.',
          'Нажмите на поле и говорите вслух — речь переводится в текст. Можно и печатать.',
          'Сохраните — запись уйдёт в таблицу и останется на устройстве.',
        ],
      },
      {
        title: 'Дела — утром (план)',
        steps: [
          'Нажмите <strong>+</strong> → <em>Дело (план)</em>.',
          'Заполните 4 поля: занятие, сфера, когда планируете, важность&nbsp;0–10.',
          'Сохраните — дело появится в секции <strong>«🗓 План на сегодня»</strong> наверху главного экрана.',
          'Повторите для каждого дела на день.',
        ],
      },
      {
        title: 'Дела — по ходу дня (оценка)',
        steps: [
          'Тапните по карточке в «Плане на сегодня».',
          'Оцените 3 параметра: сложность, удовольствие во время, удовлетворение после. Время и важность можно подправить.',
          '<strong>«✅ Готово»</strong> — дело уйдёт из плана в обычную ленту, в таблице статус станет «выполнено».',
          '<strong>«💾 Сохранить (пока в плане)»</strong> — если оценили частично, вернётесь позже.',
        ],
      },
    ],
  },
  {
    title: 'Б) Для терапевта',
    cards: [
      {
        title: 'Подготовка',
        steps: [
          'Попросите пациента создать таблицу и поделиться ею с вашим email.',
          'Примите приглашение — таблица появится в вашем Google Drive.',
        ],
      },
      {
        title: 'Работа с данными',
        steps: [
          'Откройте таблицу — два листа: <strong>«Эмоции»</strong> и <strong>«Дела»</strong>.',
          'Новые записи появляются автоматически при каждом сохранении пациента.',
          'Фильтруйте, сортируйте и стройте графики в Google Sheets.',
        ],
      },
      {
        note: '<strong>Важно:</strong> в таблицу попадают только те записи, которые пациент сохранил сам. На устройстве они хранятся в зашифрованном виде и не доступны никому без PIN-кода.',
      },
    ],
  },
];

function buildPrintHtml(): string {
  const body = HELP_CONTENT.map(section => {
    const cardsHtml = section.cards
      .map(card =>
        isNote(card)
          ? `<p class="note">${card.note}</p>`
          : `<h3>${card.title}</h3><ol>${card.steps.map(s => `<li>${s}</li>`).join('')}</ol>`
      )
      .join('');
    return `<h2>${section.title}</h2>${cardsHtml}`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<title>ABCDiary — Инструкция</title>
<style>
  body { font-family: -apple-system, Arial, sans-serif; max-width: 680px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.6; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .subtitle { color: #666; font-size: 14px; margin-bottom: 32px; }
  h2 { font-size: 17px; margin: 28px 0 12px; border-bottom: 2px solid #eee; padding-bottom: 6px; }
  h3 { font-size: 14px; font-weight: 600; margin: 16px 0 6px; color: #444; }
  ol, ul { margin: 0 0 12px; padding-left: 20px; }
  li { margin-bottom: 6px; font-size: 14px; }
  .note { background: #f5f5f5; border-left: 3px solid #999; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #555; margin-top: 20px; }
  @media print {
    body { margin: 20px auto; }
    h2 { page-break-after: avoid; }
  }
</style>
</head>
<body>
<h1>ABCDiary — Инструкция</h1>
<p class="subtitle">Голосовой дневник с шифрованием и синхронизацией в Google Таблицы</p>
${body}
</body>
</html>`;
}

function printHelp() {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(buildPrintHtml());
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

export function HelpScreen({ onBack }: Props) {
  return (
    <div className="screen">
      <header className="app-header">
        <button className="text-btn" onClick={onBack}>← Назад</button>
        <span className="header-title">Инструкция</span>
        <button className="icon-btn" onClick={printHelp} aria-label="Сохранить PDF" title="Сохранить PDF">🖨️</button>
      </header>

      <div className="form-body help-body">
        {HELP_CONTENT.map(section => (
          <section key={section.title} className="help-section">
            <h2 className="help-section-title">{section.title}</h2>
            {section.cards.map((card, i) =>
              isNote(card) ? (
                <div
                  key={i}
                  className="help-card help-card--note"
                  dangerouslySetInnerHTML={{ __html: card.note }}
                />
              ) : (
                <div key={i} className="help-card">
                  <h3>{card.title}</h3>
                  <ol>
                    {card.steps.map((s, j) => (
                      <li key={j} dangerouslySetInnerHTML={{ __html: s }} />
                    ))}
                  </ol>
                </div>
              )
            )}
          </section>
        ))}

        <button className="settings-btn secondary" style={{ marginTop: 8 }} onClick={printHelp}>
          🖨️ Сохранить как PDF
        </button>
      </div>
    </div>
  );
}
