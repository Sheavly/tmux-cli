/**
 * tmux's copy mode, which we add to. Checked against `ActionDef` where `ACTIONS` takes them in
 * (`registry.ts`), which is also where the file's length forced them out.
 */
export const COPY_MODE_ACTIONS = [
  { id: 'copyMode.selectLeft', keys: ['S-Left'], modes: ['copyMode'], description: 'select left' },
  {
    id: 'copyMode.selectRight',
    keys: ['S-Right'],
    modes: ['copyMode'],
    description: 'select right',
  },
  { id: 'copyMode.selectUp', keys: ['S-Up'], modes: ['copyMode'], description: 'select up' },
  { id: 'copyMode.selectDown', keys: ['S-Down'], modes: ['copyMode'], description: 'select down' },
  {
    id: 'copyMode.wordPrevious',
    keys: ['C-Left'],
    modes: ['copyMode'],
    description: 'jump a word back',
  },
  {
    id: 'copyMode.wordNext',
    keys: ['C-Right'],
    modes: ['copyMode'],
    description: 'jump a word forward',
  },
  {
    id: 'copyMode.selectWordPrevious',
    keys: ['C-S-Left'],
    modes: ['copyMode'],
    description: 'select a word back',
  },
  {
    id: 'copyMode.selectWordNext',
    keys: ['C-S-Right'],
    modes: ['copyMode'],
    description: 'select a word forward',
  },
  {
    id: 'copyMode.copy',
    keys: ['Enter', 'C-c'],
    modes: ['copyMode'],
    description: 'copy the selection and leave',
  },
  {
    id: 'copyMode.escape',
    keys: ['Escape'],
    modes: ['copyMode'],
    description: 'drop the selection, then leave',
  },
  { id: 'copyMode.quit', keys: ['q'], modes: ['copyMode'], description: 'leave' },
] as const;
