import { randomUUID } from "node:crypto";

import { Express } from "./src/mini.ts";
import { HttpError } from "./src/errors/HttpError.ts";

type Todo = { id: string; title: string; done: boolean };

let todos: Todo[] = [
  {
    id: "ac32e2d0-b3b7-4f30-b0f0-215661ed4c00",
    title: "Learn Node.js",
    done: true,
  },
  {
    id: "42c3bdba-9413-4b65-b669-398b52278d8f",
    title: "Learn Nest.js",
    done: false,
  },
];

const app = new Express();

app.use(async (ctx, next) => {
  const start = Date.now();

  await next();

  const ms = Date.now() - start;
  console.log(`${ctx.req.method} ${ctx.req.url} ${ctx.res.statusCode} ${ms}ms`);
});

app.use(async (ctx, next) => {
  ctx.res.setHeader("x-request-id", randomUUID());

  await next();
});

app.use(async (ctx, next) => {
  try {
    await next();
  } catch (error) {
    if (ctx.res.headersSent) {
      ctx.res.end();
      return;
    }

    if (error instanceof HttpError) {
      ctx.json(error.status, { error: error.message });
      return;
    }

    console.error(error);
    ctx.json(500, { error: "Internal Server Error" });
  }
});

app.use("/todos", async (ctx, next) => {
  const done = ctx.query.done;

  if (done !== undefined && done !== "true" && done !== "false") {
    throw new HttpError(400, "Query param 'done' must be 'true' or 'false'");
  }

  await next();
});

const todoSchema = {
  title: "string",
  done: "boolean",
} as const;

type TodoField = keyof typeof todoSchema;

const parseTodoPayload = (raw: unknown, partial: boolean) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, "Body must be a JSON object");
  }

  const payload = raw as Record<string, unknown>;
  const keys = Object.keys(payload);

  if (keys.length === 0) throw new HttpError(400, "Body is empty");

  for (const key of keys) {
    if (!(key in todoSchema)) {
      throw new HttpError(400, `Unknown field: ${key}`);
    }
    if (typeof payload[key] !== todoSchema[key as TodoField]) {
      throw new HttpError(400, `Invalid type of ${key} field`);
    }
  }

  if (!partial) {
    for (const key of Object.keys(todoSchema)) {
      if (!(key in payload)) throw new HttpError(400, `Missing field: ${key}`);
    }
  }

  return payload as Partial<Omit<Todo, "id">>;
};

const findTodo = (id: string) => {
  const todo = todos.find((t) => t.id === id);
  if (!todo) throw new HttpError(404, `Todo with id: ${id} was not found`);
  return todo;
};

app.get("/todos", (ctx) => {
  const { done } = ctx.query;

  if (done === undefined) {
    ctx.json(200, todos);
    return;
  }

  ctx.json(
    200,
    todos.filter((t) => t.done === (done === "true")),
  );
});

app.get("/todos/:id", (ctx) => {
  ctx.json(200, findTodo(ctx.params.id));
});

app.post("/todos", async (ctx) => {
  const payload = parseTodoPayload(await ctx.body(), false);

  const todo: Todo = { id: randomUUID(), ...(payload as Omit<Todo, "id">) };
  todos.push(todo);

  ctx.json(201, todo);
});

app.patch("/todos/:id", async (ctx) => {
  const todo = findTodo(ctx.params.id);
  const payload = parseTodoPayload(await ctx.body(), true);

  Object.assign(todo, payload);

  ctx.json(200, todo);
});

app.delete("/todos/:id", (ctx) => {
  const todo = findTodo(ctx.params.id);
  todos = todos.filter((t) => t.id !== todo.id);

  ctx.res.statusCode = 204;
  ctx.res.end();
});

app.listen(3000, () => console.log("Listening"));
