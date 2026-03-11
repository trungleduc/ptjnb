import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { IFileBrowserFactory } from '@jupyterlab/filebrowser';

import { pyToIpynb } from './convert';

const plugin: JupyterFrontEndPlugin<void> = {
  id: 'py-to-nb-frontend-only',
  autoStart: true,
  requires: [IFileBrowserFactory],
  activate: (
    app: JupyterFrontEnd,
    browserFactory: IFileBrowserFactory
  ) => {
    console.log('JupyterLab extension py-to-nb is activated!');
    
    const { commands, contextMenu } = app;
    const commandId = 'py-to-nb:convert';

    // FIX: Removed .defaultBrowser fallback as it does not exist in JLab 4.x
    const getCurrentBrowser = () => {
      return browserFactory.tracker.currentWidget;
    };

    commands.addCommand(commandId, {
      label: 'Convert to Notebook',
      iconClass: 'jp-MaterialIcon jp-NotebookIcon',
      isVisible: () => {
        const browser = getCurrentBrowser();
        if (!browser) return false;

        const selection = browser.selectedItems();
        const first = selection.next();
        
        // Check if we have exactly one item and it is a python file
        if (first.done || !first.value) return false;
        
        return first.value.path.endsWith('.py');
      },
      execute: async () => {
        const browser = getCurrentBrowser();
        if (!browser) return;

        const selection = browser.selectedItems();
        const first = selection.next();
        
        if (first.done || !first.value) return;
        
        const item = first.value;
        const contents = app.serviceManager.contents;

        try {
          // 1. Read the .py file
          const model = await contents.get(item.path, {
            type: 'file',
            format: 'text',
            content: true
          });

          const source = model.content as string;

          // 2. Convert logic
          const notebook = pyToIpynb(source);

          // 3. Write new .ipynb
          const newPath = item.path.replace(/\.py$/, '.ipynb');

          await contents.save(newPath, {
            type: 'notebook',
            format: 'json',
            content: notebook
          });

          // 4. Open the new notebook
          await app.commands.execute('docmanager:open', {
            path: newPath
          });
          
        } catch (error) {
          console.error('Failed to convert file:', error);
        }
      }
    });

    // Right-click menu entry
    contextMenu.addItem({
      command: commandId,
      selector: '.jp-DirListing-item[data-isdir="false"]',
      rank: 10
    });
  }
};

export default plugin;