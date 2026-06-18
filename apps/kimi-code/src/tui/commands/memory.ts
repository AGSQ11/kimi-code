import { MemoryListDialogComponent } from '../components/dialogs/memory-list';
import { formatErrorMessage } from '../utils/event-payload';
import type { SlashCommandHost } from './dispatch';

export async function handleMemoryCommand(host: SlashCommandHost, args: string): Promise<void> {
  const session = host.session;
  if (session === undefined) {
    host.showError('No active session.');
    return;
  }

  const trimmed = args.trim().toLowerCase();
  const tokens = trimmed.split(/\s+/).filter((t) => t.length > 0);
  const subcommand = tokens[0] ?? 'list';

  try {
    switch (subcommand) {
      case 'list':
        await showMemoryList(host, session);
        return;
      case 'delete':
        await deleteMemoryById(host, session, tokens[1]);
        return;
      case 'pin':
        await pinMemoryById(host, session, tokens[1], true);
        return;
      case 'unpin':
        await pinMemoryById(host, session, tokens[1], false);
        return;
      default:
        host.showError(`Unknown /memory subcommand: ${subcommand}. Use list, delete, pin, or unpin.`);
    }
  } catch (error) {
    host.showError(formatErrorMessage(error));
  }
}

async function showMemoryList(host: SlashCommandHost, session: NonNullable<SlashCommandHost['session']>): Promise<void> {
  host.showStatus('Loading memories...', 'primary');
  host.track('input_command', { command: 'memory', subcommand: 'list' });

  const memories = await session.listMemories();

  host.mountEditorReplacement(
    new MemoryListDialogComponent({
      memories,
      onSelect: (selection) => {
        host.restoreEditor();
        void handleListSelection(host, session, selection);
      },
      onClose: () => {
        host.restoreEditor();
      },
    }),
  );
}

async function handleListSelection(
  host: SlashCommandHost,
  session: NonNullable<SlashCommandHost['session']>,
  selection: { action: 'pin' | 'unpin' | 'delete'; memoryId: string },
): Promise<void> {
  switch (selection.action) {
    case 'pin':
      await pinMemoryById(host, session, selection.memoryId, true);
      break;
    case 'unpin':
      await pinMemoryById(host, session, selection.memoryId, false);
      break;
    case 'delete':
      await deleteMemoryById(host, session, selection.memoryId);
      break;
  }
}

async function deleteMemoryById(
  host: SlashCommandHost,
  session: NonNullable<SlashCommandHost['session']>,
  id: string | undefined,
): Promise<void> {
  if (id === undefined || id.length === 0) {
    host.showError('Usage: /memory delete <id>');
    return;
  }

  host.track('input_command', { command: 'memory', subcommand: 'delete' });
  const deleted = await session.deleteMemory(id);
  if (deleted) {
    host.showStatus(`Deleted memory ${id}.`, 'success');
  } else {
    host.showError(`Memory ${id} not found.`);
  }
}

async function pinMemoryById(
  host: SlashCommandHost,
  session: NonNullable<SlashCommandHost['session']>,
  id: string | undefined,
  pinned: boolean,
): Promise<void> {
  if (id === undefined || id.length === 0) {
    host.showError(`Usage: /memory ${pinned ? 'pin' : 'unpin'} <id>`);
    return;
  }

  host.track('input_command', { command: 'memory', subcommand: pinned ? 'pin' : 'unpin' });
  const memory = await session.pinMemory(id, pinned);
  if (memory !== undefined) {
    host.showStatus(`${pinned ? 'Pinned' : 'Unpinned'} memory ${id}.`, 'success');
  } else {
    host.showError(`Memory ${id} not found.`);
  }
}
