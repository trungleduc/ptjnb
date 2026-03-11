
import { RstToMdCompiler } from 'rst-compiler'

const compiler = new RstToMdCompiler();


class ConversionOptions {
    commentToken: string = "#";
    startDelimiters : string[] = ["# %%", "#%%", "########################"];
}


 
class PyToIpynbConverter {
    private options: ConversionOptions;

    constructor(options: ConversionOptions = new ConversionOptions()) {
        this.options = options;
    }


    trimStart(str: string): string {
        return str.replace(/^\s+/, "");
    }

    convert(source: string) {
        const cells: any[] = [];
        const doc = this.extractTopDocstring(source);

        if (doc) {
            cells.push({
                cell_type: "markdown",
                metadata: {},
                source: doc.markdown.split("\n").map((l:any) => l + "\n"),
            });
            source = doc.rest;
        }

        const blocks = this.splitInBlocks(source);

        for (const block of blocks) {
            if (block.type === "markdown") {
                cells.push({
                    cell_type: "markdown",
                    metadata: {},
                    source: block.lines.map((l) => l.replace(/^#\s?/, "") + "\n"),
                });
            } else {
                const processedLines = this.rstToMarkdown(block.lines);
                cells.push({
                    cell_type: "code",
                    execution_count: null,
                    metadata: {},
                    outputs: [],
                    source: processedLines.map((l) => l + "\n"),
                });
            }
        }

        return {
            nbformat: 4,
            nbformat_minor: 0,
            metadata: {
                kernelspec: {
                    name: "python3",
                    display_name: "Python 3",
                },
                language_info: {
                    name: "python",
                    version: "3.x",
                },
            },
            cells,
        };
    }

    private extractTopDocstring(source: string) {
        const trimmed = this.trimStart(source);

        const match = trimmed.match(
            /^(?:r?(?:'''|"""))([\s\S]*?)(?:'''|""")/
        );

        if (!match) {
            return null;
        }

        const fullMatch = match[0];
        const content = match[1];

        try{
            const markdown = compiler.compile(content).body;
            return {
                markdown,
                rest: source.slice(
                    source.indexOf(fullMatch) + fullMatch.length
                )
            };
        }
        catch(e){
            console.warn("Failed to compile docstring with rst-compiler, falling back to simple conversion. Error was:", e);
      

            // Convert underline-style headers to markdown headers
            let markdown = content
                .replace(/^\n|\n$/g, "");
            
            // Handle symmetric underlines (above and below)
            markdown = markdown.replace(/^([=\-]+)\n(.+)\n([=\-]+)\n/g, (_, underline1, text, underline2) => {
                if (underline1[0] === underline2[0]) {
                    const char = underline1[0];
                    const level = char === "=" ? "#" : "##";
                    return `${level} ${text}\n`;
                }
                return `${text}\n`;
            });
            
            // Handle single underline (below)
            markdown = markdown.replace(/\n(.+)\n([=\-]+)\n/g, (_, text, underline) => {
                const char = underline[0];
                const level = char === "=" ? "#" : "##";
                return `\n${level} ${text}\n`;
            });
            
            // Convert reStructuredText inline links to markdown links
            // Format: `text <url>`_ -> [text](url)
            markdown = markdown.replace(/`([^<]+)\s+<([^>]+)>`_/g, (_, text, url) => {
                return `[${text}](${url})`;
            });

            return {
                markdown,
                rest: source.slice(
                    source.indexOf(fullMatch) + fullMatch.length
                )
            };
        }
    }

    private isCellStartDelimeter(line: string): boolean {
        const trimmed = line.trim();
        for (const delimiter of this.options.startDelimiters) {
            if (trimmed.startsWith(delimiter)) {
                return true;
            }
        }  
        return false;
    }

    private whichCellTypeStartsHere(lines: string[], index: number): "markdown" | "code" {
        if (index + 1 >= lines.length) {
            return "code"; // by default, if no next line exists, treat as 
        }
        const nextLine = lines[index + 1];
        return nextLine.startsWith(this.options.commentToken) ? "markdown" : "code";
    }

    


    private splitInBlocks(source: string): { lines: string[]; type: "markdown" | "code" }[] {
        const lines = source.replace(/\r\n/g, "\n").split("\n");
        let isCurrentMarkdown = false;
        let blocks: { lines: string[]; type: "markdown" | "code" }[] = [];
        let currentBlock: { lines: string[]; type: "markdown" | "code" } = {
            lines: [],
            type: isCurrentMarkdown ? "markdown" : "code",
        };

        let lastLineWasBlockStart = false;
        for (let i = 0; i < lines.length; i++) {
            
            // check for implicit end of markdown block if we encounter a non-comment line
            if (isCurrentMarkdown && !lines[i].trim().startsWith(this.options.commentToken)) {
                isCurrentMarkdown = false;
                if (currentBlock.lines.length > 0) {
                    blocks.push(currentBlock);
                }
                currentBlock = {
                    // add the line if its not empty to avoid empty code cells at the start of the file
                    lines: lines[i].trim() === "" ? [] : [lines[i]],
                    type: "code",
                };
                lastLineWasBlockStart = false;
                continue; // skip the rest of the loop to avoid processing this line again
                //console.log(`started new code block ${currentBlock.lines}`);
            }


            if (this.isCellStartDelimeter(lines[i])) {
                    // store current block if it has content
                    if (currentBlock.lines.length > 0) {
                        blocks.push(currentBlock);
                    }

                    const cellType = this.whichCellTypeStartsHere(lines, i);
                    isCurrentMarkdown = cellType === "markdown";

                    // start new block
                    currentBlock = {
                        lines: [],
                        type: cellType
                    };
                lastLineWasBlockStart = true;
            }
            else
            {
                //if the last line as a start and the current line is empty, skip it to avoid empty lines at the start of a cell
                if (lastLineWasBlockStart && lines[i].trim() === "") {
                    continue;
                }
                // console.log(`Adding line to current block: ${lines[i]}`);
                currentBlock.lines.push(lines[i]); 
                lastLineWasBlockStart = false;
            }
        }
        // store last block if it has content
        if (currentBlock.lines.length > 0) {
            blocks.push(currentBlock);
        }
        return blocks;
    }

    private rstToMarkdown(lines: string[]): string[] {
        const markdownLines: string[] = [];
        let i = 0;

        while (i < lines.length) {
            let line = lines[i];

            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                if (/^=+$/.test(nextLine.trim())) {
                    markdownLines.push(`# ${line.trim()}`);
                    i += 2;
                    continue;
                } else if (/^-+$/.test(nextLine.trim())) {
                    markdownLines.push(`## ${line.trim()}`);
                    i += 2;
                    continue;
                }
            }

            line = line.replace(/`([^<]+)\s+<([^>]+)>`_/g, (_, text, url) => {
                return `[${text}](${url})`;
            });

            markdownLines.push(line);
            i++;
        }

        return markdownLines;
    }
}





export function pyToIpynb(
    source: string,
    options: ConversionOptions = new ConversionOptions()
) {
    const converter = new PyToIpynbConverter(options);
    return converter.convert(source);
}
