import "./load-env.js"; // must stay the first import
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module.js";
import { env } from "./env.js";

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  // Swagger OpenAPI Documentation
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

  const allowedOrigins = [
    env.WEB_ORIGIN,
    "http://localhost:5173",
    "http://localhost:3000",
    "http://tauri.localhost",
    "tauri://localhost",
  ];

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Allow requests with no origin (mobile native apps, desktop requests) or allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
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