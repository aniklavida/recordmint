import Link from "next/link";
import { Video, ShieldCheck, Zap, HardDrive } from "lucide-react";

export default function HomePage() {
  return (
    <main className="home-container">
      <section className="hero-section">
        <div className="hero-badge">Open-source video messaging</div>
        <h1 className="hero-title">Record in the browser. Share a link.</h1>
        <p className="hero-lead">
          Fast, self-hosted screen recording with direct-to-storage upload, zero native apps, and instant playback.
        </p>
        <div className="hero-actions">
          <Link href="/record" className="btn btn-primary">
            <Video size={18} strokeWidth={1.75} aria-hidden="true" />
            <span>Start recording</span>
          </Link>
          <Link href="/library" className="btn btn-secondary">
            <span>View library</span>
          </Link>
        </div>
      </section>

      <section className="features-grid" aria-label="Key features">
        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <Zap size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="feature-title">Direct-to-storage upload</h2>
          <p className="feature-desc">
            Media streams directly from your browser to S3-compatible storage. Video bytes never proxy through the application server.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <HardDrive size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="feature-title">Immediate share links</h2>
          <p className="feature-desc">
            Your link is generated the moment capture begins. Viewers can watch immediately once uploading finishes.
          </p>
        </div>

        <div className="feature-card">
          <div className="feature-icon-wrapper">
            <ShieldCheck size={20} strokeWidth={1.75} aria-hidden="true" />
          </div>
          <h2 className="feature-title">Self-hosted and private</h2>
          <p className="feature-desc">
            Own your files and database. Control visibility with password protection, expiring links, or workspace-only access.
          </p>
        </div>
      </section>
    </main>
  );
}
