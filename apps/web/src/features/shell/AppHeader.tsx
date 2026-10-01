import Link from "next/link";
import { Video, Film, Settings } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";

export function AppHeader() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link href="/" className="brand-wordmark" aria-label="RecordMint home">
          RecordMint
        </Link>
        <nav className="header-nav" aria-label="Main navigation">
          <Link href="/record" className="nav-link">
            <Video size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Record</span>
          </Link>
          <Link href="/library" className="nav-link">
            <Film size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Library</span>
          </Link>
          <Link href="/settings" className="nav-link">
            <Settings size={16} strokeWidth={1.75} aria-hidden="true" />
            <span>Settings</span>
          </Link>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
