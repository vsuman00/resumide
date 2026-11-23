import type { ReactNode } from "react";
import { Link } from "react-router";
import SiteNavigation from "./SiteNavigation";
import BrandLockup from "~/components/BrandLockup";

const PublicShell = ({ children }: { children: ReactNode }) => {
  return (
    <div className="public-shell">
      <SiteNavigation />
      {children}
      <footer className="public-footer">
        <div>
          <Link to="/" className="workspace-brand" aria-label="Resumide home">
            <BrandLockup />
          </Link>
          <p>Evidence before edits. Clarity before confidence.</p>
        </div>
        <nav aria-label="Footer navigation">
          <Link to="/#product">Product</Link>
          <Link to="/#scoring">Scoring</Link>
          <Link to="/privacy">Privacy</Link>
        </nav>
      </footer>
    </div>
  );
};

export default PublicShell;
