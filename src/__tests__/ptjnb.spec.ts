/**
 * Example of [Jest](https://jestjs.io/docs/getting-started) unit tests
 */

import { pyToIpynb } from "../convert";







describe("ptjnb", () => {
  it("creates a valid notebook skeleton", () => {
    const nb = pyToIpynb("");

    expect(nb.nbformat).toBe(4);
    expect(Array.isArray(nb.cells)).toBe(true);
  });

  it("creates a single code cell when no markers are present", () => {
    const nb = pyToIpynb("x = 1\nprint(x)");

    expect(nb.cells).toHaveLength(1);
    expect(nb.cells[0].cell_type).toBe("code");
    expect(nb.cells[0].source.join("")).toContain("print(x)");
  });


  it("detects markdown-only cells", () => {
    const nb = pyToIpynb(`
# %%
# This is markdown
# More text
`.trim());

    const cell = nb.cells[0];
    expect(cell.cell_type).toBe("markdown");
    expect(cell.source.join("")).toContain("This is markdown");
  });

  it("keeps mixed content as code", () => {
    const nb = pyToIpynb(`
# %%
# This is a comment

x = 42
`.trim());
    
    // expect 2 cells
    expect(nb.cells).toHaveLength(2);

    const cell = nb.cells[0];
    expect(cell.cell_type).toBe("markdown");
    expect(cell.source.join("")).toContain("This is a comment");

    const cell2 = nb.cells[1];
    expect(cell2.cell_type).toBe("code");
    expect(cell2.source.join("")).toContain("x = 42");
  });

  it("produces executable code cells with no outputs", () => {
    const nb = pyToIpynb("print('hello')");

    const cell = nb.cells[0];
    expect(cell.cell_type).toBe("code");
    expect(cell.execution_count).toBeNull();
    expect(cell.outputs).toEqual([]);
  });



  it("consecutive code cells", () => {
    const nb = pyToIpynb(`
# %%
# This is markdown
# More text

# %%
print("This is code")

# %%

print("This is more code")
`.trim());


      // expect 3 cells
      expect(nb.cells).toHaveLength(3);

      const cell1 = nb.cells[0];
      expect(cell1.cell_type).toBe("markdown");
      expect(cell1.source.join("")).toContain("This is markdown");

      const cell2 = nb.cells[1];
      expect(cell2.cell_type).toBe("code");
      expect(cell2.source.join("")).toContain('print("This is code")');

      const cell3 = nb.cells[2];
      expect(cell3.cell_type).toBe("code");
      expect(cell3.source.join("")).toContain('print("This is more code")');
  });



    



    

});