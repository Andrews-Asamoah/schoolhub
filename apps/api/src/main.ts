import "./load-env.js"; // must stay the first import
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.setGlobalPrefix("api");

  // Behind a load balancer, trust its X-Forwarded-* headers so rate limits and
  // audit logs see the real client IP rather than the proxy's.
  if (env.TRUST_PROXY) {
    const hops = Number(env.TRUST_PROXY);
    app.set("trust proxy", Number.isInteger(hops) ? hops : env.TRUST_PROXY);
  }

  const swaggerEnabled =
    env.SWAGGER_ENABLED !== undefined
      ? env.SWAGGER_ENABLED === "true"
      : env.NODE_ENV !== "production";

  // Security headers (HSTS, nosniff, frame-ancestors, ...). The Swagger UI
  // needs inline scripts, so the CSP is relaxed only while docs are served.
  app.use(
    helmet({
      contentSecurityPolicy: swaggerEnabled ? false : undefined,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );
  app.disable("x-powered-by");

  // Swagger OpenAPI Documentation (never exposed in production by default)
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("SchoolHub API")
      .setDescription(
        "Unified Multi-Tenant Backend for School Management (Web, Mobile & Desktop)",
      )
      .setVersion("1.0")
      .addBearerAuth(
        {
          type: "http",
          scheme: "bearer",
          bearerFormat: "Bearer",
          description: "Bearer token authentication for Mobile & Desktop apps",
        },
        "bearer-token",
      )
      .addCookieAuth("better-auth.session_token")
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  const allowedOrigins = [
    env.WEB_ORIGIN,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://tauri.localhost",
    "tauri://localhost",
  ];

  const subdomainPattern =
    /^https?:\/\/([a-z0-9-]+\.)*(localhost|schoolhub\.(gh|app|com))(:\d+)?$/i;

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile native apps, desktop requests) or allowed origins/subdomains
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        subdomainPattern.test(origin)
      ) {
        return callback(null, true);
      }
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    exposedHeaders: ["set-auth-token"],
  });

  await app.listen(env.PORT);
}
void bootstrap();
