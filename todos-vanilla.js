import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { URL } from "node:url";

// Після цього перепиши на ньому CRUD /todos (in-memory): GET список із ?done=true, GET /:id, POST, PATCH, DELETE.

const sendJson = (res, status, body) => {
  res.setHeader("content-type", "application/json");
  res.statusCode = status;

  res.end(JSON.stringify(body));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }

  return Buffer.concat(chunks).toString("utf-8");
};

const updateTodoScheme = {
  message: { type: "string", optional: true },
  done: { type: "boolean", optional: true },
};

const createTodoScheme = {
  message: { type: "string", optional: false },
  done: { type: "boolean", optional: false },
};

const validateUpdateTodoPayload = (payload) => {
  const payloadKeys = Object.keys(payload);
  if (payloadKeys.length > 2 || payloadKeys.length === 0)
    throw new Error("Invalid update body");

  payloadKeys.forEach((key) => {
    const validationRule = updateTodoScheme?.[key];
    if (!validationRule) throw new Error("Invalid update body keys");

    if (typeof payload[key] !== validationRule.type)
      throw new Error(`Invalid type of ${key} field`);
  });
};

const validateCreateTodoPayload = (payload) => {
  const numberORequiredFields = Object.values(createTodoScheme).reduce(
    (prev, ruleSet) => {
      if (!ruleSet.optional) {
        return prev + 1;
      }

      return prev;
    },
    0,
  );

  if (Object.keys(payload).length !== numberORequiredFields)
    throw new Error("Invalid create payload");

  Object.keys(createTodoScheme).forEach((key) => {
    const ruleSet = createTodoScheme[key];

    console.log(payload[key]);

    if (payload[key] === undefined) throw new Error("Invalid update body keys");
    if (typeof payload[key] !== ruleSet.type)
      throw new Error(`Invalid type of ${key} field`);
  });
};

let todos = [
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

const server = createServer();

server.on("request", async (req, res) => {
  const url = new URL(req.url, "http://localhost:3000");

  if (url.pathname === "/todos" && req.method === "GET") {
    const doneFilter = url.searchParams.get("done");

    if (!doneFilter || (doneFilter !== "true" && doneFilter !== "false")) {
      sendJson(res, 200, todos);
      return;
    }

    sendJson(
      res,
      200,
      todos.filter((todo) => todo.done === (doneFilter === "true")),
    );
    return;
  }

  if (url.pathname === "/todos" && req.method === "POST") {
    try {
      const body = await readBody(req);

      const jsonBody = JSON.parse(body);

      validateCreateTodoPayload(jsonBody);

      const newTodo = {
        id: randomUUID(),
        ...jsonBody,
      };
      todos = [...todos, newTodo];

      sendJson(res, 201, newTodo);
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, { statusCode: 400, message: "Invalid json" });
        return;
      }

      if (error instanceof Error) {
        sendJson(res, 400, { statusCode: 400, message: error.message });
        return;
      }
    }
  }

  const parts = url.pathname.split("/");

  if (parts[1] === "todos" && parts.length === 3 && req.method === "GET") {
    const id = parts[2];

    const todoById = todos.find((todo) => todo.id === id);

    if (!todoById) {
      sendJson(res, 404, {
        statusCode: 404,
        message: `Todo with id: ${id} was not found`,
      });
      return;
    }

    sendJson(res, 200, todoById);
    return;
  }

  if (parts[1] === "todos" && parts.length === 3 && req.method === "DELETE") {
    const id = parts[2];

    const filteredTodos = todos.filter((todo) => todo.id !== id);

    if (filteredTodos.length === todos.length) {
      sendJson(res, 404, {
        statusCode: 404,
        message: `Todo with id: ${id} was not found`,
      });
      return;
    }

    res.statusCode = 204;
    todos = filteredTodos;

    res.end();
    return;
  }

  if (parts[1] === "todos" && parts.length === 3 && req.method === "PATCH") {
    const id = parts[2];

    const todoById = todos.find((todo) => todo.id === id);

    if (!todoById) {
      sendJson(res, 404, {
        statusCode: 404,
        message: `Todo with id: ${id} was not found`,
      });
      return;
    }

    try {
      const body = await readBody(req);

      const jsonBody = JSON.parse(body);

      validateUpdateTodoPayload(jsonBody);

      todos = todos.map((todo) => {
        if (todo.id !== id) return todo;

        return {
          id: todo.id,
          ...jsonBody,
        };
      });

      sendJson(
        res,
        200,
        todos.find((todo) => todo.id === id),
      );
      return;
    } catch (error) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, { statusCode: 400, message: "Invalid json" });
        return;
      }

      if (error instanceof Error) {
        sendJson(res, 400, { statusCode: 400, message: error.message });
        return;
      }
    }
  }

  sendJson(res, 404, { statusCode: 404, message: "Not Found" });
});

server.listen(3000, () => {
  console.log("Listening");
});
