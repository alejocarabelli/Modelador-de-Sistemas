import { Component, type ErrorInfo, type ReactNode } from 'react';

type ArtifactErrorBoundaryProps = {
  children: ReactNode;
  onExportProject: () => void;
  onCopyProject?: () => void;
};

type ArtifactErrorBoundaryState = {
  error: Error | null;
};

/**
 * Keeps one broken editor from taking the whole app down: the sidebar and the
 * tabs keep working, and the card offers a retry or the project export.
 * Mount it with the artifact's key, so switching artifacts starts clean.
 */
export class ArtifactErrorBoundary extends Component<ArtifactErrorBoundaryProps, ArtifactErrorBoundaryState> {
  state: ArtifactErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ArtifactErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Artifact editor failed to render', error, info.componentStack);
  }

  private readonly retry = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (error === null) return this.props.children;

    return (
      <div className="artifact-error">
        <section className="canvas-start-card artifact-error-card" role="alert">
          <h3>No se pudo mostrar este artefacto</h3>
          <p>Tus datos siguen guardados. Probá de nuevo o exportá el proyecto para no perder nada.</p>
          {error.message ? <p className="artifact-error-detail">{error.message}</p> : null}
          <div>
            <button className="secondary-action" type="button" onClick={this.retry}>Probar de nuevo</button>
            <button className="primary-action" type="button" onClick={this.props.onExportProject}>Exportar proyecto (JSON)</button>
            {this.props.onCopyProject ? (
              <button className="secondary-action" type="button" onClick={this.props.onCopyProject}>Copiar proyecto (JSON)</button>
            ) : null}
          </div>
        </section>
      </div>
    );
  }
}
