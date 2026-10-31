import { URL } from "node:url";
import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from "node:http";

import { HttpError } from "./errors/HttpError.ts";

type Method = "GET" | "PUT" | "POST" | "PATCH" | "DELETE";

type CtxObject = {
  req: IncomingMessage;
  res: ServerResponse;
  params: Record<string, string>;
  query: Record<string, string>;
  json: SendJsonFn;
  body: () => Promise<Object>;
};

type RequestHandlerFn = (
  ctx: CtxObject,
  next: () => Promise<void>,
) => void | Promise<void>;

type NotFoundDetails = {
  method: Method;
  path: string;
};

type SendJsonFn = (status: number, data: Object) => void;

type HandlerEntry = MiddlewareHandlerEntry | RouteHandlerEntry;

type MiddlewareHandlerEntry = {
  type: "middleware";
  urlParts?: UrlPart[];
  handler: RequestHandlerFn;
};

type RouteHandlerEntry = {
  type: "route";
  urlParts: UrlPart[];
  handler: RequestHandlerFn;
  method: Method;
};

type UrlPart = { type: "segment" | "param"; value: string };

const mb = (mb: number) => mb * 1024 * 1024;

export class Express {
  server: Server;
  handlers: HandlerEntry[] = [];

  constructor() {
    this.server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url as string, "http://localhost:3000");
        const reqMethod = req.method as Method;
        const reqUrlParts = this.pathToUrlParts(url.pathname);

        const matches: {
          entry: HandlerEntry;
          params: Record<string, string>;
        }[] = [];

        for (const entry of this.handlers) {
          const params = this.matchEntry(entry, reqMethod, reqUrlParts);
          if (params === null) continue;
          matches.push({ entry, params });
        }

        const ctx = this.buildCtx(req, res, {}, url.searchParams);

        const dispatch = async (i: number = 0): Promise<void> => {
          const match = matches[i];

          if (!match) {
            if (!res.writableEnded) {
              this.send404(res, { method: reqMethod, path: url.pathname });
            }
            return;
          }

          ctx.params = match.params;

          const next = () => dispatch(i + 1);

          await match.entry.handler(ctx, next);
        };
        await dispatch();
      } catch (error) {
        console.error(error);

        if (res.headersSent) {
          res.end();
          return;
        }

        res.statusCode = 500;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: "Internal Server Error" }));
      }
    });
  }

  private buildCtx(
    req: IncomingMessage,
    res: ServerResponse,
    params: Record<string, string>,
    searchParams: URLSearchParams,
  ): CtxObject {
    const getQuery = () => {
      const queryObj: Record<string, string> = {};

      searchParams.forEach((_, key) => {
        queryObj[key] = searchParams.get(key) as string;
      });

      return queryObj;
    };

    const ctx = {
      req,
      res,
      params: params,
      query: getQuery(),
      json(status: number, data: Object) {
        this.res.statusCode = status;
        this.res.setHeader("content-type", "application/json");

        this.res.end(JSON.stringify(data));
      },

      async body(limit: number = mb(1)) {
        let byteLength = 0;
        const chunks: Buffer[] = [];

        for await (const chunk of this.req) {
          const bufferChunk = chunk as Buffer;
          byteLength += bufferChunk.byteLength;

          if (byteLength > limit) throw new HttpError(413, "Content Too Large");

          chunks.push(bufferChunk);
        }

        const stringBody = Buffer.concat(chunks).toString();

        try {
          return JSON.parse(stringBody);
        } catch (error) {
          if (error instanceof SyntaxError)
            throw new HttpError(400, "Invalid JSON");

          throw new HttpError(500, "Parse Error");
        }
      },
    };

    return ctx;
  }

  listen(port: number, cb: () => void) {
    this.server.listen(port, cb);

    const shutdown = (signal: string) => {
      console.log(`${signal} received, shutting down...`);

      const forceExit = setTimeout(() => {
        console.error("Forced shutdown after 10s");
        process.exit(1);
      }, 10_000);
      forceExit.unref();

      this.server.close((err) => {
        if (err) {
          console.error(err);
          process.exit(1);
        }
        process.exit(0);
      });

      this.server.closeIdleConnections();
    };

    let shuttingDown = false;
    const onSignal = (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      shutdown(signal);
    };

    process.on("SIGTERM", () => onSignal("SIGTERM"));
    process.on("SIGINT", () => onSignal("SIGINT"));
  }

  private matchEntry(entry: HandlerEntry, method: Method, urlParts: UrlPart[]) {
    if (
      entry.type === "middleware" &&
      (entry.urlParts?.length || 0) > urlParts.length
    )
      return null;

    if (entry.type === "route" && entry.method !== method) return null;
    if (entry.type === "route" && entry.urlParts.length !== urlParts.length)
      return null;

    return this.matchEntryUrlPartsWithReqUrlParts(
      entry.urlParts || [],
      urlParts,
    );
  }

  private matchEntryUrlPartsWithReqUrlParts(
    entryUrlParts: UrlPart[],
    reqUrlParts: UrlPart[],
  ): Record<string, string> | null {
    const params: Record<string, string> = {};

    for (let i = 0; i < entryUrlParts.length; i++) {
      const entryPart = entryUrlParts[i];
      const reqPart = reqUrlParts[i];

      if (!reqPart) return null;

      if (entryPart.type === "param") {
        params[entryPart.value.slice(1)] = reqPart.value;
        continue;
      }

      if (entryPart.value !== reqPart.value) return null;
    }

    return params;
  }

  private send404(res: ServerResponse, details: NotFoundDetails) {
    res.statusCode = 404;

    this.sendNotFound(res, details);
  }

  private sendNotFound(res: ServerResponse, details: NotFoundDetails) {
    res.setHeader("content-type", "text/html");

    res.end(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
      <meta charset="utf-8">
      <title>Error</title>
      </head>
      <body>
      <pre>Cannot ${details.method} ${details.path}</pre>
      </body>
      </html>
    `);
  }

  private pathToUrlParts(path: string): UrlPart[] {
    const pathParts = path.split("/");
    const lastElementIndex = pathParts.length - 1;
    const endSliceIndex =
      pathParts[lastElementIndex] === "" ? lastElementIndex : undefined;

    const trimmedPathParts = pathParts.slice(1, endSliceIndex);

    return trimmedPathParts.map((part) => ({
      value: part,
      type: part.startsWith(":") ? "param" : "segment",
    }));
  }

  private addRoute(method: Method, path: string, handler: RequestHandlerFn) {
    this.handlers.push({
      type: "route",
      urlParts: this.pathToUrlParts(path),
      method: method,
      handler: handler,
    });
  }

  private addMiddleware(path: string | undefined, handler: RequestHandlerFn) {
    this.handlers.push({
      type: "middleware",
      urlParts: path ? this.pathToUrlParts(path) : [],
      handler: handler,
    });
  }

  use(path: string, handler: RequestHandlerFn): void;
  use(handler: RequestHandlerFn): void;

  use(a: string | RequestHandlerFn, b?: RequestHandlerFn) {
    if (typeof a === "function") {
      this.addMiddleware(undefined, a);
      return;
    }

    this.addMiddleware(a, b!);
  }

  get(path: string, handler: RequestHandlerFn) {
    this.addRoute("GET", path, handler);
  }

  post(path: string, handler: RequestHandlerFn) {
    this.addRoute("POST", path, handler);
  }

  put(path: string, handler: RequestHandlerFn) {
    this.addRoute("PUT", path, handler);
  }

  patch(path: string, handler: RequestHandlerFn) {
    this.addRoute("PATCH", path, handler);
  }

  delete(path: string, handler: RequestHandlerFn) {
    this.addRoute("DELETE", path, handler);
  }
}
