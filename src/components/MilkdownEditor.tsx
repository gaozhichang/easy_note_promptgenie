import React, { useEffect, useRef } from 'react';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import {
  imageInlineComponent,
  inlineImageConfig,
} from '@milkdown/kit/component/image-inline';
import { uploadConfig } from '@milkdown/kit/plugin/upload';
import { replaceAll } from '@milkdown/kit/utils';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import '../milkdown.css';
import {
  openExternal,
  readNoteImage,
  saveNoteImageData,
} from '../services/notes';

type MilkdownEditorProps = {
  body: string;
  notePath: string;
  onChange: (body: string) => void;
  onError: (message: string) => void;
};

const imageCache = new Map<string, Promise<string>>();

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

function resolveImage(notePath: string, src: string): Promise<string> {
  if (!src || /^(?:https?:|data:|blob:|asset:)/i.test(src)) {
    return Promise.resolve(src);
  }

  let relative = src;
  try {
    relative = decodeURIComponent(src);
  } catch {
    // 保留原始路径，交给后端校验
  }

  const key = `${notePath}\u0000${relative}`;
  const cached = imageCache.get(key);
  if (cached) return cached;

  const pending = readNoteImage(notePath, relative);
  imageCache.set(key, pending);
  void pending.catch(() => {
    if (imageCache.get(key) === pending) {
      imageCache.delete(key);
    }
  });
  return pending;
}

const MilkdownEditor: React.FC<MilkdownEditorProps> = ({
  body,
  notePath,
  onChange,
  onError,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const notePathRef = useRef(notePath);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const initialBodyRef = useRef(body);
  const crepeRef = useRef<Crepe | null>(null);
  const readyRef = useRef(false);
  const lastMarkdownRef = useRef(body);

  notePathRef.current = notePath;
  onChangeRef.current = onChange;
  onErrorRef.current = onError;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let initialized = false;

    const uploadImage = async (file: File): Promise<string> => {
      try {
        const dataUrl = await readFileAsDataUrl(file);
        return await saveNoteImageData(
          notePathRef.current,
          file.name || 'pasted-image.png',
          dataUrl
        );
      } catch (error) {
        onErrorRef.current(`插入图片失败：${String(error)}`);
        throw error;
      }
    };

    const crepe = new Crepe({
      root,
      defaultValue: initialBodyRef.current,
      features: {
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.ImageBlock]: false,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.CodeMirror]: false,
        [CrepeFeature.Latex]: false,
        [CrepeFeature.TopBar]: false,
        [CrepeFeature.AI]: false,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: '开始记录… 支持 Markdown，可直接粘贴图片',
          mode: 'block',
        },
      },
    });

    crepeRef.current = crepe;

    crepe.addFeature((editor) => {
      editor
        .config((ctx) => {
          ctx.update(inlineImageConfig.key, (prev) => ({
            ...prev,
            uploadButton: '上传',
            confirmButton: '确定',
            uploadPlaceholderText: '粘贴图片链接',
            onUpload: uploadImage,
            proxyDomURL: async (url) => {
              try {
                return await resolveImage(notePathRef.current, url);
              } catch {
                return url;
              }
            },
          }));
          ctx.update(uploadConfig.key, (prev) => ({
            ...prev,
            uploader: async (files, schema) => {
              const imageType = schema.nodes.image;
              if (!imageType) return [];
              const nodes = [];
              for (let index = 0; index < files.length; index += 1) {
                const file = files.item(index);
                if (!file || !file.type.startsWith('image/')) continue;
                const src = await uploadImage(file);
                const alt =
                  file.name.replace(/\.[^.]+$/, '').replace(/[\[\]]/g, '') ||
                  '图片';
                const node = imageType.createAndFill({ src, alt });
                if (node) nodes.push(node);
              }
              return nodes;
            },
          }));
        })
        .use(imageInlineComponent);
    });

    crepe.on((listener) => {
      listener.markdownUpdated((_ctx, markdown) => {
        if (disposed) return;
        if (!initialized) {
          initialized = true;
          if (markdown === initialBodyRef.current) {
            lastMarkdownRef.current = markdown;
            return;
          }
        }
        if (markdown === lastMarkdownRef.current) return;
        lastMarkdownRef.current = markdown;
        onChangeRef.current(markdown);
      });
    });

    void crepe
      .create()
      .then(() => {
        if (disposed) {
          void crepe.destroy();
          return;
        }
        readyRef.current = true;
      })
      .catch((error) => {
        if (!disposed) {
          onErrorRef.current(`编辑器加载失败：${String(error)}`);
        }
      });

    return () => {
      disposed = true;
      readyRef.current = false;
      crepeRef.current = null;
      void crepe.destroy();
    };
  }, []);

  useEffect(() => {
    if (!readyRef.current || !crepeRef.current) return;
    if (body === lastMarkdownRef.current) return;
    lastMarkdownRef.current = body;
    crepeRef.current.editor.action(replaceAll(body));
  }, [body]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;
    event.preventDefault();

    if (/^(?:https?:|mailto:)/i.test(href)) {
      void openExternal(href).catch((error) => {
        onErrorRef.current(`打开链接失败：${String(error)}`);
      });
    }
  };

  return (
    <div className="milkdown-host mt-3 min-h-0 flex-1" onClick={handleClick}>
      <div className="milkdown-editor-scroll h-full overflow-y-auto">
        <div ref={rootRef} />
      </div>
    </div>
  );
};

export default MilkdownEditor;
