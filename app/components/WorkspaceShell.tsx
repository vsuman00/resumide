import type { ReactNode } from "react";
import SiteNavigation from "./SiteNavigation";
import styles from "./WorkspaceShell.module.css";

interface WorkspaceShellProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

const WorkspaceShell = ({
  eyebrow,
  title,
  description,
  action,
  children,
}: WorkspaceShellProps) => {
  return (
    <div className={`workspace-shell ${styles.shell}`}>
      <SiteNavigation />

      <main className={`workspace-stage ${styles.stage}`}>
        <div className="workspace-page-header">
          <div className="workspace-page-heading">
            {eyebrow ? <p className="workspace-eyebrow">{eyebrow}</p> : null}
            <h1>{title}</h1>
            {description ? (
              <p className="workspace-page-description">{description}</p>
            ) : null}
          </div>
          {action ? (
            <div className="workspace-page-action">{action}</div>
          ) : null}
        </div>
        <div className="workspace-main">{children}</div>
      </main>
    </div>
  );
};

export default WorkspaceShell;
