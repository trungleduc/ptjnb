import type { Contents } from '@jupyterlab/services';
import type { Notebook } from 'plainb';
import { PARSERS } from './parsers';
import type { IRule, IKernelspec } from './parsers';

export const DEFAULT_KERNELSPEC: IKernelspec = {
  name: 'xpython',
  display_name: 'Python 3.13 (XPython)',
  language: 'python'
};

export function extractKernelspecFromText(text: string): IKernelspec | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');

  const isCommentStyle = !!lines[0]?.match(/^#\s*---\s*$/);
  const isFrontMatter = lines[0]?.trim() === '---';
  if (!isCommentStyle && !isFrontMatter) {
    return null;
  }

  const headerLines: string[] = [];
  let closed = false;
  for (let i = 1; i < lines.length; i++) {
    if (isCommentStyle) {
      if (lines[i].match(/^#\s*---\s*$/)) {
        closed = true;
        break;
      }
      if (!lines[i].startsWith('#')) {
        break;
      }
      headerLines.push(lines[i].replace(/^#\s?/, ''));
    } else {
      if (lines[i].trim() === '---') {
        closed = true;
        break;
      }
      headerLines.push(lines[i]);
    }
  }
  if (!closed) {
    return null;
  }

  let inKernelspec = false;
  let ksIndent = 0;
  const ks: Record<string, string> = {};
  for (const line of headerLines) {
    if (line.trim() === '') {
      continue;
    }
    const indent = (line.match(/^(\s*)/) as RegExpMatchArray)[1].length;
    const content = line.trim();
    if (content === 'kernelspec:') {
      inKernelspec = true;
      ksIndent = indent;
      continue;
    }
    if (inKernelspec) {
      if (indent <= ksIndent && content !== '') {
        break;
      }
      const m = content.match(/^(\w+):\s*(.+)$/);
      if (m) {
        ks[m[1]] = m[2];
      }
    }
  }
  if (ks.name && ks.display_name && ks.language) {
    return ks as unknown as IKernelspec;
  }
  return null;
}

export async function convertFile(
  contents: Contents.IManager,
  filePath: string,
  parser: (text: string) => object,
  defaultKernelspec?: IKernelspec
): Promise<void> {
  const model = await contents.get(filePath, {
    type: 'file',
    format: 'text',
    content: true
  });
  const text = model.content as string;
  const notebook = parser(text) as any;
  if (!notebook.metadata?.kernelspec) {
    notebook.metadata = notebook.metadata ?? {};
    const kernelspec =
      extractKernelspecFromText(text) ??
      defaultKernelspec ??
      DEFAULT_KERNELSPEC;
    notebook.metadata.kernelspec = kernelspec;
    if (!notebook.metadata.language_info) {
      notebook.metadata.language_info = { name: kernelspec.language };
    }
  }
  const notebookPath = filePath.replace(/\.(py|md)$/, '.ipynb');
  await contents.save(notebookPath, {
    type: 'notebook',
    format: 'json',
    content: notebook
  });
}

/**
 * Convert a .ipynb notebook to a plain text format using a serializer.
 */
export async function convertNotebookToPlainText(
  contents: Contents.IManager,
  notebookPath: string,
  serializer: (notebook: Notebook) => string,
  targetExtension: string
): Promise<void> {
  const model = await contents.get(notebookPath, {
    type: 'notebook',
    format: 'json',
    content: true
  });
  const notebook = model.content as any;

  // Normalize cell sources to string[] as expected by plainb serializers.
  // The contents API may return source as either string or string[].
  if (notebook.cells) {
    for (const cell of notebook.cells) {
      if (typeof cell.source === 'string') {
        const lines = cell.source.split('\n');
        cell.source = lines.map((line: string, i: number) =>
          i < lines.length - 1 ? line + '\n' : line
        );
        if (
          cell.source.length > 1 &&
          cell.source[cell.source.length - 1] === ''
        ) {
          cell.source.pop();
        }
      }
    }
  }

  const text = serializer(notebook as Notebook);
  const plainPath = notebookPath.replace(/\.ipynb$/, targetExtension);
  await contents.save(plainPath, {
    type: 'file',
    format: 'text',
    content: text
  });
}

export async function convertIfMissing(
  contents: Contents.IManager,
  filePath: string,
  parser: (text: string) => object,
  defaultKernelspec?: IKernelspec
): Promise<void> {
  const notebookPath = filePath.replace(/\.(py|md)$/, '.ipynb');
  try {
    await contents.get(notebookPath, { content: false });
    return;
  } catch {
    /* empty */
  }
  try {
    await convertFile(contents, filePath, parser, defaultKernelspec);
  } catch (e) {
    console.error(`ptjnb: failed to convert "${filePath}"`, e);
  }
}

async function walkDir(
  contents: Contents.IManager,
  path: string,
  parser: (text: string) => object,
  defaultKernelspec?: IKernelspec
): Promise<void> {
  let dir: Contents.IModel;
  try {
    dir = await contents.get(path, { content: true });
  } catch {
    console.warn(`ptjnb: directory not found "${path}"`);
    return;
  }
  if (dir.type !== 'directory') {
    return;
  }
  for (const item of dir.content as Contents.IModel[]) {
    if (item.type === 'directory') {
      await walkDir(contents, item.path, parser, defaultKernelspec);
    } else if (
      item.type === 'file' &&
      (item.name.endsWith('.py') || item.name.endsWith('.md'))
    ) {
      await convertIfMissing(contents, item.path, parser, defaultKernelspec);
    }
  }
}

export async function autoConvert(
  contents: Contents.IManager,
  rules: IRule[],
  defaultKernelspec?: IKernelspec
): Promise<void> {
  for (const rule of rules) {
    const parser = PARSERS[rule.parser];
    if (!parser) {
      console.warn(`ptjnb: unknown parser "${rule.parser}"`);
      continue;
    }
    await walkDir(contents, rule.dir, parser, defaultKernelspec);
  }
}
