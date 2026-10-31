Блок C: мініфреймворк (твої 4 болі)

Один файл mini.js, без залежностей. Вимоги:

- Роутер: app.get('/users/:id', ), app.post(...) і т.д. Параметри в ctx.params, query в ctx.query. Структура даних замість ланцюга if. Свій 404/405.
- Хелпери: ctx.json(status, data) і ctx.body() з лімітом розміру. Невалідний JSON дає 400, а не 500.
- Middleware: app.use(fn) з сигнатурою (ctx, next). Спочатку подумай, як зробити композицію (compose), а не піди шукати готовий код. Це відповідь на твій пункт 4: центральний error handler це middleware, який обгортає await next() у try/catch.
- Помилки: sync і async помилки в хендлері не валять процес, а дають 500 у JSON. Свої класи типу HttpError(404, 'Not found'), які error handler перетворює на потрібний статус.
- Готові middleware: логер (метод, шлях, статус, мс) і request-id в заголовку відповіді.
- Graceful shutdown: на SIGTERM перестати приймати нові з'єднання, дочекатися активних запитів, примусово вийти через 10 с.

Після цього перепиши на ньому CRUD /todos (in-memory): GET список із ?done=true, GET /:id, POST, PATCH, DELETE.
