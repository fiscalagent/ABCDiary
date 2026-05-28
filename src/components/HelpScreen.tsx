interface Props {
  onBack: () => void;
}

function printHelp() {
  const html = `<!DOCTYPE html>
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

<h2>А) Для пациента</h2>

<h3>Первый запуск</h3>
<ol>
  <li>Откройте приложение в браузере на телефоне.</li>
  <li>Придумайте и введите PIN-код — он шифрует все записи.</li>
  <li>Чтобы добавить на экран «Домой»: на iPhone — «Поделиться» → «На экран "Домой"»; на Android — «Установить приложение» в браузере.</li>
</ol>

<h3>Настройка таблицы для терапевта</h3>
<ol>
  <li>Создайте новую Google Таблицу на <strong>sheets.google.com</strong>.</li>
  <li>Поделитесь ею с терапевтом: кнопка «Поделиться» → введите email терапевта → «Читатель» или «Комментатор».</li>
  <li>В приложении нажмите ⚙️ → вставьте ссылку на таблицу → введите свой Gmail → «Сохранить и войти в Google».</li>
</ol>

<h3>Эмоции</h3>
<ol>
  <li>Нажмите <strong>+</strong> → <em>Эмоции</em>. Пройдите по полям: ситуация → мысли → эмоции → поведение.</li>
  <li>Нажмите на поле и говорите вслух — речь переводится в текст автоматически. Можно и печатать.</li>
  <li>Сохраните — запись уйдёт в таблицу и останется на устройстве в зашифрованном виде.</li>
</ol>

<h3>Дела — утром (план)</h3>
<ol>
  <li>Нажмите <strong>+</strong> → <em>Дело (план)</em>.</li>
  <li>Заполните 4 поля: занятие, сфера, когда планируете, важность 0–10.</li>
  <li>Сохраните. Дело появится в секции <strong>«🗓 План на сегодня»</strong> на главном экране.</li>
  <li>Повторите для каждого дела на день.</li>
</ol>

<h3>Дела — по ходу дня (оценка)</h3>
<ol>
  <li>Тапните по карточке в «Плане на сегодня».</li>
  <li>Оцените 3 параметра: сложность, удовольствие во время, удовлетворение после. Время и важность можно подправить, если по факту вышло иначе.</li>
  <li>Нажмите <strong>«✅ Готово»</strong> — дело уйдёт из плана в обычную ленту, в таблице статус станет «выполнено».</li>
  <li>Если оценили частично — нажмите <strong>«💾 Сохранить (пока в плане)»</strong>, чтобы вернуться к нему позже.</li>
</ol>

<h2>Б) Для терапевта</h2>

<h3>Подготовка</h3>
<ol>
  <li>Попросите пациента создать Google Таблицу и поделиться ею с вашим email.</li>
  <li>Примите приглашение — таблица появится в вашем Google Drive.</li>
</ol>

<h3>Работа с данными</h3>
<ol>
  <li>Откройте таблицу — там два листа: <strong>«Эмоции»</strong> и <strong>«Дела»</strong>.</li>
  <li>В листе «Дела» колонка <strong>«Статус»</strong> показывает «план» или «выполнено» — запланированные дела видны сразу при создании, оценки появляются по мере выполнения.</li>
  <li>Новые записи пациента появляются автоматически после каждого сохранения.</li>
  <li>Можно фильтровать, сортировать и строить графики стандартными средствами Google Sheets.</li>
</ol>

<p class="note"><strong>Важно:</strong> в таблицу попадают только те записи, которые пациент сохранил сам. На устройстве они хранятся в зашифрованном виде и не доступны никому без PIN-кода.</p>

</body>
</html>`;

  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
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

        <section className="help-section">
          <h2 className="help-section-title">А) Для пациента</h2>

          <div className="help-card">
            <h3>Первый запуск</h3>
            <ol>
              <li>Откройте приложение в браузере на телефоне.</li>
              <li>Придумайте и введите PIN-код — он шифрует все записи.</li>
              <li>
                Добавьте на экран «Домой»:<br />
                <span className="help-sub">iPhone: «Поделиться» → «На экран "Домой"»</span><br />
                <span className="help-sub">Android: «Установить приложение» в браузере</span>
              </li>
            </ol>
          </div>

          <div className="help-card">
            <h3>Настройка таблицы для терапевта</h3>
            <ol>
              <li>Создайте новую Google Таблицу на <strong>sheets.google.com</strong>.</li>
              <li>Поделитесь ею с терапевтом: «Поделиться» → email терапевта → «Читатель».</li>
              <li>В приложении: ⚙️ → вставьте ссылку на таблицу → введите Gmail → «Сохранить и войти».</li>
            </ol>
          </div>

          <div className="help-card">
            <h3>Эмоции</h3>
            <ol>
              <li>Нажмите <strong>+</strong> → <em>Эмоции</em>. Пройдите по полям: ситуация → мысли → эмоции → поведение.</li>
              <li>Нажмите на поле и говорите вслух — речь переводится в текст. Можно и печатать.</li>
              <li>Сохраните — запись уйдёт в таблицу и останется на устройстве.</li>
            </ol>
          </div>

          <div className="help-card">
            <h3>Дела — утром (план)</h3>
            <ol>
              <li>Нажмите <strong>+</strong> → <em>Дело (план)</em>.</li>
              <li>Заполните 4 поля: занятие, сфера, когда планируете, важность&nbsp;0–10.</li>
              <li>Сохраните — дело появится в секции <strong>«🗓 План на сегодня»</strong> наверху главного экрана.</li>
              <li>Повторите для каждого дела на день.</li>
            </ol>
          </div>

          <div className="help-card">
            <h3>Дела — по ходу дня (оценка)</h3>
            <ol>
              <li>Тапните по карточке в «Плане на сегодня».</li>
              <li>Оцените 3 параметра: сложность, удовольствие во время, удовлетворение после. Время и важность можно подправить.</li>
              <li><strong>«✅ Готово»</strong> — дело уйдёт из плана в обычную ленту, в таблице статус станет «выполнено».</li>
              <li><strong>«💾 Сохранить (пока в плане)»</strong> — если оценили частично, вернётесь позже.</li>
            </ol>
          </div>
        </section>

        <section className="help-section">
          <h2 className="help-section-title">Б) Для терапевта</h2>

          <div className="help-card">
            <h3>Подготовка</h3>
            <ol>
              <li>Попросите пациента создать таблицу и поделиться ею с вашим email.</li>
              <li>Примите приглашение — таблица появится в вашем Google Drive.</li>
            </ol>
          </div>

          <div className="help-card">
            <h3>Работа с данными</h3>
            <ol>
              <li>Откройте таблицу — два листа: <strong>«Эмоции»</strong> и <strong>«Дела»</strong>.</li>
              <li>Новые записи появляются автоматически при каждом сохранении пациента.</li>
              <li>Фильтруйте, сортируйте и стройте графики в Google Sheets.</li>
            </ol>
          </div>

          <div className="help-card help-card--note">
            <strong>Важно:</strong> в таблицу попадают только те записи, которые пациент сохранил сам. На устройстве они хранятся в зашифрованном виде и не доступны никому без PIN-кода.
          </div>
        </section>

        <button className="settings-btn secondary" style={{ marginTop: 8 }} onClick={printHelp}>
          🖨️ Сохранить как PDF
        </button>

      </div>
    </div>
  );
}
