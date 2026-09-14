import nodemailer, { type Transporter } from "nodemailer";

/**
 * The one shape every part of the product sends mail through — the web
 * app (password reset) and the worker (new-comment notifications) alike,
 * which is why this lives in `packages/shared` rather than under a
 * single app. A password reset link is a credential, so the interface
 * stays intentionally narrow — `to`/`subject`/`text` only, plain text,
 * nothing that invites a caller to compose HTML containing a link twice
 * (once in a visible href, once in tracking-pixel-adjacent markup a mail
 * client might log).
 *
 * `SmtpMailTransport` is the only production implementation; tests
 * substitute `CapturingMailTransport` so a test never opens a real
 * network connection or sends a real email.
 *
 * A separate subpath export (`./mail`, not the package root) for the
 * same reason `./vtt` is one: nothing that imports the shared package's
 * root barrel should have to pull `nodemailer` in along with it.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/** `SMTP_USER`/`SMTP_PASSWORD` are optional — some self-hosted relays (a local Postfix, an internal mail gateway) accept unauthenticated mail from trusted network ranges. */
export function loadSmtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SmtpConfig {
  const host = env.SMTP_HOST;
  const from = env.SMTP_FROM;
  if (!host || !from) {
    throw new Error("Missing required environment variable: SMTP_HOST or SMTP_FROM");
  }
  return {
    host,
    port: env.SMTP_PORT ? Number(env.SMTP_PORT) : 587,
    secure: env.SMTP_SECURE === "true",
    user: env.SMTP_USER,
    password: env.SMTP_PASSWORD,
    from,
  };
}

export class SmtpMailTransport implements MailTransport {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: SmtpConfig) {
    this.from = config.from;
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
    });
  }
}

/**
 * A test-only, in-memory transport: `send` never touches the network, it
 * just remembers every message so a test can inspect it directly instead
 * of intercepting SMTP traffic. Exported from the production module
 * (rather than a separate test-support file) because it is inert unless a
 * test constructs and injects it — nothing in either app wires it up
 * itself.
 */
export class CapturingMailTransport implements MailTransport {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage): Promise<void> {
    this.sent.push(message);
  }
}

let transport: MailTransport | undefined;

/** One transport per process, built from the environment on first use — mirrors `lib/db.ts`'s `getDb()` in both apps. */
export function getMailTransport(): MailTransport {
  transport ??= new SmtpMailTransport(loadSmtpConfigFromEnv());
  return transport;
}
