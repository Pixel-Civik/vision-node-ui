// @vitest-environment node
import { expect, it } from "vitest";
import ExcelJS from "exceljs";
import { createRequire } from "node:module";
it("writes and reads exported values using the patched CommonJS UUID dependency", async () => {
  const require = createRequire(import.meta.url);
  const excelRequire = createRequire(require.resolve("exceljs"));
  expect(excelRequire("uuid").v4()).toMatch(/^[0-9a-f-]{36}$/);
  const book = new ExcelJS.Workbook();
  book.addWorksheet("TIZ_Por_Zona").addRows([["Zona", "Registros"], ["Lácteos", 6001]]);
  const buffer = await book.xlsx.writeBuffer();
  const reread = new ExcelJS.Workbook();
  await reread.xlsx.load(buffer);
  expect(reread.getWorksheet("TIZ_Por_Zona")?.getRow(2).getCell(2).value).toBe(6001);
});
