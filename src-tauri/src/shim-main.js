// Puentes que solo tiene la ventana principal: las vistas nunca escriben respaldos.
(() => {
  if (window.__modeladorShimMain) return;
  window.__modeladorShimMain = true;

  const invoke = (command, args) => window.__TAURI__.core.invoke(command, args);
  const handlers = (window.__modeladorBridges = window.__modeladorBridges || {});
  const pending = new Set();
  let lastWritten = null;

  window.__modeladorNativeBackup = true;
  handlers.backup = {
    postMessage: (message) => {
      const action = String(message?.action ?? '');
      const payload = message?.payload == null ? null : String(message.payload);
      // El cierre dispara el respaldo dos veces (el aviso de Rust y el pagehide
      // real): un contenido idéntico al último no gasta un lugar de la rotación.
      if (action === 'write' && lastWritten !== null && lastWritten.payload === payload) {
        return Promise.resolve(lastWritten.reply);
      }
      const call = invoke('backup', { action, payload }).then((reply) => {
        if (action === 'write') lastWritten = { payload, reply };
        return reply;
      });
      pending.add(call);
      call.catch(() => undefined).finally(() => pending.delete(call));
      return call;
    },
  };

  // Propuestas de Claude: listar las pendientes y borrar la que se resolvió.
  window.__modeladorClaudeProposals = true;
  handlers.claude = {
    postMessage: (message) => invoke('claude_proposals', {
      action: String(message?.action ?? ''),
      file: message?.file == null ? null : String(message.file),
    }),
  };

  const settle = () => Promise.allSettled([...pending]);

  // Rust llama a esto al pedir cerrar la principal: se guarda lo pendiente
  // (los oyentes de pagehide de la app), se espera el respaldo y recién ahí se cierra.
  // Si ya había un respaldo en curso, la app ignora el pedido nuevo; por eso se
  // espera ese y se pide otra vez, con el estado más reciente.
  const flushAndBackUp = async () => {
    window.dispatchEvent(new Event('modelador:flush-drafts'));
    for (let round = 0; round < 2; round += 1) {
      window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted: false }));
      await new Promise((resolve) => setTimeout(resolve, 0));
      await settle();
      // Que la app termine de soltar su marca de "respaldo en curso".
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };

  window.__modeladorPrepareClose = async () => {
    try {
      await Promise.race([flushAndBackUp(), new Promise((resolve) => setTimeout(resolve, 5000))]);
    } finally {
      await invoke('main_ready_to_close');
    }
  };

  window.__modeladorCheckStorage = () => {
    let valid = false;
    try {
      localStorage.setItem('__desktop_storage_test__', 'ok');
      valid = localStorage.getItem('__desktop_storage_test__') === 'ok';
      localStorage.removeItem('__desktop_storage_test__');
    } catch {
      valid = false;
    }
    if (!valid) {
      window.alert('No se puede guardar localmente.\n\nLa aplicación abrió correctamente, pero Windows no habilitó el almacenamiento persistente. Exportá tus proyectos como JSON antes de cerrar.');
    }
  };
})();
