import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

export interface Note {
  path: string;
  fileName: string;
  title: string;
  preview: string;
  content: string;
  updatedAt: number;
  createdAt: number;
  size: number;
}

export interface SettingsInfo {
  notesDir: string;
  defaultNotesDir: string;
  isCustom: boolean;
}

export function listNotes(): Promise<Note[]> {
  return invoke<Note[]>('list_notes');
}

export function createNote(): Promise<Note> {
  return invoke<Note>('create_note');
}

export function saveNote(path: string, content: string): Promise<Note> {
  return invoke<Note>('save_note', { path, content });
}

export function deleteNote(path: string): Promise<void> {
  return invoke<void>('delete_note', { path });
}

export function getSettings(): Promise<SettingsInfo> {
  return invoke<SettingsInfo>('get_settings');
}

export function setNotesDir(dir: string): Promise<SettingsInfo> {
  return invoke<SettingsInfo>('set_notes_dir', { dir });
}

export function resetNotesDir(): Promise<SettingsInfo> {
  return invoke<SettingsInfo>('reset_notes_dir');
}

export function revealNote(path: string): Promise<void> {
  return invoke<void>('reveal_note', { path });
}

export function openNotesDir(): Promise<void> {
  return invoke<void>('open_notes_dir');
}

export function insertNoteImage(notePath: string, sourcePath: string): Promise<string> {
  return invoke<string>('insert_note_image', { notePath, sourcePath });
}

export function saveNoteImageData(
  notePath: string,
  fileName: string,
  dataUrl: string
): Promise<string> {
  return invoke<string>('save_note_image_data', { notePath, fileName, dataUrl });
}

export function readNoteImage(notePath: string, src: string): Promise<string> {
  return invoke<string>('read_note_image', { notePath, src });
}

export function openExternal(url: string): Promise<void> {
  return invoke<void>('open_external', { url });
}

export async function chooseImageFile(): Promise<string | null> {
  const selected = await open({
    multiple: false,
    title: '选择图片',
    filters: [
      {
        name: '图片',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif', 'heic', 'heif'],
      },
    ],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function chooseNotesDir(defaultPath?: string): Promise<string | null> {
  const selected = await open({
    directory: true,
    multiple: false,
    title: '选择笔记保存目录',
    defaultPath: defaultPath || undefined,
  });
  return typeof selected === 'string' ? selected : null;
}

/** 文件内容的第一行是标题，其余是正文。 */
export function splitNote(content: string): { title: string; body: string } {
  const lineBreak = content.indexOf('\n');
  if (lineBreak === -1) {
    return { title: content, body: '' };
  }
  return {
    title: content.slice(0, lineBreak),
    body: content.slice(lineBreak + 1),
  };
}

export function composeNote(title: string, body: string): string {
  const safeTitle = title.replace(/[\r\n]+/g, ' ');
  if (!body) {
    return safeTitle;
  }
  return `${safeTitle}\n${body}`;
}
