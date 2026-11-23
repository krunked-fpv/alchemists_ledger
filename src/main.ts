import './styles/studio.css';
import { VaultManager } from './vault/index';
import { ApothecaryStudioApp } from './ui/studio_app';

async function bootstrapStudio(): Promise<void> {
  const root = document.getElementById('studio-root');
  if (!root) {
    return;
  }

  const vault = new VaultManager();
  const todayDateSeed = new Date().toISOString().slice(0, 10);
  const boot = await vault.boot(todayDateSeed);

  if (boot.healedFrom === 'fresh') {
    await vault.save(boot.state);
  }

  const app = new ApothecaryStudioApp(root, vault, boot.state);

  window.addEventListener('beforeunload', () => {
    app.dispose();
  });
}

void bootstrapStudio();
